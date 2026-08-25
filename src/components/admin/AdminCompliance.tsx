'use client';

import { useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ComplianceStatus = 'missing' | 'pending_review' | 'approved' | 'expiring' | 'expired' | 'rejected';

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
    verification_status: string | null;
    verified_at: string | null;
    verified_by: string | null;
  };
  vaccine: {
    status: ComplianceStatus;
    document_url: string | null;
    date_issued: string | null;
    expiry_date: string | null;
    dog_name: string | null;
    verification_status: string | null;
    verified_at: string | null;
    verified_by: string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusConfig: Record<ComplianceStatus, { label: string; classes: string }> = {
  missing:        { label: 'Missing',        classes: 'bg-red-100 text-red-700' },
  pending_review: { label: 'Needs Review',   classes: 'bg-amber-100 text-amber-800' },
  approved:       { label: 'Approved',       classes: 'bg-green-100 text-green-700' },
  expiring:       { label: 'Expiring Soon',  classes: 'bg-orange-100 text-orange-700' },
  expired:        { label: 'Expired',        classes: 'bg-red-100 text-red-800' },
  rejected:       { label: 'Rejected',       classes: 'bg-red-100 text-red-700' },
};

function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  const { label, classes } = statusConfig[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${classes}`}>
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

// ─── Document Viewer + Verification Modal ────────────────────────────────────

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function VerificationActions({
  volunteerId,
  documentType,
  currentStatus,
  verifiedAt,
  onVerified,
}: {
  volunteerId: string;
  documentType: 'vsc' | 'vaccine';
  currentStatus: string | null;
  verifiedAt: string | null;
  onVerified: (newStatus: 'approved' | 'rejected') => void;
}) {
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = async (action: 'approve' | 'reject') => {
    setActing(action);
    setActionError(null);
    const apiAction = action === 'approve'
      ? (documentType === 'vsc' ? 'approve_vsc' : 'approve_vaccine')
      : (documentType === 'vsc' ? 'reject_vsc' : 'reject_vaccine');
    try {
      const res = await fetch(`/api/admin/compliance/${volunteerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: apiAction }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || 'Action failed'); return; }
      onVerified(action === 'approve' ? 'approved' : 'rejected');
    } catch {
      setActionError('Action failed. Please try again.');
    } finally {
      setActing(null);
    }
  };

  const statusLabel = currentStatus === 'approved' ? 'Approved' : currentStatus === 'rejected' ? 'Rejected' : 'Pending Review';
  const statusClasses = currentStatus === 'approved'
    ? 'bg-green-100 text-green-700'
    : currentStatus === 'rejected'
    ? 'bg-red-100 text-red-700'
    : 'bg-amber-100 text-amber-800';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusClasses}`}>
          {statusLabel}
        </span>
        {currentStatus === 'approved' && verifiedAt && (
          <span className="text-xs text-gray-400">Verified {formatDateTime(verifiedAt)}</span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => handleAction('approve')}
          disabled={!!acting}
          className="flex-1 px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
        >
          {acting === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button
          onClick={() => handleAction('reject')}
          disabled={!!acting}
          className="flex-1 px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition"
        >
          {acting === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
      {actionError && <p className="text-xs text-red-600">{actionError}</p>}
    </div>
  );
}

type SignedDocs = { vsc_signed_url: string | null; vaccine_signed_url: string | null; dog_name: string | null };

function DocumentModal({
  volunteerId,
  volunteerName,
  record,
  prefetchedDocs,
  onClose,
  onVerified,
}: {
  volunteerId: string;
  volunteerName: string;
  record: ComplianceRecord;
  prefetchedDocs?: SignedDocs | null;
  onClose: () => void;
  onVerified: (updated: ComplianceRecord) => void;
}) {
  const [loading, setLoading] = useState(!prefetchedDocs);
  const [docs, setDocs] = useState<SignedDocs | null>(prefetchedDocs ?? null);
  const [error, setError] = useState<string | null>(null);
  const [localRecord, setLocalRecord] = useState(record);

  const vscHasDoc = !!(prefetchedDocs?.vsc_signed_url ?? docs?.vsc_signed_url);
  const vaccineHasDoc = !!(prefetchedDocs?.vaccine_signed_url ?? docs?.vaccine_signed_url);
  const showTabs = vscHasDoc && vaccineHasDoc;
  const defaultTab = record.vsc.verification_status === 'pending_review' && vscHasDoc ? 'vsc' : 'vaccine';
  const [activeTab, setActiveTab] = useState<'vsc' | 'vaccine'>(defaultTab);

  useEffect(() => {
    if (prefetchedDocs) return;
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
  }, [volunteerId, prefetchedDocs]);

  const handleVscVerified = (newStatus: 'approved' | 'rejected') => {
    const updated = { ...localRecord, vsc: { ...localRecord.vsc, verification_status: newStatus, verified_at: new Date().toISOString() } };
    setLocalRecord(updated);
    onVerified(updated);
  };

  const handleVaccineVerified = (newStatus: 'approved' | 'rejected') => {
    const updated = { ...localRecord, vaccine: { ...localRecord.vaccine, verification_status: newStatus, verified_at: new Date().toISOString() } };
    setLocalRecord(updated);
    onVerified(updated);
  };

  const rawUrl = docs ? (activeTab === 'vsc' ? docs.vsc_signed_url : docs.vaccine_signed_url) : null;
  const activeUrl = rawUrl ? `${rawUrl}#toolbar=0&navpanes=0` : null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 pl-70">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden" style={{ height: '85vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{volunteerName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Review compliance documents and approve or reject submissions</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-6">&times;</button>
        </div>

        {/* Tabs — only when both documents exist */}
        {!loading && !error && showTabs && (
          <div className="flex border-b border-gray-100 px-6 shrink-0">
            {(['vsc', 'vaccine'] as const).map(tab => {
              const isPending = tab === 'vsc'
                ? localRecord.vsc.verification_status === 'pending_review'
                : localRecord.vaccine.verification_status === 'pending_review';
              const label = tab === 'vsc'
                ? 'VSC Document'
                : `Rabies Vaccine${docs?.dog_name ? ` — ${docs.dog_name}` : ''}`;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
                    activeTab === tab
                      ? 'border-[#0e62ae] text-[#0e62ae]'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                  {isPending && (
                    <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Needs Review</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        {loading && (
          <div className="flex-1 flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600">Loading document…</span>
          </div>
        )}
        {error && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {!loading && !error && docs && (
          <div className="flex flex-1 min-h-0">
            {/* Document preview */}
            <div className="flex-1 bg-gray-100 min-h-0">
              {activeUrl ? (
                <iframe
                  key={activeUrl}
                  src={activeUrl}
                  className="w-full h-full border-0"
                  title="Compliance document preview"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-sm text-gray-400 italic">No document uploaded</p>
                </div>
              )}
            </div>

            {/* Metadata + actions panel */}
            <div className="w-72 shrink-0 border-l border-gray-100 flex flex-col p-5 overflow-y-auto">
              {/* Document type heading (when no tabs) */}
              {!showTabs && (
                <p className="text-sm font-bold text-gray-800 mb-4">
                  {activeTab === 'vsc' ? 'Volunteer Screening Check' : `Rabies Vaccine Record${docs.dog_name ? ` — ${docs.dog_name}` : ''}`}
                </p>
              )}

              {/* VSC metadata */}
              {activeTab === 'vsc' && (
                <div className="space-y-4 mb-6">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Date Issued</p>
                    <p className="text-sm text-gray-900">{formatDate(localRecord.vsc.date_issued)}</p>
                  </div>
                  {localRecord.vsc.renewal_due && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Renewal Due</p>
                      <p className="text-sm text-gray-900">{formatDate(localRecord.vsc.renewal_due)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Vaccine metadata */}
              {activeTab === 'vaccine' && (
                <div className="space-y-4 mb-6">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Date Issued</p>
                    <p className="text-sm text-gray-900">{formatDate(localRecord.vaccine.date_issued)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Expiry Date</p>
                    <p className="text-sm text-gray-900">{formatDate(localRecord.vaccine.expiry_date)}</p>
                  </div>
                </div>
              )}

              {/* Verification actions */}
              <div className="mt-auto space-y-3">
                {activeTab === 'vsc' && docs.vsc_signed_url && (
                  <VerificationActions
                    volunteerId={volunteerId}
                    documentType="vsc"
                    currentStatus={localRecord.vsc.verification_status}
                    verifiedAt={localRecord.vsc.verified_at}
                    onVerified={handleVscVerified}
                  />
                )}
                {activeTab === 'vaccine' && docs.vaccine_signed_url && (
                  <VerificationActions
                    volunteerId={volunteerId}
                    documentType="vaccine"
                    currentStatus={localRecord.vaccine.verification_status}
                    verifiedAt={localRecord.vaccine.verified_at}
                    onVerified={handleVaccineVerified}
                  />
                )}
                <p className="text-xs text-gray-400">Document links expire after 1 hour.</p>
              </div>
            </div>
          </div>
        )}
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
  const [selectedVolunteer, setSelectedVolunteer] = useState<ComplianceRecord | null>(null);
  const [signedUrlCache, setSignedUrlCache] = useState<Map<string, SignedDocs>>(new Map());

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

  // Pre-fetch signed URLs for all pending_review volunteers in the background
  useEffect(() => {
    const pending = volunteers.filter(v =>
      v.vsc.verification_status === 'pending_review' ||
      v.vaccine.verification_status === 'pending_review'
    );
    if (pending.length === 0) return;

    pending.forEach(async (v) => {
      if (signedUrlCache.has(v.id)) return;
      try {
        const res = await fetch(`/api/admin/compliance/${v.id}/documents`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.documents) {
          setSignedUrlCache(prev => new Map(prev).set(v.id, { ...json.documents, dog_name: json.dog_name }));
        }
      } catch {
        // Non-fatal — modal will fall back to fetching on open
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volunteers]);

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All Volunteers' },
    { key: 'pending_review', label: 'Needs Review' },
    { key: 'missing', label: 'Missing' },
    { key: 'expiring', label: 'Expiring Soon' },
    { key: 'expired', label: 'Expired' },
    { key: 'approved', label: 'Compliant' },
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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">VSC Date Issued</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rabies Vaccine Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rabies Vaccine Expiry</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {volunteers.map(v => {
                  const needsAttention = ['missing', 'expiring', 'expired', 'pending_review', 'rejected'].includes(v.vsc.status) ||
                                        ['missing', 'expiring', 'expired', 'pending_review', 'rejected'].includes(v.vaccine.status);
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
                        {formatDate(v.vsc.date_issued)}
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
                          onClick={() => setSelectedVolunteer(v)}
                          className={`text-xs font-semibold whitespace-nowrap px-2.5 py-1 rounded-lg transition ${
                            v.vsc.verification_status === 'pending_review' || v.vaccine.verification_status === 'pending_review'
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'text-blue-600 hover:underline'
                          }`}
                        >
                          {v.vsc.verification_status === 'pending_review' || v.vaccine.verification_status === 'pending_review'
                            ? 'Review'
                            : 'View Docs'}
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
          volunteerName={`${selectedVolunteer.first_name} ${selectedVolunteer.last_name}`}
          record={selectedVolunteer}
          prefetchedDocs={signedUrlCache.get(selectedVolunteer.id) ?? null}
          onClose={() => setSelectedVolunteer(null)}
          onVerified={(updated) => {
            setVolunteers(prev => prev.map(v => v.id === updated.id ? updated : v));
            setSelectedVolunteer(updated);
          }}
        />
      )}
    </div>
  );
}
