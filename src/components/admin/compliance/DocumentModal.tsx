// src/components/admin/compliance/DocumentModal.tsx
// Compliance document review modal and its approve/reject actions.
// Extracted from AdminManageVolunteers.tsx with no behaviour change.

'use client';

import { useEffect, useState } from 'react';
import { ComplianceBadge, formatDate, formatDateTime } from './ComplianceBadge';
import type {
  ComplianceRecord,
  ComplianceStatus,
  DogProfile,
  SignedDocs,
  VerificationResult,
} from './types';

// Re-exported so callers can pull the badge from the same module as the modal.
export { ComplianceBadge };

export function VerificationActions({
  volunteerId,
  documentType,
  onVerified,
}: {
  volunteerId: string;
  documentType: 'vsc' | 'vaccine';
  currentStatus: string | null;
  verifiedAt: string | null;
  onVerified: (newStatus: 'approved' | 'rejected', result: VerificationResult) => void;
}) {
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleApprove = async () => {
    setActing('approve');
    setActionError(null);
    const apiAction = documentType === 'vsc' ? 'approve_vsc' : 'approve_vaccine';
    try {
      const res = await fetch(`/api/admin/compliance/${volunteerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: apiAction }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || 'Action failed'); return; }
      onVerified('approved', json.verification ?? {});
    } catch {
      setActionError('Action failed. Please try again.');
    } finally {
      setActing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) return;
    setActing('reject');
    setActionError(null);
    const apiAction = documentType === 'vsc' ? 'reject_vsc' : 'reject_vaccine';
    try {
      const res = await fetch(`/api/admin/compliance/${volunteerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: apiAction, rejection_reason: rejectionReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || 'Action failed'); return; }
      onVerified('rejected', json.verification ?? {});
      setShowRejectReason(false);
      setRejectionReason('');
    } catch {
      setActionError('Action failed. Please try again.');
    } finally {
      setActing(null);
    }
  };

  if (showRejectReason) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-700">Reason for rejection</p>
        <textarea
          value={rejectionReason}
          onChange={e => setRejectionReason(e.target.value)}
          placeholder="e.g. Document is expired, wrong document type…"
          rows={3}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={handleReject} disabled={!rejectionReason.trim() || !!acting}
            className="flex-1 px-3 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition">
            {acting === 'reject' ? 'Rejecting…' : 'Confirm Reject'}
          </button>
          <button onClick={() => { setShowRejectReason(false); setRejectionReason(''); }}
            className="px-3 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
        {actionError && <p className="text-xs text-red-600">{actionError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button onClick={handleApprove} disabled={!!acting}
          className="flex-1 px-3 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
          {acting === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button onClick={() => setShowRejectReason(true)} disabled={!!acting}
          className="flex-1 px-3 py-2 text-sm font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition">
          Reject
        </button>
      </div>
      {actionError && <p className="text-xs text-red-600">{actionError}</p>}
    </div>
  );
}

export function DocumentModal({
  volunteerId,
  volunteerName,
  record,
  prefetchedDocs,
  dog,
  onClose,
  onVerified,
}: {
  volunteerId: string;
  volunteerName: string;
  record: ComplianceRecord;
  prefetchedDocs?: SignedDocs | null;
  dog?: DogProfile | null;
  onClose: () => void;
  onVerified: (updated: ComplianceRecord) => void;
}) {
  const [loading, setLoading] = useState(!prefetchedDocs);
  const [docs, setDocs] = useState<SignedDocs | null>(prefetchedDocs ?? null);
  const [error, setError] = useState<string | null>(null);
  const [localRecord, setLocalRecord] = useState(record);

  // Tabs follow what's *on record*, not what we managed to sign a URL for. If a document exists
  // in the database but its file can't be fetched — a bad path, a deleted object, a storage
  // outage — hiding the tab makes it look like nothing was ever uploaded, which is a very
  // different and much more reassuring thing than the truth.
  const vscOnRecord = !!record.vsc.document_url;
  const vaccineOnRecord = !!record.vaccine.document_url;
  const showTabs = vscOnRecord && vaccineOnRecord;
  const defaultTab = record.vsc.verification_status === 'pending_review' && record.vsc.document_url ? 'vsc' : 'vaccine';
  const [activeTab, setActiveTab] = useState<'vsc' | 'vaccine'>(defaultTab);

  useEffect(() => {
    if (prefetchedDocs) return;
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/admin/compliance/${volunteerId}/documents`);
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to load documents'); return; }
        setDocs(json.documents ? { ...json.documents, dog_name: json.dog_name, vaccine_supporting_signed_urls: json.vaccine_supporting_signed_urls ?? [] } : null);
      } catch {
        setError('Failed to load documents');
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, [volunteerId, prefetchedDocs]);

  const applyVerification = <T extends ComplianceRecord['vsc'] | ComplianceRecord['vaccine']>(
    doc: T,
    newStatus: 'approved' | 'rejected',
    result: VerificationResult,
  ): T => ({
    ...doc,
    status: (newStatus === 'rejected' ? 'rejected' : 'approved') as ComplianceStatus,
    verification_status: newStatus,
    // Fall back to a local timestamp only if the server didn't send one.
    verified_at: result?.verified_at ?? new Date().toISOString(),
    verified_by: result?.verified_by ?? doc.verified_by,
    verified_by_name: result?.verified_by_name ?? null,
    rejection_reason: newStatus === 'rejected' ? (result?.rejection_reason ?? doc.rejection_reason) : null,
  });

  const handleVscVerified = (newStatus: 'approved' | 'rejected', result: VerificationResult) => {
    const updated = { ...localRecord, vsc: applyVerification(localRecord.vsc, newStatus, result) };
    setLocalRecord(updated);
    onVerified(updated);
  };

  const handleVaccineVerified = (newStatus: 'approved' | 'rejected', result: VerificationResult) => {
    const updated = { ...localRecord, vaccine: applyVerification(localRecord.vaccine, newStatus, result) };
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

        {/* Tabs */}
        {!loading && !error && showTabs && (
          <div className="flex border-b border-gray-100 px-6 shrink-0">
            {(['vsc', 'vaccine'] as const).map(tab => {
              const isPending = tab === 'vsc'
                ? localRecord.vsc.verification_status === 'pending_review'
                : localRecord.vaccine.verification_status === 'pending_review';
              const label = tab === 'vsc' ? 'VSC Document' : `Rabies Vaccine${docs?.dog_name ? ` — ${docs.dog_name}` : ''}`;
              return (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${activeTab === tab ? 'border-[#0e62ae] text-[#0e62ae]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {label}
                  {isPending && <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Needs Review</span>}
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
        {error && <div className="flex-1 flex items-center justify-center"><p className="text-sm text-red-600">{error}</p></div>}

        {!loading && !error && docs && (
          <div className="flex flex-1 min-h-0">
            {/* Document preview */}
            <div className="flex-1 bg-gray-100 min-h-0">
              {activeUrl ? (
                <iframe key={activeUrl} src={activeUrl} className="w-full h-full border-0" title="Compliance document preview" />
              ) : (activeTab === 'vsc' ? vscOnRecord : vaccineOnRecord) ? (
                <div className="w-full h-full flex items-center justify-center p-8">
                  <div className="text-center max-w-sm">
                    <p className="text-sm font-semibold text-red-700">This document couldn&apos;t be loaded.</p>
                    <p className="text-sm text-gray-600 mt-1">
                      It&apos;s recorded against this volunteer, but the file is missing from storage.
                      Ask them to upload it again, and report it if it keeps happening.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-sm text-gray-400 italic">No document uploaded</p>
                </div>
              )}
            </div>

            {/* Metadata + actions */}
            <div className="w-72 shrink-0 border-l border-gray-100 flex flex-col p-5 overflow-y-auto">
              {/* Document type heading (when no tabs) */}
              {!showTabs && (
                <p className="text-sm font-bold text-gray-800 mb-4">
                  {activeTab === 'vsc' ? 'Volunteer Screening Check' : `Rabies Vaccine Record${docs.dog_name ? ` — ${docs.dog_name}` : ''}`}
                </p>
              )}

              {/* Prominent verification status */}
              {(() => {
                const activeDoc = activeTab === 'vsc' ? localRecord.vsc : localRecord.vaccine;
                const status = activeDoc.verification_status;
                const bgClass = status === 'approved' ? 'bg-green-50 border-green-200' : status === 'rejected' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200';
                const textClass = status === 'approved' ? 'text-green-800' : status === 'rejected' ? 'text-red-800' : 'text-amber-800';
                const label = status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending Review';
                return (
                  <div className={`rounded-lg border px-3 py-2.5 mb-5 ${bgClass}`}>
                    <p className={`text-sm font-bold ${textClass}`}>{label}</p>
                    {(status === 'approved' || status === 'rejected') && activeDoc.verified_at && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {status === 'approved' ? 'Approved' : 'Rejected'} {formatDateTime(activeDoc.verified_at)}
                        {activeDoc.verified_by_name && <> by {activeDoc.verified_by_name}</>}
                      </p>
                    )}
                    {status === 'rejected' && activeDoc.rejection_reason && (
                      <div className="mt-2 pt-2 border-t border-red-200">
                        <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">
                          Reason for rejection (sent to the volunteer)
                        </p>
                        <p className="text-sm text-red-900 italic">&ldquo;{activeDoc.rejection_reason}&rdquo;</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* VSC metadata */}
              {activeTab === 'vsc' && (
                <div className="space-y-3 mb-5">
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
                  {localRecord.vsc.upload_comment && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Volunteer Comment</p>
                      <p className="text-sm text-gray-900 italic border-l-2 border-gray-300 pl-3">&ldquo;{localRecord.vsc.upload_comment}&rdquo;</p>
                    </div>
                  )}
                </div>
              )}

              {/* Vaccine metadata + dog info */}
              {activeTab === 'vaccine' && (
                <div className="space-y-3 mb-5">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Date Issued</p>
                    <p className="text-sm text-gray-900">{formatDate(localRecord.vaccine.date_issued)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Expiry Date</p>
                    <p className="text-sm text-gray-900">{formatDate(localRecord.vaccine.expiry_date)}</p>
                  </div>
                  {localRecord.vaccine.upload_comment && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Volunteer Comment</p>
                      <p className="text-sm text-gray-900 italic border-l-2 border-gray-300 pl-3">&ldquo;{localRecord.vaccine.upload_comment}&rdquo;</p>
                    </div>
                  )}
                  {dog && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Dog</p>
                      <p className="text-sm text-gray-900">{dog.dog_name} <span className="text-gray-500">· {dog.dog_breed}{dog.dog_age ? ` · ${dog.dog_age} yr${dog.dog_age !== 1 ? 's' : ''} old` : ''}</span></p>
                    </div>
                  )}
                  {docs.vaccine_supporting_signed_urls.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                        Supporting Documents ({docs.vaccine_supporting_signed_urls.length})
                      </p>
                      <div className="space-y-1.5">
                        {docs.vaccine_supporting_signed_urls.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                            className="w-full text-left text-xs text-[#0e62ae] bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-100 transition"
                          >
                            View supporting document {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Download button */}
              {rawUrl && (
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(rawUrl);
                      const blob = await res.blob();
                      const ext = blob.type === 'application/pdf' ? 'pdf' : 'doc';
                      const filename = `${volunteerName.replace(/\s+/g, '_')}_${activeTab === 'vsc' ? 'VSC' : 'Vaccine'}.${ext}`;
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = filename;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      window.open(rawUrl, '_blank');
                    }
                  }}
                  className="w-full text-center text-sm font-semibold text-[#0e62ae] bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-100 transition mb-5"
                >
                  Download Document
                </button>
              )}

              {/* Approve / Reject actions */}
              <div className="mt-auto space-y-3 pt-4 border-t border-gray-100">
                {activeTab === 'vsc' && docs.vsc_signed_url && (
                  <VerificationActions volunteerId={volunteerId} documentType="vsc"
                    currentStatus={localRecord.vsc.verification_status} verifiedAt={localRecord.vsc.verified_at}
                    onVerified={handleVscVerified} />
                )}
                {activeTab === 'vaccine' && docs.vaccine_signed_url && (
                  <VerificationActions volunteerId={volunteerId} documentType="vaccine"
                    currentStatus={localRecord.vaccine.verification_status} verifiedAt={localRecord.vaccine.verified_at}
                    onVerified={handleVaccineVerified} />
                )}
                <p className="text-xs text-gray-400 text-center">Document links expire after 1 hour.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
