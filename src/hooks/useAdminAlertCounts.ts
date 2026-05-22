'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

interface AlertCounts {
  userRequests: number;
  groupVisits: number;
}

export function useAdminAlertCounts(enabled = true, isPd = false, refreshTrigger = 0) {
  const { user } = useUser();
  const [counts, setCounts] = useState<AlertCounts>({ userRequests: 0, groupVisits: 0 });

  useEffect(() => {
    if (!enabled || !user) return;

    const fetchCounts = async () => {
      try {
        const [usersRes, visitsRes] = await Promise.all([
          fetch('/api/admin/pending-users'),
          fetch('/api/admin/visits?status=pending_review'),
        ]);

        let userRequests = 0;
        let groupVisits = 0;

        if (usersRes.ok) {
          const json = await usersRes.json();
          const pendingUsers = json.users ?? [];
          // PDs see volunteer + org requests in their region; admins see all
          userRequests = isPd
            ? pendingUsers.filter((u: { role: string }) => ['volunteer', 'organization'].includes(u.role)).length
            : pendingUsers.filter((u: { role: string }) =>
                ['volunteer', 'individual', 'organization'].includes(u.role)
              ).length;
        }

        if (visitsRes.ok) {
          const json = await visitsRes.json();
          const pendingVisits = json.visits ?? [];
          // PDs only see visits assigned to them
          groupVisits = isPd
            ? pendingVisits.filter((v: { assigned_pd_id: string | null }) => v.assigned_pd_id === user.id).length
            : pendingVisits.length;
        }

        setCounts({ userRequests, groupVisits });
      } catch (err) {
        console.error('[useAdminAlertCounts] Error fetching alert counts:', err);
      }
    };

    fetchCounts();
  }, [enabled, isPd, user, refreshTrigger]);

  return counts;
}
