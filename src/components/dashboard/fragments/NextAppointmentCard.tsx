'use client';

import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Loader2 } from 'lucide-react';

interface Props {
  role: 'individual' | 'volunteer';
  setActiveTab: (
    tab: 'dashboard-home' | 'my-visits' | 'meet-with-dog' | 'messaging' | 'my-therapy-dog'
  ) => void;
}

interface AppointmentData {
  start_time: string;
  dog_name: string;
  dog_picture_url: string;
  dog_breed?: string;
  dog_age?: number;
  dog_bio?: string;
  volunteer_first_name?: string;
  volunteer_last_name?: string;
}

export default function NextAppointmentCard({ role, setActiveTab }: Props) {
  const supabase = useSupabaseClient();
  const { user } = useUser();

  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    const fetchAppointmentData = async () => {
      const { data, error } = await supabase.rpc('get_next_confirmed_appointments', {
        user_id: user.id,
      });

      if (error) {
        console.error('Error fetching upcoming appointment:', error);
      }

      if (Array.isArray(data) && data.length > 0) {
        setAppointment(data[0]);
      }

      setLoading(false);
    };

    fetchAppointmentData();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[150px]">
        <Loader2 className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="text-sm text-gray-600">No upcoming visits found.</div>
    );
  }

  const {
    start_time,
    dog_name,
    dog_picture_url,
    dog_breed,
    dog_age,
    dog_bio,
    volunteer_first_name,
  } = appointment;

  const visitDate = new Date(start_time);
  const formattedDate = visitDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = visitDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  const volunteerName = volunteer_first_name ?? 'Unknown';

  return (
    <div className="space-y-4 pt-1 px-2 flex flex-col h-full pb-3">
      <h2 className="text-xl font-bold">Upcoming Visits</h2>

      <div className="rounded-lg p-0 flex flex-col flex-1">
        <div className="relative w-full overflow-hidden rounded-lg aspect-[4/3] md:aspect-video lg:aspect-square">
          <img
            src={dog_picture_url || '/images/default_dog.png'}
            alt={dog_name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>

        <div className="pt-3 flex-1">
          <h3 className="text-lg font-bold">{dog_name}</h3>
          <p className="text-gray-700">
            {dog_breed ?? 'Unknown breed'}
            {typeof dog_age === 'number' ? ` | Age: ${dog_age}` : ''}
          </p>
          <p className="text-gray-500 italic text-md mb-2">
            with {volunteerName}
          </p>
          {dog_bio && <p className="text-gray-600 text-sm mt-2">{dog_bio}</p>}
          <p className="text-gray-800 mt-4 text-md">
            <strong>Visit Time:</strong> {formattedDate} at {formattedTime}
          </p>
        </div>

        <div className="pt-3 mt-auto mb-0">
          <button
            onClick={() => setActiveTab('my-visits')}
            className="w-full px-4 py-2 text-white bg-[#0e62ae] hover:bg-[#094e8b] rounded-lg text-sm font-medium"
          >
            Manage Visits
          </button>
        </div>
      </div>
    </div>
  );
}