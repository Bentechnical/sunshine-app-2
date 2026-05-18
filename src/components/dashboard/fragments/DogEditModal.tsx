'use client';

import { useState, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { X, CheckCircle, AlertCircle, Clock, ExternalLink, Trash2 } from 'lucide-react';
import AvatarUpload, { AvatarUploadHandle } from '@/components/profile/AvatarUpload';

type Tab = 'info' | 'vaccine';
type ComplianceStatus = 'missing' | 'uploaded' | 'expiring' | 'expired';

interface InitialDog {
  dog_name: string;
  dog_breed: string;
  dog_bio: string;
  dog_age: number | null;
  dog_picture_url: string | null;
  vaccine_record_url: string | null;
  vaccine_expiry_date: string | null;
}

interface Props {
  initialDog: InitialDog;
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

export default function DogEditModal({ initialDog, onClose, onSaved }: Props) {
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const dogAvatarRef = useRef<AvatarUploadHandle>(null);
  const vaccineFileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('info');

  // Dog info form state
  const [dogName, setDogName] = useState(initialDog.dog_name);
  const [dogBreed, setDogBreed] = useState(initialDog.dog_breed);
  const [dogAge, setDogAge] = useState(initialDog.dog_age?.toString() ?? '');
  const [dogBio, setDogBio] = useState(initialDog.dog_bio);
  const dogPictureRef = useRef(initialDog.dog_picture_url ?? '');
  const [saving, setSaving] = useState(false);
  const [dogError, setDogError] = useState<string | null>(null);

  // Vaccine state
  const [vaccineDocUrl, setVaccineDocUrl] = useState(initialDog.vaccine_record_url ?? '');
  const [vaccineExpiry, setVaccineExpiry] = useState(initialDog.vaccine_expiry_date ?? '');
  const [vaccineUploading, setVaccineUploading] = useState(false);
  const [vaccineRemoving, setVaccineRemoving] = useState(false);
  const [vaccineUploadError, setVaccineUploadError] = useState<string | null>(null);
  const [vaccineSaving, setVaccineSaving] = useState(false);
  const [vaccineError, setVaccineError] = useState<string | null>(null);

  const vaccineStatus = getComplianceStatus(vaccineDocUrl || null, vaccineExpiry || null);

  // ── Dog info save ───────────────────────────────────────────────────────────

  const handleSaveDog = async () => {
    if (!user?.id) return;
    if (!dogName.trim()) { setDogError("Dog's name is required."); return; }

    setSaving(true);
    setDogError(null);

    const { error } = await supabase
      .from('dogs')
      .update({
        dog_name: dogName.trim(),
        dog_breed: dogBreed.trim(),
        dog_age: dogAge ? parseInt(dogAge) : null,
        dog_bio: dogBio.trim(),
        dog_picture_url: dogPictureRef.current || null,
      })
      .eq('volunteer_id', user.id);

    setSaving(false);

    if (error) {
      setDogError('Failed to save. Please try again.');
      return;
    }

    onSaved();
    onClose();
  };

  // ── Vaccine compliance ──────────────────────────────────────────────────────

  const saveVaccineFields = async (docUrl: string, expiry: string): Promise<boolean> => {
    setVaccineSaving(true);
    setVaccineError(null);
    try {
      const res = await fetch('/api/volunteer/dog/compliance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaccine_record_url: docUrl || null, vaccine_expiry_date: expiry || null }),
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

    setVaccineUploadError(null);
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
      await saveVaccineFields(newPath, vaccineExpiry);
    } catch {
      setVaccineUploadError('Upload failed. Please try again.');
    } finally {
      setVaccineUploading(false);
      if (vaccineFileRef.current) vaccineFileRef.current.value = '';
    }
  };

  const handleVaccineExpiryBlur = () => {
    saveVaccineFields(vaccineDocUrl, vaccineExpiry);
  };

  const handleSaveVaccine = async () => {
    const ok = await saveVaccineFields(vaccineDocUrl, vaccineExpiry);
    if (ok) {
      onSaved();
      onClose();
    }
  };

  const handleViewVaccine = async () => {
    try {
      const res = await fetch('/api/volunteer/compliance/documents');
      const data = await res.json();
      if (data.vaccine_signed_url) {
        window.open(data.vaccine_signed_url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // Silent fail — no action needed
    }
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
      setVaccineExpiry('');
    } catch {
      setVaccineError('Failed to remove document.');
    } finally {
      setVaccineRemoving(false);
    }
  };

  // ── Shared styles ────────────────────────────────────────────────────────────

  const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const lc = 'block text-sm font-semibold text-gray-700 mb-1.5';

  const { label: vaccineLabel, icon: vaccineIcon, classes: vaccineClasses } = statusConfig[vaccineStatus];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Edit Dog Profile</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-3 pb-0 gap-4 shrink-0 border-b border-gray-100">
          {(['info', 'vaccine'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'info' ? 'Dog Info' : 'Vaccine Records'}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {tab === 'info' && (
            <div className="space-y-5">

              {/* Dog photo */}
              <div className="flex items-center gap-4">
                <AvatarUpload
                  ref={dogAvatarRef}
                  initialUrl={dogPictureRef.current}
                  fallbackUrl="/images/default_dog.png"
                  onUpload={url => { dogPictureRef.current = url; }}
                  size={72}
                  altText="Dog photo"
                />
                <button
                  type="button"
                  onClick={() => dogAvatarRef.current?.triggerClick()}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  Change photo
                </button>
              </div>

              {/* Name */}
              <div>
                <label className={lc}>Dog's Name</label>
                <input
                  type="text"
                  value={dogName}
                  onChange={e => setDogName(e.target.value)}
                  placeholder="e.g., Buddy"
                  className={ic}
                />
              </div>

              {/* Breed */}
              <div>
                <label className={lc}>Breed</label>
                <input
                  type="text"
                  value={dogBreed}
                  onChange={e => setDogBreed(e.target.value)}
                  placeholder="e.g., Golden Retriever"
                  className={ic}
                />
              </div>

              {/* Age */}
              <div>
                <label className={lc}>Age (years)</label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={dogAge}
                  onChange={e => setDogAge(e.target.value)}
                  placeholder="e.g., 3"
                  className={ic}
                />
              </div>

              {/* Bio */}
              <div>
                <label className={lc}>About</label>
                <textarea
                  value={dogBio}
                  onChange={e => setDogBio(e.target.value)}
                  rows={4}
                  placeholder="Tell us about your dog's personality..."
                  className={ic}
                />
              </div>

              {dogError && <p className="text-sm text-red-600">{dogError}</p>}
            </div>
          )}

          {tab === 'vaccine' && (
            <div className="space-y-6">
              <p className="text-sm text-gray-500">
                Keep your dog's vaccine records up to date. These may be required before visits.
              </p>

              <div className="rounded-xl border border-gray-200 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">Vaccine Record</h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${vaccineClasses}`}>
                    {vaccineIcon}
                    {vaccineLabel}
                  </span>
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
                      {vaccineUploading ? 'Uploading…' : vaccineDocUrl ? 'Replace' : 'Upload document'}
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
                          {vaccineRemoving ? 'Removing…' : 'Remove'}
                        </button>
                      </>
                    )}

                    {vaccineSaving && (
                      <span className="text-xs text-gray-400">Saving…</span>
                    )}
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

                {/* Expiry date */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Expiry Date</label>
                  <input
                    type="date"
                    value={vaccineExpiry}
                    onChange={e => setVaccineExpiry(e.target.value)}
                    onBlur={handleVaccineExpiryBlur}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {vaccineError && <p className="text-sm text-red-600">{vaccineError}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === 'info' && (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            <button
              onClick={handleSaveDog}
              disabled={saving}
              className="w-full py-2.5 px-4 bg-[#0e62ae] text-white text-sm font-semibold rounded-xl hover:bg-[#094e8b] transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}

        {tab === 'vaccine' && (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            <button
              onClick={handleSaveVaccine}
              disabled={vaccineSaving || vaccineUploading || vaccineRemoving}
              className="w-full py-2.5 px-4 bg-[#0e62ae] text-white text-sm font-semibold rounded-xl hover:bg-[#094e8b] transition disabled:opacity-50"
            >
              {vaccineSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
