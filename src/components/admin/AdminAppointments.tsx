'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, ChevronDown, ChevronRight } from 'lucide-react';

interface Appointment {
  id: number;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'cancelled';
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
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
    if (!searchTerm) return appointments;
    
    return appointments.filter(apt => 
      apt.individual?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apt.individual?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apt.volunteer?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apt.volunteer?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apt.volunteer?.dogs?.some(dog => 
        dog.dog_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
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
                    <div className="text-sm text-gray-600">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Dog:</span> {dogName}
                    </div>
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
            {/* Appointment Details - Prominently Displayed */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">Appointment Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <p><span className="font-medium">Date:</span> {formatDateTime(appointment.start_time).date}</p>
                <p><span className="font-medium">Time:</span> {formatDateTime(appointment.start_time).time}</p>
                <p><span className="font-medium">Duration:</span> {Math.round((new Date(appointment.end_time).getTime() - new Date(appointment.start_time).getTime()) / (1000 * 60))} minutes</p>
                <p><span className="font-medium">Status:</span> <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(appointment.status)}`}>{appointment.status}</span></p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Individual Details</h4>
                <p><span className="font-medium">Name:</span> {appointment.individual?.first_name} {appointment.individual?.last_name}</p>
                <p><span className="font-medium">Email:</span> {appointment.individual?.email}</p>
                {appointment.individual?.phone_number && (
                  <p><span className="font-medium">Phone:</span> {appointment.individual.phone_number}</p>
                )}
                
                {/* Dependent Information */}
                {appointment.individual?.visit_recipient_type && (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="font-medium text-yellow-800">Visit Recipient:</p>
                    <p className="text-yellow-700">
                      {appointment.individual.visit_recipient_type === 'self' ? 'Self' : 'Other'}
                      {appointment.individual.visit_recipient_type === 'other' && appointment.individual.dependant_name && (
                        <span> - {appointment.individual.dependant_name}</span>
                      )}
                      {appointment.individual.visit_recipient_type === 'other' && appointment.individual.relationship_to_recipient && (
                        <span> ({appointment.individual.relationship_to_recipient})</span>
                      )}
                    </p>
                  </div>
                )}
                
                {appointment.individual?.bio && (
                  <div className="mt-2">
                    <p className="font-medium">Reason for Visit:</p>
                    <p className="text-gray-700 bg-white p-2 rounded border">{appointment.individual.bio}</p>
                  </div>
                )}
                {appointment.individual?.physical_address && (
                  <div className="mt-2">
                    <p className="font-medium">Visit Location:</p>
                    <p className="text-gray-700 bg-white p-2 rounded border">{appointment.individual.physical_address}</p>
                  </div>
                )}
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Volunteer Details</h4>
                <p><span className="font-medium">Name:</span> {appointment.volunteer?.first_name} {appointment.volunteer?.last_name}</p>
                <p><span className="font-medium">Email:</span> {appointment.volunteer?.email}</p>
                {appointment.volunteer?.phone_number && (
                  <p><span className="font-medium">Phone:</span> {appointment.volunteer.phone_number}</p>
                )}
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                  <p className="font-medium text-green-800">Therapy Dog:</p>
                  <p className="text-green-700 font-medium">{dogName}</p>
                  {appointment.volunteer?.dogs?.[0]?.dog_breed && (
                    <p className="text-green-700">{appointment.volunteer.dogs[0].dog_breed}</p>
                  )}
                </div>
              </div>
            </div>
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
        <div className="flex space-x-1 mb-6">
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
