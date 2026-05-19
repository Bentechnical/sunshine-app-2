'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Calendar } from 'lucide-react';

export default function AdminDashboardHome({ pdMode = false }: { pdMode?: boolean }) {
  const { user } = useUser();
  const [assignedCount, setAssignedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!pdMode || !user?.id) return;
    fetch('/api/admin/visits?status=approved')
      .then(r => r.json())
      .then(json => {
        const mine = (json.visits ?? []).filter((v: any) => v.assigned_pd_id === user.id);
        setAssignedCount(mine.length);
      })
      .catch(() => {});
  }, [pdMode, user?.id]);

  return (
    <div className="p-4 space-y-4">
      {pdMode && assignedCount !== null && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Calendar size={22} className="text-[#0e62ae]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{assignedCount}</p>
            <p className="text-sm text-gray-500">
              upcoming {assignedCount === 1 ? 'visit' : 'visits'} assigned to you
            </p>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{pdMode ? 'Program Director Overview' : 'Admin Overview'}</h2>
        <p className="text-sm text-gray-500">Platform-wide metrics and alerts will appear here.</p>
      </div>
    </div>
  );
}
