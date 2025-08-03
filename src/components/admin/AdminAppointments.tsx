'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, ChevronDown, ChevronRight } from 'lucide-react';

interface Appointment {
  id: number;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'canceled';
  cancellation_reason?: string;
  individual: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone_number?: string;
    bio?: string;
    physical_address?: string;
    visit_recipient_type?: string;
    relationship_to_recipient?: string;
    dependant_name?: string;
  };
  volunteer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone_number?: string;
    dogs: Array<{
      id: number;
      dog_name: string;
      dog_breed?: string;
    }>;
  };
}

interface AppointmentSection {
  title: string;
  appointments: Appointment[];
  loading: boolean;
  hasMore: boolean;
  page: number;
}

type SectionKey = 'nextWeek' | 'future' | 'past';

export default function AdminAppointments() {
  const [sections, setSections] = useState<{
    nextWeek: AppointmentSection;
    future: AppointmentSection;
    past: AppointmentSection;
  }>({
    nextWeek: { title: 'Appointments in the next 7 days', appointments: [], loading: true, hasMore: false, page: 1 },
    future: { title: 'Future appointments', appointments: [], loading: true, hasMore: false, page: 1 },
    past: { title: 'Past appointments', appointments: [], loading: true, hasMore: false, page: 1 },
  });

  // Update section titles based on active tab
  const getSectionTitle = (sectionKey: SectionKey) => {
    const baseTitles = {
      nextWeek: 'Appointments in the next 7 days',
      future: 'Future appointments',
      past: 'Past appointments'
    };
    
    if (activeTab === 'past') {
      return baseTitles[sectionKey].replace('appointments', 'past appointments');
    }
    return baseTitles[sectionKey];
  };
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'canceled'>('all');
  const [hideCanceled, setHideCanceled] = useState(false);
  const [expandedAppointments, setExpandedAppointments] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    loadAppointments();
  }, [statusFilter, activeTab]);

  const loadAppointments = async (section?: SectionKey, loadMore = false) => {
    const sectionsToLoad = section ? [section] : 
      activeTab === 'upcoming' ? ['nextWeek', 'future'] as const : ['past'] as const;
    
    for (const sectionKey of sectionsToLoad) {
      const currentSection = sections[sectionKey];
      const page = loadMore ? currentSection.page + 1 : 1;
      
      setSections(prev => ({
        ...prev,
        [sectionKey]: { ...prev[sectionKey], loading: true }
      }));

      try {
        const params = new URLSearchParams({
          section: sectionKey,
          status: statusFilter,
          page: page.toString()
        });

        const response = await fetch(`/api/admin/appointments?${params}`);
        const result = await response.json();

        console.log(`[AdminAppointments] ${sectionKey} API result:`, result);
        if (result.debug) {
          console.log(`[AdminAppointments] ${sectionKey} Debug info:`, result.debug);
        }

        if (!response.ok) {
          throw new Error(result.error || 'Failed to fetch appointments');
        }

        setSections(prev => ({
          ...prev,
          [sectionKey]: {
            ...prev[sectionKey],
            appointments: loadMore ? [...prev[sectionKey].appointments, ...result.appointments] : result.appointments,
            loading: false,
            hasMore: result.hasMore,
            page
          }
        }));
      } catch (error) {
        console.error(`Error loading ${sectionKey} appointments:`, error);
        setSections(prev => ({
          ...prev,
          [sectionKey]: { ...prev[sectionKey], loading: false }
        }));
      }
    }
  };

  const toggleExpanded = (appointmentId: number) => {
    setExpandedAppointments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(appointmentId)) {
        newSet.delete(appointmentId);
      } else {
        newSet.add(appointmentId);
      }
      return newSet;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    };
  };

  const filteredAppointments = (appointments: Appointment[]) => {
    let filtered = appointments;
    
    console.log(`[filteredAppointments] Total appointments: ${appointments.length}`);
    console.log(`[filteredAppointments] hideCanceled: ${hideCanceled}`);
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(apt => 
        apt.individual?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        apt.individual?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        apt.volunteer?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        apt.volunteer?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        apt.volunteer?.dogs?.some(dog => 
          dog.dog_name.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
      console.log(`[filteredAppointments] After search filter: ${filtered.length}`);
    }
    
    // Apply hide canceled filter
    if (hideCanceled) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(apt => apt.status !== 'canceled');
      const afterCount = filtered.length;
      console.log(`[filteredAppointments] Hide canceled: ${beforeCount} -> ${afterCount} (removed ${beforeCount - afterCount})`);
    }
    
    console.log(`[filteredAppointments] Final filtered count: ${filtered.length}`);
    return filtered;
  };

  const renderAppointmentCard = (appointment: Appointment) => {
    const { date, time } = formatDateTime(appointment.start_time);
    const isExpanded = expandedAppointments.has(appointment.id);
    const dogName = appointment.volunteer?.dogs?.[0]?.dog_name || 'Unknown Dog';

    return (
      <div key={appointment.id} className="border border-gray-200 rounded-lg mb-3">
        {/* Collapsed View */}
        <div className="p-4 cursor-pointer hover:bg-gray-50" onClick={() => toggleExpanded(appointment.id)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500 w-24">{date}</div>
              <div className="text-sm font-medium w-16">{time}</div>
              <div className="flex-1">
                <div className="flex items-center space-x-6">
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Individual</div>
                    <div className="font-medium">
                      {appointment.individual?.first_name} {appointment.individual?.last_name}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Volunteer</div>
                    <div className="font-medium">
                      {appointment.volunteer?.first_name} {appointment.volunteer?.last_name}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Dog</div>
                    <div className="font-medium">{dogName}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(appointment.status)}`}>
                {appointment.status}
              </span>
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {/* Expanded View */}
        {isExpanded && (
          <div className="border-t border-gray-200 p-4 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Individual Details</h4>
                <p><span className="font-medium">Name:</span> {appointment.individual?.first_name} {appointment.individual?.last_name}</p>
                <p><span className="font-medium">Email:</span> {appointment.individual?.email}</p>
                {appointment.individual?.phone_number && (
                  <p><span className="font-medium">Phone:</span> {appointment.individual.phone_number}</p>
                )}
                
                {/* Dependent Information */}
                {appointment.individual?.visit_recipient_type === 'other' && (
                  <div className="mt-3">
                    <p className="font-medium text-gray-700 mb-1">Visit Recipient</p>
                    {appointment.individual.dependant_name && (
                      <p><span className="font-medium">Name:</span> {appointment.individual.dependant_name}</p>
                    )}
                    {appointment.individual.relationship_to_recipient && (
                      <p><span className="font-medium">Relationship:</span> {appointment.individual.relationship_to_recipient}</p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Volunteer Details</h4>
                <p><span className="font-medium">Name:</span> {appointment.volunteer?.first_name} {appointment.volunteer?.last_name}</p>
                <p><span className="font-medium">Email:</span> {appointment.volunteer?.email}</p>
                {appointment.volunteer?.phone_number && (
                  <p><span className="font-medium">Phone:</span> {appointment.volunteer.phone_number}</p>
                )}
                
                {/* Therapy Dog Section */}
                <div className="mt-3">
                  <p className="font-medium text-gray-700 mb-1">Therapy Dog</p>
                  <p><span className="font-medium">Dog:</span> {dogName}</p>
                  {appointment.volunteer?.dogs?.[0]?.dog_breed && (
                    <p><span className="font-medium">Breed:</span> {appointment.volunteer.dogs[0].dog_breed}</p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Visit Information - Spans both columns */}
            {(appointment.individual?.bio || appointment.individual?.physical_address) && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Visit Information</h4>
                <div className="space-y-3">
                  {appointment.individual?.bio && (
                    <div>
                      <p className="font-medium text-gray-700 mb-1">Reason for Visit:</p>
                      <p className="text-gray-600 italic">"{appointment.individual.bio}"</p>
                    </div>
                  )}
                  {appointment.individual?.physical_address && (
                    <div>
                      <p className="font-medium text-gray-700 mb-1">Visit Location:</p>
                      <p className="text-gray-600 italic">"{appointment.individual.physical_address}"</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {appointment.cancellation_reason && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                <p className="font-medium text-red-800">Cancellation Reason:</p>
                <p className="text-red-700">{appointment.cancellation_reason}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSection = (sectionKey: SectionKey) => {
    const section = sections[sectionKey];
    const filtered = filteredAppointments(section.appointments);

    return (
      <div key={sectionKey} className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{getSectionTitle(sectionKey)}</h3>
          {section.loading && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>
        
        {filtered.length === 0 && !section.loading ? (
          <p className="text-gray-500 italic">No appointments found</p>
        ) : (
          <>
            {filtered.map(renderAppointmentCard)}
            {section.hasMore && (
              <Button
                variant="outline"
                onClick={() => loadAppointments(sectionKey, true)}
                disabled={section.loading}
                className="w-full mt-4"
              >
                {section.loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Load More
              </Button>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">All Appointments</h2>
        
        {/* Tab Navigation */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'upcoming'
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Upcoming Appointments
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`px-4 py-2 text-sm font-medium rounded-colors ${
                activeTab === 'past'
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Past Appointments
            </button>
          </div>
          
          {/* Hide Canceled Checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="hideCanceled"
              checked={hideCanceled}
              onChange={(e) => {
                console.log(`[Checkbox] Changing hideCanceled from ${hideCanceled} to ${e.target.checked}`);
                setHideCanceled(e.target.checked);
              }}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
            />
            <label htmlFor="hideCanceled" className="ml-2 text-sm font-medium text-gray-700">
              Hide canceled appointments
            </label>
          </div>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by name or dog..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={() => loadAppointments()} variant="outline">
            Refresh
          </Button>
        </div>
      </div>

      {/* Appointment Sections */}
      {activeTab === 'upcoming' && (
        <>
          {renderSection('nextWeek')}
          {renderSection('future')}
        </>
      )}
      {activeTab === 'past' && (
        <>
          {renderSection('past')}
        </>
      )}
    </div>
  );
}
