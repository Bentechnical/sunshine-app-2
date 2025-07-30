'use client';

import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
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
  const supabase = useSupabaseClient();
  const [sections, setSections] = useState<{
    nextWeek: AppointmentSection;
    future: AppointmentSection;
    past: AppointmentSection;
  }>({
    nextWeek: { title: 'Appointments in the next 7 days', appointments: [], loading: true, hasMore: false, page: 1 },
    future: { title: 'Future appointments', appointments: [], loading: true, hasMore: false, page: 1 },
    past: { title: 'Past appointments', appointments: [], loading: true, hasMore: false, page: 1 },
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
  const [expandedAppointments, setExpandedAppointments] = useState<Set<number>>(new Set());

  // Calculate date ranges
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  useEffect(() => {
    loadAppointments();
  }, [statusFilter]);

  const loadAppointments = async (section?: SectionKey, loadMore = false) => {
    const sectionsToLoad = section ? [section] : ['nextWeek', 'future', 'past'] as const;
    
    for (const sectionKey of sectionsToLoad) {
      const currentSection = sections[sectionKey];
      const page = loadMore ? currentSection.page + 1 : 1;
      
      setSections(prev => ({
        ...prev,
        [sectionKey]: { ...prev[sectionKey], loading: true }
      }));

      let query = supabase
        .from('appointments')
        .select(`
          id,
          start_time,
          end_time,
          status,
          cancellation_reason,
          individual:individual_id (
            id,
            first_name,
            last_name,
            email,
            phone_number,
            bio,
            physical_address
          ),
          volunteer:volunteer_id (
            id,
            first_name,
            last_name,
            email,
            phone_number,
            dogs (
              id,
              dog_name,
              dog_breed
            )
          )
        `)
        .order('start_time', { ascending: sectionKey === 'past' ? false : true })
        .range((page - 1) * 20, page * 20 - 1);

      // Apply status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Apply date filters
      if (sectionKey === 'nextWeek') {
        query = query.gte('start_time', now.toISOString()).lt('start_time', nextWeek.toISOString());
      } else if (sectionKey === 'future') {
        query = query.gte('start_time', nextWeek.toISOString());
      } else if (sectionKey === 'past') {
        query = query.lt('start_time', now.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error(`Error loading ${sectionKey} appointments:`, error);
        setSections(prev => ({
          ...prev,
          [sectionKey]: { ...prev[sectionKey], loading: false }
        }));
        continue;
      }

      const processedData = data?.map((apt: any) => ({
        ...apt,
        individual: apt.individual ? apt.individual[0] : null,
        volunteer: apt.volunteer ? apt.volunteer[0] : null,
      })) || [];

      setSections(prev => ({
        ...prev,
        [sectionKey]: {
          ...prev[sectionKey],
          appointments: loadMore ? [...prev[sectionKey].appointments, ...processedData] : processedData,
          loading: false,
          hasMore: processedData.length === 20,
          page
        }
      }));
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
              <div className="text-sm text-gray-500 w-20">{date}</div>
              <div className="text-sm font-medium w-16">{time}</div>
              <div className="flex-1">
                <div className="font-medium">
                  {appointment.individual?.first_name} {appointment.individual?.last_name}
                </div>
                <div className="text-sm text-gray-600">
                  with {appointment.volunteer?.first_name} {appointment.volunteer?.last_name} • {dogName}
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
                <h4 className="font-medium text-gray-900 mb-2">Individual Details</h4>
                <p><span className="font-medium">Name:</span> {appointment.individual?.first_name} {appointment.individual?.last_name}</p>
                <p><span className="font-medium">Email:</span> {appointment.individual?.email}</p>
                {appointment.individual?.phone_number && (
                  <p><span className="font-medium">Phone:</span> {appointment.individual.phone_number}</p>
                )}
                {appointment.individual?.bio && (
                  <p><span className="font-medium">Reason for Visit:</span> {appointment.individual.bio}</p>
                )}
                {appointment.individual?.physical_address && (
                  <p><span className="font-medium">Visit Location:</span> {appointment.individual.physical_address}</p>
                )}
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Volunteer Details</h4>
                <p><span className="font-medium">Name:</span> {appointment.volunteer?.first_name} {appointment.volunteer?.last_name}</p>
                <p><span className="font-medium">Email:</span> {appointment.volunteer?.email}</p>
                {appointment.volunteer?.phone_number && (
                  <p><span className="font-medium">Phone:</span> {appointment.volunteer.phone_number}</p>
                )}
                <p><span className="font-medium">Dog:</span> {dogName}</p>
                {appointment.volunteer?.dogs?.[0]?.dog_breed && (
                  <p><span className="font-medium">Breed:</span> {appointment.volunteer.dogs[0].dog_breed}</p>
                )}
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
          <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Button onClick={() => loadAppointments()} variant="outline">
            Refresh
          </Button>
        </div>
      </div>

      {/* Appointment Sections */}
      {renderSection('nextWeek')}
      {renderSection('future')}
      {renderSection('past')}
    </div>
  );
}
