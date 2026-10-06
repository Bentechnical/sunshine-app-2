'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { getVisitAlerts } from '@/utils/visitSlots';

interface AlertCounts {
  volunteerRequests: number;
  orgRequests: number;
  individualRequests: number;
  groupVisits: number;
  pendingDocReviews: number;
  pendingCompletion: number;
  visitsNeedingAttention: number;
}

export function useAdminAlertCounts(enabled = true, isPd = false, refreshTrigger = 0) {
  const { user } = useUser();
  const [counts, setCounts] = useState<AlertCounts>({ volunteerRequests: 0, orgRequests: 0, individualRequests: 0, groupVisits: 0, pendingDocReviews: 0, pendingCompletion: 0, visitsNeedingAttention: 0 });

  useEffect(() => {
    if (!enabled || !user) return;

    const fetchCounts = async () => {
      try {
        const [usersRes, visitsRes, docReviewsRes, pendingCompletionRes, activeRes] = await Promise.all([
          fetch('/api/admin/pending-users'),
          fetch('/api/admin/visits?status=pending_review'),
          fetch('/api/admin/pending-doc-reviews-count'),
          fetch('/api/admin/visits?scope=pending_completion'),
          fetch('/api/admin/visits?scope=active'),
        ]);

        let volunteerRequests = 0;
        let orgRequests = 0;
        let individualRequests = 0;
        let groupVisits = 0;
        let pendingDocReviews = 0;
        let pendingCompletion = 0;
        let visitsNeedingAttention = 0;

        if (usersRes.ok) {
          const json = await usersRes.json();
          const pendingUsers: { role: string }[] = json.users ?? [];
          const countRole = (role: string) => pendingUsers.filter(u => u.role === role).length;
          volunteerRequests = countRole('volunteer');
          orgRequests = countRole('organization');
          // Individual requests are an admin-only tab
          individualRequests = isPd ? 0 : countRole('individual');
        }

        if (visitsRes.ok) {
          const json = await visitsRes.json();
          const pendingVisits = json.visits ?? [];
          // PDs only see visits assigned to them
          groupVisits = isPd
            ? pendingVisits.filter((v: { assigned_pd_id: string | null }) => v.assigned_pd_id === user.id).length
            : pendingVisits.length;
        }

        if (docReviewsRes.ok) {
          const json = await docReviewsRes.json();
          pendingDocReviews = json.count ?? 0;
        }

        if (pendingCompletionRes.ok) {
          const json = await pendingCompletionRes.json();
          const pendingVisits = json.visits ?? [];
          pendingCompletion = isPd
            ? pendingVisits.filter((v: { assigned_pd_id: string | null }) => v.assigned_pd_id === user.id).length
            : pendingVisits.length;
        }

        // Below minimum within 14 days, or an open spot with a waitlist (no auto-promotion)
        if (activeRes.ok) {
          const json = await activeRes.json();
          const active = (json.visits ?? []).filter((v: { assigned_pd_id: string | null }) =>
            !isPd || v.assigned_pd_id === user.id
          );
          visitsNeedingAttention = active.filter((v: Parameters<typeof getVisitAlerts>[0]) => getVisitAlerts(v).needsAttention).length;
        }

        setCounts({ volunteerRequests, orgRequests, individualRequests, groupVisits, pendingDocReviews, pendingCompletion, visitsNeedingAttention });
      } catch (err) {
        console.error('[useAdminAlertCounts] Error fetching alert counts:', err);
      }
    };

    fetchCounts();
  }, [enabled, isPd, user, refreshTrigger]);

  return counts;
}
