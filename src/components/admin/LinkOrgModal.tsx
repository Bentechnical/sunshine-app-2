// src/components/admin/LinkOrgModal.tsx
'use client';

import { useState, useMemo } from 'react';
import { X, Link2, Search, AlertTriangle } from 'lucide-react';

interface OrgAccount {
  id: string;
  org_name: string;
  email: string;
  org_address?: string;
  profile_image?: string | null;
}

interface Props {
  managedOrgId: string;
  managedOrgName: string;
  realOrgAccounts: OrgAccount[];
  onClose: () => void;
  onLinked: (clerkUserId: string, visitsTransferred: number) => void;
}

export default function LinkOrgModal({ managedOrgId, managedOrgName, realOrgAccounts, onClose, onLinked }: Props) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return realOrgAccounts;
    const q = search.toLowerCase();
    return realOrgAccounts.filter(
      o => o.org_name?.toLowerCase().includes(q) || o.email?.toLowerCase().includes(q)
    );
  }, [search, realOrgAccounts]);

  const selectedOrg = realOrgAccounts.find(o => o.id === selectedId);

  const handleLink = async () => {
    if (!selectedId) return;
    setLinking(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/managed-orgs/${managedOrgId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clerk_user_id: selectedId }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to link');
        return;
      }

      onLinked(selectedId, json.visits_transferred ?? 0);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLinking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Link2 size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Link to Account</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            Link <span className="font-semibold text-gray-900">{managedOrgName}</span> to an existing organization account.
            All visits will be transferred to the selected account.
          </p>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search by name or email…"
            />
          </div>

          {/* Org list */}
          <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No matching accounts found</p>
            ) : (
              filtered.map(org => (
                <button
                  key={org.id}
                  onClick={() => setSelectedId(org.id === selectedId ? null : org.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                    org.id === selectedId
                      ? 'bg-blue-50 ring-1 ring-inset ring-blue-200'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {org.profile_image ? (
                    <img src={org.profile_image} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-blue-400">{org.org_name?.charAt(0) || '?'}</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{org.org_name}</p>
                    <p className="text-xs text-gray-500 truncate">{org.email}</p>
                  </div>
                  {org.id === selectedId && (
                    <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Confirmation warning */}
          {selectedOrg && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">This action cannot be undone.</p>
                <p className="mt-1">
                  All visits from <span className="font-medium">{managedOrgName}</span> will be
                  transferred to <span className="font-medium">{selectedOrg.org_name}</span>,
                  and the admin-managed record will be deleted.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-gray-700 font-medium border border-gray-300 rounded-xl hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleLink}
            disabled={!selectedId || linking}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#0e62ae] text-white font-semibold rounded-xl hover:bg-[#0a4f8f] disabled:opacity-50 transition"
          >
            <Link2 size={16} /> {linking ? 'Linking…' : 'Link Account'}
          </button>
        </div>

      </div>
    </div>
  );
}
