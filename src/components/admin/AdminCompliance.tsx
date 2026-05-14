'use client';

import { useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ComplianceStatus = 'missing' | 'uploaded' | 'expiring' | 'expired';

interface ComplianceRecord {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  vsc: {
    status: ComplianceStatus;
    document_url: string | null;
    date_issued: string | null;
    renewal_due: string | null;
  };
  vaccine: {
    status: ComplianceStatus;
    document_url: string | null;
    expiry_date: string | null;
    dog_name: string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusConfig: Record<ComplianceStatus, { label: string; classes: string }> = {
  missing:  { label: 'Missing',        classes: 'bg-red-100 text-red-700' },
  uploaded: { label: 'Uploaded',       classes: 'bg-green-100 text-green-700' },
  expiring: { label: 'Expiring Soon',  classes: 'bg-amber-100 text-amber-700' },
  expired:  { label: 'Expired',        classes: 'bg-red-100 text-red-800' },
};

function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  const { label, classes } = statusConfig[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ─── Document Viewer Modal ────────────────────────────────────────────────────

function DocumentModal({
  volunteerId,
  volunteerName,
  onClose,
}: {
  volunteerId: string;
  volunteerName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<{ vsc_signed_url: string | null; vaccine_signed_url: string | null; dog_name: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/admin/compliance/${volunteerId}/documents`);
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to load documents'); return; }
        setDocs(json.documents ? { ...json.documents, dog_name: json.dog_name } : null);
      } catch {
        setError('Failed to load documents');
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, [volunteerId]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Documents — {volunteerName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-6 justify-center">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600">Loading signed URLs…</span>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && docs && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">VSC Document</p>
              {docs.vsc_signed_url ? (
                <a href={docs.vsc_signed_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
                  Open VSC Document
                </a>
              ) : (
                <p className="text-sm text-gray-400 italic">No document uploaded</p>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                Vaccine Record{docs.dog_name ? ` — ${docs.dog_name}` : ''}
              </p>
              {docs.vaccine_signed_url ? (
                <a href={docs.vaccine_signed_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
                  Open Vaccine Record
                </a>
              ) : (
                <p className="text-sm text-gray-400 italic">No document uploaded</p>
              )}
            </div>
            <p className="text-xs text-gray-400">Links expire after 1 hour.</p>
          </div>
        )}

        <button onClick={onClose} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type StatusFilter = 'all' | ComplianceStatus;

export default function AdminCompliance() {
  const [volunteers, setVolunteers] = useState<ComplianceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedVolunteer, setSelectedVolunteer] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
        const res = await fetch(`/api/admin/compliance${params}`);
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to load compliance data'); return; }
        setVolunteers(json.volunteers ?? []);
      } catch {
        setError('Failed to load compliance data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [statusFilter]);

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All Volunteers' },
    { key: 'missing', label: 'Missing' },
    { key: 'expiring', label: 'Expiring Soon' },
    { key: 'expired', label: 'Expired' },
    { key: 'uploaded', label: 'Compliant' },
  ];

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Volunteer Compliance</h1>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {filterTabs.map(({ key, label }) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
              statusFilter === key ? 'bg-[#0e62ae] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 gap-2">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-600">Loading…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Empty */}
      {!loading && !error && volunteers.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p className="font-medium">No volunteers found</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && volunteers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Volunteer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">VSC Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">VSC Renewal Due</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vaccine Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vaccine Expiry</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {volunteers.map(v => {
                  const needsAttention = ['missing', 'expiring', 'expired'].includes(v.vsc.status) ||
                                        ['missing', 'expiring', 'expired'].includes(v.vaccine.status);
                  return (
                    <tr key={v.id} className={`hover:bg-gray-50 ${needsAttention ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">{v.first_name} {v.last_name}</p>
                        <p className="text-xs text-gray-500">{v.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <ComplianceBadge status={v.vsc.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {formatDate(v.vsc.renewal_due)}
                      </td>
                      <td className="px-4 py-3">
                        <ComplianceBadge status={v.vaccine.status} />
                        {v.vaccine.dog_name && (
                          <p className="text-xs text-gray-400 mt-0.5">{v.vaccine.dog_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {formatDate(v.vaccine.expiry_date)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedVolunteer({ id: v.id, name: `${v.first_name} ${v.last_name}` })}
                          className="text-xs text-blue-600 hover:underline font-medium whitespace-nowrap"
                        >
                          View Docs
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Document modal */}
      {selectedVolunteer && (
        <DocumentModal
          volunteerId={selectedVolunteer.id}
          volunteerName={selectedVolunteer.name}
          onClose={() => setSelectedVolunteer(null)}
        />
      )}
    </div>
  );
}
