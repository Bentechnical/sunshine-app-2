'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';

interface Props {
  role: 'individual' | 'volunteer';
}

export default function PendingStatusCard({ role }: Props) {
  const router = useRouter();
  const { user } = useUser();
  const supabase = useSupabaseClient();

  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchPending = async () => {
      if (!user?.id) return;

      const column = role === 'volunteer' ? 'volunteer_id' : 'individual_id';

      const { count, error } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq(column, user.id)
        .eq('status', 'pending');

      if (error) {
        console.error('Error fetching pending count:', error);
        return;
      }

      setCount(count ?? 0);
    };

    fetchPending();
  }, [user?.id, role, supabase]);

  const goToVisits = () => router.push('/dashboard?tab=my-visits');

  if (count === null) {
    return (
      <div className="bg-blue-50 border border-blue-200 p-4 rounded shadow-sm flex items-center justify-center min-h-[120px]">
        <Loader2 className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (count === 0) return null;

  const message =
    role === 'volunteer'
      ? `You have ${count} new booking request${count > 1 ? 's' : ''} to review.`
      : `You have ${count} pending booking${count > 1 ? 's' : ''} awaiting confirmation.`;

  const buttonLabel = role === 'volunteer' ? 'Review Requests' : 'View My Visits';

  return (
    <div className="bg-blue-50 border border-blue-200 p-4 rounded shadow-sm min-h-[120px] flex flex-col justify-between">
      <p className="text-sm text-blue-900">{message}</p>
      <button
        onClick={goToVisits}
        className="mt-2 text-sm text-blue-700 underline hover:text-blue-900"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
