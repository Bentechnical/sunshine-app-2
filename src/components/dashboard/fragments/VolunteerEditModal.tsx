'use client';

import { useState, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { X, CheckCircle, AlertCircle, Clock, ExternalLink, Trash2 } from 'lucide-react';
import AvatarUpload, { AvatarUploadHandle } from '@/components/profile/AvatarUpload';
import { geocodePostalCode } from '@/utils/geocode';

type Tab = 'profile' | 'compliance';
type ComplianceStatus = 'missing' | 'uploaded' | 'expiring' | 'expired';

interface InitialProfile {
  bio: string | null;
  phone_number: string | null;
  profile_image: string | null;
  postal_code: string | null;
  travel_distance_km: number | null;
  pronouns: string | null;
  vsc_document_url: string | null;
  vsc_date_issued: string | null;
  vsc_renewal_due: string | null;
}

interface Props {
  initialProfile: InitialProfile;
  onClose: () => void;
  onSaved: () => void;
}

function getComplianceStatus(documentUrl: string | null, expiryDate: string | null): ComplianceStatus {
  if (!documentUrl) return 'missing';
  if (!expiryDate) return 'uploaded';
  const expiry = new Date(expiryDate);
  const daysUntil = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= 30) return 'expiring';
  return 'uploaded';
}

const statusConfig: Record<ComplianceStatus, { label: string; icon: React.ReactNode; classes: string }> = {
  missing:  { label: 'Not uploaded', icon: <AlertCircle size={14} />, classes: 'bg-red-100 text-red-700' },
  uploaded: { label: 'Valid',         icon: <CheckCircle size={14} />, classes: 'bg-green-100 text-green-700' },
  expiring: { label: 'Expiring soon', icon: <Clock size={14} />,       classes: 'bg-amber-100 text-amber-700' },
  expired:  { label: 'Expired',       icon: <AlertCircle size={14} />, classes: 'bg-red-100 text-red-800' },
};

function formatPhoneNumber(value: string): string {
  const cleaned = value.replace(/\D/g, '').slice(0, 10);
  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
  if (!match) return value;
  const parts = [match[1], match[2], match[3]].filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return `(${parts[0]}`;
  if (parts.length === 2) return `(${parts[0]}) ${parts[1]}`;
  return `(${parts[0]}) ${parts[1]}-${parts[2]}`;
}

function normalizePostalCode(code: string): string {
  const upper = code.toUpperCase().replace(/\s+/g, '');
  return upper.length === 6 ? `${upper.slice(0, 3)} ${upper.slice(3)}` : upper;
}

export default function VolunteerEditModal({ initialProfile, onClose, onSaved }: Props) {
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const avatarRef = useRef<AvatarUploadHandle>(null);
  const vscFileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('profile');

  // Profile form state
  const [bio, setBio] = useState(initialProfile.bio ?? '');
  const [phone, setPhone] = useState(initialProfile.phone_number ?? '');
  const [postalCode, setPostalCode] = useState(initialProfile.postal_code ?? '');
  const [travelDistance, setTravelDistance] = useState(initialProfile.travel_distance_km ?? 10);
  const [pronouns, setPronouns] = useState(initialProfile.pronouns ?? '');
  const avatarUrlRef = useRef(initialProfile.profile_image ?? '');
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Compliance state
  const [vscDocUrl, setVscDocUrl] = useState(initialProfile.vsc_document_url ?? '');
  const [vscDateIssued, setVscDateIssued] = useState(initialProfile.vsc_date_issued ?? '');
  const [vscRenewalDue] = useState(initialProfile.vsc_renewal_due ?? '');
  const [vscUploading, setVscUploading] = useState(false);
  const [vscRemoving, setVscRemoving] = useState(false);
  const [vscUploadError, setVscUploadError] = useState<string | null>(null);
  const [complianceSaving, setComplianceSaving] = useState(false);
  const [complianceError, setComplianceError] = useState<string | null>(null);

  const vscStatus = getComplianceStatus(vscDocUrl || null, vscRenewalDue || null);

  // ── Profile save ────────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (!user?.id) return;

    const cleanCode = postalCode.toUpperCase().replace(/\s+/g, '');
    if (!cleanCode) { setProfileError('Postal code is required.'); return; }
    const validPostal = /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleanCode);
    if (!validPostal) { setProfileError('Postal code must be in the format A1A 1A1.'); return; }

    setSaving(true);
    setProfileError(null);

    const normalized = normalizePostalCode(cleanCode);
    const payload: Record<string, unknown> = {
      bio,
      phone_number: phone,
      profile_image: avatarUrlRef.current,
      postal_code: normalized,
      travel_distance_km: travelDistance,
      pronouns,
    };

    try {
      const { lat, lng } = await geocodePostalCode(normalized, user.id);
      payload.location_lat = lat;
      payload.location_lng = lng;
    } catch {
      // Geocoding failure is non-fatal
    }

    const { error } = await supabase.from('users').update(payload).eq('id', user.id);

    setSaving(false);

    if (error) {
      setProfileError('Failed to save. Please try again.');
      return;
    }

    onSaved();
    onClose();
  };

  // ── VSC compliance ──────────────────────────────────────────────────────────

  const saveComplianceFields = async (docUrl: string, dateIssued: string): Promise<boolean> => {
    setComplianceSaving(true);
    setComplianceError(null);
    try {
      const res = await fetch('/api/volunteer/compliance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vsc_document_url: docUrl || null, vsc_date_issued: dateIssued || null }),
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

    setVscUploadError(null);
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
      await saveComplianceFields(newPath, vscDateIssued);
    } catch {
      setVscUploadError('Upload failed. Please try again.');
    } finally {
      setVscUploading(false);
      if (vscFileRef.current) vscFileRef.current.value = '';
    }
  };

  const handleVscDateBlur = () => {
    saveComplianceFields(vscDocUrl, vscDateIssued);
  };

  const handleSaveCompliance = async () => {
    const ok = await saveComplianceFields(vscDocUrl, vscDateIssued);
    if (ok) {
      onSaved();
      onClose();
    }
  };

  const handleViewVsc = async () => {
    try {
      const res = await fetch('/api/volunteer/compliance/documents');
      const data = await res.json();
      if (data.vsc_signed_url) {
        window.open(data.vsc_signed_url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // Silent fail — no action needed
    }
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
    } catch {
      setComplianceError('Failed to remove document.');
    } finally {
      setVscRemoving(false);
    }
  };

  // ── Shared styles ────────────────────────────────────────────────────────────

  const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const lc = 'block text-sm font-semibold text-gray-700 mb-1.5';

  const { label: vscLabel, icon: vscIcon, classes: vscClasses } = statusConfig[vscStatus];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Edit Profile</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-3 pb-0 gap-4 shrink-0 border-b border-gray-100">
          {(['profile', 'compliance'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-semibold capitalize border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'compliance' ? 'Documents' : 'My Profile'}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {tab === 'profile' && (
            <div className="space-y-5">

              {/* Photo */}
              <div className="flex items-center gap-4">
                <AvatarUpload
                  ref={avatarRef}
                  initialUrl={avatarUrlRef.current}
                  fallbackUrl="https://via.placeholder.com/100"
                  onUpload={url => { avatarUrlRef.current = url; }}
                  size={72}
                  altText="Profile picture"
                />
                <button
                  type="button"
                  onClick={() => avatarRef.current?.triggerClick()}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  Change photo
                </button>
              </div>

              {/* Phone */}
              <div>
                <label className={lc}>Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(formatPhoneNumber(e.target.value))}
                  placeholder="(123) 456-7890"
                  className={ic}
                />
              </div>

              {/* Postal Code */}
              <div>
                <label className={lc}>Postal Code</label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={e => setPostalCode(e.target.value.toUpperCase())}
                  placeholder="e.g., M5V 2T6"
                  className={`${ic} uppercase`}
                />
              </div>

              {/* Travel Distance */}
              <div>
                <label className={lc}>Travel Distance</label>
                <select
                  value={travelDistance}
                  onChange={e => setTravelDistance(Number(e.target.value))}
                  className={ic}
                >
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                  <option value={25}>25 km</option>
                  <option value={50}>50 km</option>
                </select>
              </div>

              {/* Bio */}
              <div>
                <label className={lc}>Bio</label>
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  rows={4}
                  placeholder="Tell us about yourself..."
                  className={ic}
                />
              </div>

              {/* Pronouns */}
              <div>
                <label className={lc}>Pronouns</label>
                <select value={pronouns} onChange={e => setPronouns(e.target.value)} className={ic}>
                  <option value="">Select pronouns</option>
                  <option value="he/him">He/Him</option>
                  <option value="she/her">She/Her</option>
                  <option value="they/them">They/Them</option>
                </select>
              </div>

              {profileError && <p className="text-sm text-red-600">{profileError}</p>}
            </div>
          )}

          {tab === 'compliance' && (
            <div className="space-y-6">
              <p className="text-sm text-gray-500">
                These documents may be required before your first visit. Upload updates here any time.
              </p>

              {/* VSC section */}
              <div className="rounded-xl border border-gray-200 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">Vulnerable Sector Check (VSC)</h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${vscClasses}`}>
                    {vscIcon}
                    {vscLabel}
                  </span>
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
                      {vscUploading ? 'Uploading…' : vscDocUrl ? 'Replace' : 'Upload document'}
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
                          {vscRemoving ? 'Removing…' : 'Remove'}
                        </button>
                      </>
                    )}

                    {complianceSaving && (
                      <span className="text-xs text-gray-400">Saving…</span>
                    )}
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

                {/* Date issued */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Date Issued</label>
                  <input
                    type="date"
                    value={vscDateIssued}
                    onChange={e => setVscDateIssued(e.target.value)}
                    onBlur={handleVscDateBlur}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {vscRenewalDue && (
                  <p className="text-xs text-gray-500">
                    Renewal due: <span className="font-medium text-gray-700">{new Date(vscRenewalDue + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  </p>
                )}
              </div>

              {complianceError && <p className="text-sm text-red-600">{complianceError}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === 'profile' && (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full py-2.5 px-4 bg-[#0e62ae] text-white text-sm font-semibold rounded-xl hover:bg-[#094e8b] transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}

        {tab === 'compliance' && (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            <button
              onClick={handleSaveCompliance}
              disabled={complianceSaving || vscUploading || vscRemoving}
              className="w-full py-2.5 px-4 bg-[#0e62ae] text-white text-sm font-semibold rounded-xl hover:bg-[#094e8b] transition disabled:opacity-50"
            >
              {complianceSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
