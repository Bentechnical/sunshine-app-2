// src/components/visits/OrgEditProfileModal.tsx
'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
import AvatarUpload from '@/components/profile/AvatarUpload';
import PlacesAutocomplete, { PlaceResult } from '@/components/ui/PlacesAutocomplete';

const formatPhoneNumber = (value: string) => {
  const cleaned = value.replace(/\D/g, '').slice(0, 10);
  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
  if (match) {
    const parts = [match[1], match[2], match[3]].filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return `(${parts[0]}`;
    if (parts.length === 2) return `(${parts[0]}) ${parts[1]}`;
    return `(${parts[0]}) ${parts[1]}-${parts[2]}`;
  }
  return value;
};

export interface OrgProfile {
  org_name: string;
  org_type: string;
  org_address: string;
  org_place_id: string;
  location_lat: number | null;
  location_lng: number | null;
  org_contact_name: string;
  org_contact_phone: string;
  postal_code: string;
  profile_image: string;
}

interface Props {
  profile: OrgProfile;
  onClose: () => void;
  onSaved: (profile: OrgProfile) => void;
}

export default function OrgEditProfileModal({ profile, onClose, onSaved }: Props) {
  const [form, setForm] = useState<OrgProfile>({ ...profile });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    (field: keyof OrgProfile) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handlePlaceSelect = (result: PlaceResult) => {
    setForm(prev => ({
      ...prev,
      org_address: result.formatted_address,
      org_place_id: result.place_id,
      location_lat: result.lat,
      location_lng: result.lng,
      postal_code: result.postal_code || prev.postal_code,
    }));
  };

  const handleSave = async () => {
    if (!form.org_name.trim() || !form.org_contact_name.trim() || !form.org_contact_phone.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!form.org_address.trim()) {
      setError("Please select your organization's address.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/org/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to save'); return; }
      onSaved(form);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lc = 'block text-sm font-semibold text-gray-700 mb-1';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Edit Organization Profile</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Logo upload */}
          <div className="flex flex-col items-center gap-2">
            <p className={`${lc} self-start`}>Organization Logo</p>
            <div className="flex flex-col items-center gap-1">
              <AvatarUpload
                initialUrl={form.profile_image}
                onUpload={url => setForm(prev => ({ ...prev, profile_image: url }))}
                size={96}
                altText="Organization logo"
                variant="org"
              />
              <p className="text-xs text-gray-400">Click to upload logo</p>
            </div>
          </div>

          <div>
            <label className={lc}>Organization Name <span className="text-red-500">*</span></label>
            <input className={ic} value={form.org_name} onChange={set('org_name')} placeholder="e.g., Sunnybrook Hospital" />
          </div>

          <div>
            <label className={lc}>Primary Contact Name <span className="text-red-500">*</span></label>
            <input className={ic} value={form.org_contact_name} onChange={set('org_contact_name')} placeholder="e.g., Jane Smith" />
          </div>

          <div>
            <label className={lc}>Contact Phone <span className="text-red-500">*</span></label>
            <input
              type="tel"
              className={ic}
              value={form.org_contact_phone}
              onChange={e => setForm(prev => ({ ...prev, org_contact_phone: formatPhoneNumber(e.target.value) }))}
              placeholder="(123) 456-7890"
            />
          </div>

          <div>
            <label className={lc}>Organization Address <span className="text-red-500">*</span></label>
            <PlacesAutocomplete
              value={form.org_address}
              onSelect={handlePlaceSelect}
              onChange={v => setForm(prev => ({ ...prev, org_address: v }))}
              className={ic}
              placeholder="Start typing your address…"
            />
            <p className="text-xs text-gray-400 mt-1">Select from the dropdown to confirm.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#0e62ae] text-white font-semibold rounded-xl hover:bg-[#0a4f8f] disabled:opacity-50 transition"
          >
            <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

      </div>
    </div>
  );
}
