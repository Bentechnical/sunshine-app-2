'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { X, CheckCircle, AlertCircle, Clock, ExternalLink, Trash2 } from 'lucide-react';
import { useDashboardUI } from '@/contexts/DashboardUIContext';

type ComplianceStatus = 'missing' | 'pending_review' | 'approved' | 'expiring' | 'expired' | 'rejected';

export interface ComplianceInitialData {
  vsc_document_url: string | null;
  vsc_date_issued: string | null;
  vsc_renewal_due: string | null;
  vsc_verification_status: string | null;
  vsc_upload_comment: string | null;
  vsc_rejection_reason: string | null;
  vaccine_record_url: string | null;
  vaccine_date_issued: string | null;
  vaccine_expiry_date: string | null;
  vaccine_verification_status: string | null;
  vaccine_upload_comment: string | null;
  vaccine_rejection_reason: string | null;
  vaccine_supporting_urls: string[] | null;
}

interface Props {
  initialData: ComplianceInitialData;
  onClose: () => void;
  onSaved: () => void;
}

function getComplianceStatus(documentUrl: string | null, expiryDate: string | null, verificationStatus: string | null): ComplianceStatus {
  if (!documentUrl) return 'missing';
  if (verificationStatus === 'rejected') return 'rejected';
  if (!verificationStatus || verificationStatus === 'pending_review') return 'pending_review';
  if (!expiryDate) return 'approved';
  const expiry = new Date(expiryDate);
  const daysUntil = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= 30) return 'expiring';
  return 'approved';
}

const statusConfig: Record<ComplianceStatus, { label: string; icon: React.ReactNode; classes: string }> = {
  missing:        { label: 'Not uploaded',  icon: <AlertCircle size={14} />, classes: 'bg-red-100 text-red-700' },
  pending_review: { label: 'Needs Review',  icon: <Clock size={14} />,       classes: 'bg-amber-100 text-amber-800' },
  approved:       { label: 'Valid',         icon: <CheckCircle size={14} />, classes: 'bg-green-100 text-green-700' },
  expiring:       { label: 'Expiring soon', icon: <Clock size={14} />,       classes: 'bg-amber-100 text-amber-700' },
  expired:        { label: 'Expired',       icon: <AlertCircle size={14} />, classes: 'bg-red-100 text-red-800' },
  rejected:       { label: 'Rejected',      icon: <AlertCircle size={14} />, classes: 'bg-red-100 text-red-700' },
};

async function isPdfPasswordProtected(file: File): Promise<boolean> {
  if (file.type !== 'application/pdf') return false;
  try {
    const buffer = await file.slice(0, Math.min(file.size, 4096)).arrayBuffer();
    const text = new TextDecoder('latin1').decode(buffer);
    return text.includes('/Encrypt');
  } catch {
    return false;
  }
}

export default function ComplianceDocsModal({ initialData, onClose, onSaved }: Props) {
  const { user } = useUser();
  const { setHideMobileNav } = useDashboardUI();
  const vscFileRef = useRef<HTMLInputElement>(null);
  const vaccineFileRef = useRef<HTMLInputElement>(null);
  const supportingFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHideMobileNav(true);
    return () => setHideMobileNav(false);
  }, [setHideMobileNav]);

  // VSC state
  const [vscDocUrl, setVscDocUrl] = useState(initialData.vsc_document_url ?? '');
  const [vscDateIssued, setVscDateIssued] = useState(initialData.vsc_date_issued ?? '');
  const [vscRenewalDue] = useState(initialData.vsc_renewal_due ?? '');
  const [vscVerificationStatus, setVscVerificationStatus] = useState<string | null>(initialData.vsc_verification_status ?? null);
  const [vscUploadComment, setVscUploadComment] = useState(initialData.vsc_upload_comment ?? '');
  const [vscUploading, setVscUploading] = useState(false);
  const [vscRemoving, setVscRemoving] = useState(false);
  const [vscUploadError, setVscUploadError] = useState<string | null>(null);
  const [vscUnsaved, setVscUnsaved] = useState(false);
  const [complianceSaving, setComplianceSaving] = useState(false);
  const [complianceError, setComplianceError] = useState<string | null>(null);

  // Vaccine state
  const [vaccineDocUrl, setVaccineDocUrl] = useState(initialData.vaccine_record_url ?? '');
  const [vaccineIssued, setVaccineIssued] = useState(initialData.vaccine_date_issued ?? '');
  const [vaccineExpiry, setVaccineExpiry] = useState(initialData.vaccine_expiry_date ?? '');
  const [vaccineVerificationStatus, setVaccineVerificationStatus] = useState<string | null>(initialData.vaccine_verification_status ?? null);
  const [vaccineUploadComment, setVaccineUploadComment] = useState(initialData.vaccine_upload_comment ?? '');
  const [vaccineUploading, setVaccineUploading] = useState(false);
  const [vaccineRemoving, setVaccineRemoving] = useState(false);
  const [vaccineUploadError, setVaccineUploadError] = useState<string | null>(null);
  const [vaccineUnsaved, setVaccineUnsaved] = useState(false);
  const [vaccineSaving, setVaccineSaving] = useState(false);
  const [vaccineError, setVaccineError] = useState<string | null>(null);

  // Supporting docs state
  const [vaccineSupportingUrls, setVaccineSupportingUrls] = useState<string[]>(initialData.vaccine_supporting_urls ?? []);
  const [supportingUploading, setSupportingUploading] = useState(false);
  const [supportingUploadError, setSupportingUploadError] = useState<string | null>(null);

  // Badge display: hide entirely when doc uploaded but not yet saved
  const vscStatus = vscUnsaved ? null : getComplianceStatus(vscDocUrl || null, vscRenewalDue || null, vscVerificationStatus);
  const vaccineStatus = vaccineUnsaved ? null : getComplianceStatus(vaccineDocUrl || null, vaccineExpiry || null, vaccineVerificationStatus);
  const vscBadge = vscStatus ? statusConfig[vscStatus] : null;
  const vaccineBadge = vaccineStatus ? statusConfig[vaccineStatus] : null;

  // ── VSC compliance ──────────────────────────────────────────────────────────

  const saveComplianceFields = async (docUrl: string, dateIssued: string): Promise<boolean> => {
    setComplianceSaving(true);
    setComplianceError(null);
    try {
      const res = await fetch('/api/volunteer/compliance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vsc_document_url: docUrl || null, vsc_date_issued: dateIssued || null, vsc_upload_comment: vscUploadComment || null }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setComplianceError(json.error || 'Failed to save. Please try again.');
        return false;
      }
      return true;
    } catch {
      setComplianceError('Failed to save. Please try again.');
      return false;
    } finally {
      setComplianceSaving(false);
    }
  };

  const handleVscFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (await isPdfPasswordProtected(file)) {
      setVscUploadError('This file appears to be password-protected. It will still be uploaded, but please share the password in the comment field below so our team can review it.');
      if (!vscUploadComment) setVscUploadComment('Password: ');
    } else {
      setVscUploadError(null);
    }
    setVscUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'vsc');

      const res = await fetch('/api/compliance/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setVscUploadError(data.error || 'Upload failed. Please try again.');
        return;
      }

      const newPath = data.path;
      setVscDocUrl(newPath);
      if (vscDateIssued) {
        setVscVerificationStatus('pending_review');
        setVscUnsaved(false);
        await saveComplianceFields(newPath, vscDateIssued);
      } else {
        setVscUnsaved(true);
      }
    } catch {
      setVscUploadError('Upload failed. Please try again.');
    } finally {
      setVscUploading(false);
      if (vscFileRef.current) vscFileRef.current.value = '';
    }
  };

  const handleVscDateBlur = () => {
    if (vscDocUrl && vscDateIssued) {
      setVscVerificationStatus('pending_review');
      setVscUnsaved(false);
      saveComplianceFields(vscDocUrl, vscDateIssued);
    }
  };

  const handleSaveVscOnly = async () => {
    if (vscDocUrl && !vscDateIssued) {
      setComplianceError('Please enter the VSC issue date.');
      return;
    }
    const docToSave = vscDocUrl || '';
    const issuedToSave = vscDocUrl ? vscDateIssued : '';
    const ok = await saveComplianceFields(docToSave, issuedToSave);
    if (ok) {
      setComplianceError(null);
      setVscUnsaved(false);
      if (vscDocUrl) setVscVerificationStatus('pending_review');
      if (!vscDocUrl) {
        setVscDateIssued('');
        setVscVerificationStatus(null);
      }
    }
  };

  const handleViewVsc = async () => {
    try {
      const res = await fetch('/api/volunteer/compliance/documents');
      const data = await res.json();
      if (data.vsc_signed_url) window.open(data.vsc_signed_url, '_blank', 'noopener,noreferrer');
    } catch { /* silent */ }
  };

  const handleRemoveVsc = async () => {
    if (!confirm('Remove your VSC document? This cannot be undone.')) return;
    setVscRemoving(true);
    setComplianceError(null);
    try {
      const res = await fetch('/api/volunteer/compliance', { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setComplianceError(json.error || 'Failed to remove document.');
        return;
      }
      setVscDocUrl('');
      setVscDateIssued('');
      setVscVerificationStatus(null);
      setVscUploadComment('');
    } catch {
      setComplianceError('Failed to remove document.');
    } finally {
      setVscRemoving(false);
    }
  };

  // ── Vaccine compliance ─────────────────────────────────────────────────────

  const saveVaccineFields = async (docUrl: string, issued: string, expiry: string): Promise<boolean> => {
    setVaccineSaving(true);
    setVaccineError(null);
    try {
      const res = await fetch('/api/volunteer/dog/compliance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaccine_record_url: docUrl || null, vaccine_date_issued: issued || null, vaccine_expiry_date: expiry || null, vaccine_upload_comment: vaccineUploadComment || null, vaccine_supporting_urls: vaccineSupportingUrls }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setVaccineError(json.error || 'Failed to save. Please try again.');
        return false;
      }
      return true;
    } catch {
      setVaccineError('Failed to save. Please try again.');
      return false;
    } finally {
      setVaccineSaving(false);
    }
  };

  const handleVaccineFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (await isPdfPasswordProtected(file)) {
      setVaccineUploadError('This file appears to be password-protected. It will still be uploaded, but please share the password in the comment field below so our team can review it.');
      if (!vaccineUploadComment) setVaccineUploadComment('Password: ');
    } else {
      setVaccineUploadError(null);
    }
    setVaccineUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'vaccine');

      const res = await fetch('/api/compliance/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setVaccineUploadError(data.error || 'Upload failed. Please try again.');
        return;
      }

      const newPath = data.path;
      setVaccineDocUrl(newPath);
      if (vaccineIssued && vaccineExpiry) {
        setVaccineVerificationStatus('pending_review');
        setVaccineUnsaved(false);
        await saveVaccineFields(newPath, vaccineIssued, vaccineExpiry);
      } else {
        setVaccineUnsaved(true);
      }
    } catch {
      setVaccineUploadError('Upload failed. Please try again.');
    } finally {
      setVaccineUploading(false);
      if (vaccineFileRef.current) vaccineFileRef.current.value = '';
    }
  };

  const handleVaccineDateBlur = () => {
    if (vaccineDocUrl && vaccineIssued && vaccineExpiry) {
      setVaccineVerificationStatus('pending_review');
      setVaccineUnsaved(false);
      saveVaccineFields(vaccineDocUrl, vaccineIssued, vaccineExpiry);
    }
  };

  const handleSaveVaccineOnly = async () => {
    if (vaccineDocUrl && (!vaccineIssued || !vaccineExpiry)) {
      setVaccineError('Please enter both the date of issue and expiry date.');
      return;
    }
    const docToSave = vaccineDocUrl || '';
    const issuedToSave = vaccineDocUrl ? vaccineIssued : '';
    const expiryToSave = vaccineDocUrl ? vaccineExpiry : '';
    const ok = await saveVaccineFields(docToSave, issuedToSave, expiryToSave);
    if (ok) {
      setVaccineError(null);
      setVaccineUnsaved(false);
      if (vaccineDocUrl) setVaccineVerificationStatus('pending_review');
      if (!vaccineDocUrl) {
        setVaccineIssued('');
        setVaccineExpiry('');
        setVaccineVerificationStatus(null);
      }
    }
  };

  const handleViewVaccine = async () => {
    try {
      const res = await fetch('/api/volunteer/compliance/documents');
      const data = await res.json();
      if (data.vaccine_signed_url) window.open(data.vaccine_signed_url, '_blank', 'noopener,noreferrer');
    } catch { /* silent */ }
  };

  const handleRemoveVaccine = async () => {
    if (!confirm("Remove your dog's vaccine record? This cannot be undone.")) return;
    setVaccineRemoving(true);
    setVaccineError(null);
    try {
      const res = await fetch('/api/volunteer/dog/compliance', { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setVaccineError(json.error || 'Failed to remove document.');
        return;
      }
      setVaccineDocUrl('');
      setVaccineIssued('');
      setVaccineExpiry('');
      setVaccineVerificationStatus(null);
      setVaccineUploadComment('');
      setVaccineSupportingUrls([]);
    } catch {
      setVaccineError('Failed to remove document.');
    } finally {
      setVaccineRemoving(false);
    }
  };

  const dateCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col pb-[env(safe-area-inset-bottom)]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Compliance Documents</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <div className="space-y-6">
            <p className="text-sm text-gray-500">
              These documents may be required before your first visit. All submissions are manually reviewed by Sunshine staff. If you replace or remove a document, the new submission will need to be re-approved.
            </p>

            {/* Vaccine section */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800">Rabies Vaccine Record</h3>
                {vaccineBadge && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${vaccineBadge.classes}`}>
                    {vaccineBadge.icon}
                    {vaccineBadge.label}
                  </span>
                )}
              </div>

              {/* Upload / View / Remove */}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Document</p>
                <p className="text-xs text-gray-500 mb-2">PDF or image (max 10 MB)</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => vaccineFileRef.current?.click()}
                    disabled={vaccineUploading || vaccineRemoving}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {vaccineUploading ? 'Uploading...' : vaccineDocUrl ? 'Replace' : 'Upload document'}
                  </button>

                  {vaccineDocUrl && !vaccineUploading && (
                    <>
                      <button
                        type="button"
                        onClick={handleViewVaccine}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        <ExternalLink size={13} />
                        View
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveVaccine}
                        disabled={vaccineRemoving}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                        {vaccineRemoving ? 'Removing...' : 'Remove'}
                      </button>
                    </>
                  )}

                  {vaccineSaving && <span className="text-xs text-gray-400">Saving...</span>}
                </div>
                <input
                  ref={vaccineFileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleVaccineFileChange}
                  className="hidden"
                  disabled={vaccineUploading}
                />
                {vaccineUploadError && <p className="text-xs text-red-500 mt-1">{vaccineUploadError}</p>}
              </div>

              {/* Upload comment */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Comment (optional)</label>
                <textarea
                  value={vaccineUploadComment}
                  onChange={e => setVaccineUploadComment(e.target.value)}
                  placeholder="Add a note about your document if needed"
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Dates side-by-side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Date of Issue</label>
                  <input
                    type="date"
                    value={vaccineIssued}
                    onChange={e => setVaccineIssued(e.target.value)}
                    onBlur={handleVaccineDateBlur}
                    max={new Date().toISOString().split('T')[0]}
                    className={dateCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Expiry Date</label>
                  <input
                    type="date"
                    value={vaccineExpiry}
                    onChange={e => setVaccineExpiry(e.target.value)}
                    onBlur={handleVaccineDateBlur}
                    className={dateCls}
                  />
                </div>
              </div>

              {/* Supporting docs */}
              {vaccineDocUrl && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">Additional Documents (optional)</p>
                  <p className="text-xs text-gray-500 mb-2">Upload any additional vaccine records (boosters, vet letters, etc.)</p>

                  {vaccineSupportingUrls.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {vaccineSupportingUrls.map((_, i) => (
                        <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                          <span className="text-xs text-gray-600">Supporting document {i + 1}</span>
                          <button
                            type="button"
                            onClick={() => setVaccineSupportingUrls(vaccineSupportingUrls.filter((__, idx) => idx !== i))}
                            disabled={vaccineSaving}
                            className="text-red-500 hover:text-red-700 transition p-0.5"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => supportingFileRef.current?.click()}
                    disabled={supportingUploading || vaccineSaving}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {supportingUploading ? 'Uploading...' : 'Add supporting document'}
                  </button>
                  <input
                    ref={supportingFileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setSupportingUploadError(null);
                      setSupportingUploading(true);
                      try {
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('type', 'vaccine_supporting');
                        const res = await fetch('/api/compliance/upload', { method: 'POST', body: formData });
                        const data = await res.json();
                        if (!res.ok) { setSupportingUploadError(data.error || 'Upload failed.'); return; }
                        setVaccineSupportingUrls([...vaccineSupportingUrls, data.path]);
                      } catch {
                        setSupportingUploadError('Upload failed. Please try again.');
                      } finally {
                        setSupportingUploading(false);
                        if (supportingFileRef.current) supportingFileRef.current.value = '';
                      }
                    }}
                    className="hidden"
                  />
                  {supportingUploadError && <p className="text-xs text-red-500 mt-1">{supportingUploadError}</p>}
                </div>
              )}

              {vaccineUnsaved && vaccineDocUrl && (
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  File uploaded. Fill in the dates and click Save to submit for review.
                </p>
              )}
              {!vaccineUnsaved && vaccineVerificationStatus === 'pending_review' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Your submission is being reviewed by Sunshine staff. Please allow up to 48 hours for approval.
                </p>
              )}
              {vaccineVerificationStatus === 'rejected' && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
                  <p className="font-semibold">Your document was not accepted. Please upload a new document.</p>
                  {initialData.vaccine_rejection_reason && (
                    <p>Admin comment: {initialData.vaccine_rejection_reason}</p>
                  )}
                </div>
              )}

              {vaccineError && <p className="text-xs text-red-600">{vaccineError}</p>}

              <button
                type="button"
                onClick={handleSaveVaccineOnly}
                disabled={vaccineSaving || vaccineUploading || vaccineRemoving}
                className="w-full py-2 px-3 bg-[#0e62ae] text-white text-sm font-semibold rounded-lg hover:bg-[#094e8b] transition disabled:opacity-50"
              >
                {vaccineSaving ? 'Saving...' : 'Save Vaccine Record'}
              </button>
            </div>

            {/* VSC section */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800">Vulnerable Sector Check (VSC)</h3>
                {vscBadge && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${vscBadge.classes}`}>
                    {vscBadge.icon}
                    {vscBadge.label}
                  </span>
                )}
              </div>

              {/* Upload / View / Remove */}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Document</p>
                <p className="text-xs text-gray-500 mb-2">PDF or image (max 10 MB)</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => vscFileRef.current?.click()}
                    disabled={vscUploading || vscRemoving}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {vscUploading ? 'Uploading...' : vscDocUrl ? 'Replace' : 'Upload document'}
                  </button>

                  {vscDocUrl && !vscUploading && (
                    <>
                      <button
                        type="button"
                        onClick={handleViewVsc}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        <ExternalLink size={13} />
                        View
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveVsc}
                        disabled={vscRemoving}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                        {vscRemoving ? 'Removing...' : 'Remove'}
                      </button>
                    </>
                  )}

                  {complianceSaving && <span className="text-xs text-gray-400">Saving...</span>}
                </div>
                <input
                  ref={vscFileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleVscFileChange}
                  className="hidden"
                  disabled={vscUploading}
                />
                {vscUploadError && <p className="text-xs text-red-500 mt-1">{vscUploadError}</p>}
              </div>

              {/* Upload comment */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Comment (optional)</label>
                <textarea
                  value={vscUploadComment}
                  onChange={e => setVscUploadComment(e.target.value)}
                  placeholder="Add a note about your document if needed"
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Date issued */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Date Issued</label>
                <input
                  type="date"
                  value={vscDateIssued}
                  onChange={e => setVscDateIssued(e.target.value)}
                  onBlur={handleVscDateBlur}
                  max={new Date().toISOString().split('T')[0]}
                  className={dateCls}
                />
              </div>

              {vscRenewalDue && (
                <p className="text-xs text-gray-500">
                  Renewal due: <span className="font-medium text-gray-700">{new Date(vscRenewalDue + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                </p>
              )}

              {vscUnsaved && vscDocUrl && (
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  File uploaded. Fill in the issue date and click Save to submit for review.
                </p>
              )}
              {!vscUnsaved && vscVerificationStatus === 'pending_review' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Your submission is being reviewed by Sunshine staff. Please allow up to 48 hours for approval.
                </p>
              )}
              {vscVerificationStatus === 'rejected' && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
                  <p className="font-semibold">Your document was not accepted. Please upload a new document.</p>
                  {initialData.vsc_rejection_reason && (
                    <p>Admin comment: {initialData.vsc_rejection_reason}</p>
                  )}
                </div>
              )}

              {complianceError && <p className="text-xs text-red-600">{complianceError}</p>}

              <button
                type="button"
                onClick={handleSaveVscOnly}
                disabled={complianceSaving || vscUploading || vscRemoving}
                className="w-full py-2 px-3 bg-[#0e62ae] text-white text-sm font-semibold rounded-lg hover:bg-[#094e8b] transition disabled:opacity-50"
              >
                {complianceSaving ? 'Saving...' : 'Save VSC'}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
