// src/components/dashboard/fragments/AppointmentSummaryCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

interface Props {
  role: 'volunteer';
  setActiveTab: (
    tab: 'dashboard-home' | 'my-visits' | 'messaging' | 'my-therapy-dog'
  ) => void;
}

interface Appointment {
  id: number;
  start_time: string;
  individual_first_name: string;
  individual_last_name: string;
  individual_profile_picture_url?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
}

export default function AppointmentSummaryCard({ role, setActiveTab }: Props) {
  const supabase = useSupabaseClient();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Appointment[]>([]);
  const [nextConfirmed, setNextConfirmed] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const fetchAppointments = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('appointments_with_individuals')
        .select(
          'id, start_time, status, individual_first_name, individual_last_name, individual_profile_picture_url'
        )
        .eq('volunteer_id', user.id)
        .order('start_time', { ascending: true });

      if (error) throw error;

      const now = new Date();
      setPending(data.filter((a) => a.status === 'pending'));
      setNextConfirmed(
        data
          .filter((a) => a.status === 'confirmed' && new Date(a.start_time) > now)
          .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] ?? null
      );
      setLoading(false);
    };

    fetchAppointments();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="animate-spin w-5 h-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2 pb-3">
      <h2 className="text-xl font-bold">Your Schedule</h2>

      <div className="rounded-lg bg-blue-50 p-4 shadow-sm border border-blue-100">
        {pending.length > 0 ? (
          <>
            <h4 className="text-base font-semibold text-blue-900 mb-1">
              {pending.length} pending appointment request{pending.length > 1 ? 's' : ''}
            </h4>
            <p className="text-sm text-blue-800 mb-3">
              Please review and respond promptly.
            </p>
            <Button onClick={() => setActiveTab('my-visits')}>Review Requests</Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No pending requests at the moment.
          </p>
        )}
      </div>

      <div className="rounded-lg bg-green-50 p-4 shadow-sm border border-green-100">
        {nextConfirmed ? (
          <>
            <h4 className="text-base font-semibold text-green-900 mb-1">Next Visit</h4>
            <p className="text-sm text-green-800">
              With {nextConfirmed.individual_first_name} {nextConfirmed.individual_last_name}
            </p>
            <p className="text-sm text-green-800">
              {format(new Date(nextConfirmed.start_time), 'eeee, MMMM do • h:mm a')}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No confirmed upcoming visits.
          </p>
        )}
      </div>
    </div>
  );
}
