'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Calendar, MapPin } from 'lucide-react';

export default function AdminDashboardHome({ pdMode = false }: { pdMode?: boolean }) {
  const { user } = useUser();
  const [assignedCount, setAssignedCount] = useState<number | null>(null);
  const [regionName, setRegionName] = useState<string | null>(null);

  useEffect(() => {
    if (!pdMode || !user?.id) return;

    Promise.all([
      fetch('/api/admin/visits?status=approved').then(r => r.json()),
      fetch('/api/admin/regions').then(r => r.json()),
    ]).then(([visitsJson, regionsJson]) => {
      const mine = (visitsJson.visits ?? []).filter((v: any) => v.assigned_pd_id === user.id);
      setAssignedCount(mine.length);

      const myRegion = (regionsJson.regions ?? []).find((r: any) => r.owner_pd_id === user.id);
      setRegionName(myRegion?.name ?? null);
    }).catch(() => {});
  }, [pdMode, user?.id]);

  return (
    <div className="p-4 space-y-4">
      {pdMode && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Region tile */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
              <MapPin size={22} className="text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Your Region</p>
              {regionName ? (
                <p className="text-lg font-bold text-gray-900 truncate">{regionName}</p>
              ) : (
                <p className="text-sm text-gray-400 italic">No region assigned</p>
              )}
            </div>
          </div>

          {/* Assigned visits tile */}
          {assignedCount !== null && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Calendar size={22} className="text-[#0e62ae]" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Upcoming Visits</p>
                <p className="text-2xl font-bold text-gray-900">{assignedCount}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{pdMode ? 'Program Director Overview' : 'Admin Overview'}</h2>
        <p className="text-sm text-gray-500">Platform-wide metrics and alerts will appear here.</p>
      </div>
    </div>
  );
}
