// src/components/admin/ManagedOrgModal.tsx
'use client';

import { useState } from 'react';
import { X, Save, Building2 } from 'lucide-react';
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

const ORG_TYPES = [
  'School',
  'Hospital',
  'Long-term Care Home',
  'Mental Health Facility',
  'Library',
  'Community Centre',
  'University / College',
  'Workplace',
  'Other',
];

const FEE_TIERS = [
  { value: 'tier_500', label: '$500 — Corporate / for-profit / conferences / large events' },
  { value: 'tier_200', label: '$200 — Post-secondary / private schools / private care / wellness' },
  { value: 'tier_0', label: '$0 — Public schools / non-profits / first responders / inpatients' },
];

const PARKING_OPTIONS = [
  { value: 'free_on_site', label: 'Free on-site parking' },
  { value: 'reimbursed_on_site', label: 'Reimbursed on-site parking' },
  { value: 'invoice', label: 'Invoice / billed separately' },
];

export interface ManagedOrgData {
  id?: string;
  org_name: string;
  org_type: string;
  org_address: string;
  org_place_id: string;
  location_lat: number | null;
  location_lng: number | null;
  postal_code: string;
  org_contact_name: string;
  org_contact_phone: string;
  email: string;
  fee_tier: string;
  profile_image: string;
  default_parking_coverage: string;
  default_parking_instructions: string;
  default_arrival_instructions: string;
  default_event_description: string;
  default_accessibility_notes: string;
  default_space_sqft: number | null;
  default_dogs_needed: number | null;
  default_requires_vsc: boolean | null;
}

const EMPTY_FORM: ManagedOrgData = {
  org_name: '',
  org_type: '',
  org_address: '',
  org_place_id: '',
  location_lat: null,
  location_lng: null,
  postal_code: '',
  org_contact_name: '',
  org_contact_phone: '',
  email: '',
  fee_tier: '',
  profile_image: '',
  default_parking_coverage: '',
  default_parking_instructions: '',
  default_arrival_instructions: '',
  default_event_description: '',
  default_accessibility_notes: '',
  default_space_sqft: null,
  default_dogs_needed: null,
  default_requires_vsc: null,
};

interface Props {
  mode: 'create' | 'edit';
  /** 'managed' = admin-managed org (no Clerk account); 'linked' = real org with Clerk account */
  context?: 'managed' | 'linked';
  initialData?: Partial<ManagedOrgData>;
  onClose: () => void;
  onSaved: (data: ManagedOrgData & { id: string; assigned_region_id?: number | null }) => void;
}

export default function ManagedOrgModal({ mode, context = 'managed', initialData, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ManagedOrgData>({
    ...EMPTY_FORM,
    ...initialData,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLinked = context === 'linked';

  const set =
    (field: keyof ManagedOrgData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
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
    if (!form.org_name.trim()) {
      setError('Organization name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = isLinked
        ? `/api/admin/edit-org/${initialData?.id}`
        : mode === 'create'
          ? '/api/admin/managed-orgs'
          : `/api/admin/managed-orgs/${initialData?.id}`;

      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to save');
        return;
      }

      onSaved({
        ...form,
        id: mode === 'create' ? json.id : initialData!.id!,
        assigned_region_id: json.assigned_region_id ?? null,
      });
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const icDisabled = `${ic} bg-gray-50 text-gray-500 cursor-not-allowed`;
  const lc = 'block text-sm font-semibold text-gray-700 mb-1';
  const tc = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y min-h-[60px]';
  const sectionLabel = 'text-xs font-bold text-gray-400 uppercase tracking-wider';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-purple-600" />
            <h2 className="text-lg font-bold text-gray-900">
              {mode === 'create' ? 'Create Organization' : 'Edit Organization'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* ── Profile Section ── */}

          {/* Logo upload */}
          <div className="flex flex-col items-center gap-2">
            <p className={`${lc} self-start`}>Organization Logo</p>
            <div className="flex flex-col items-center gap-1">
              <AvatarUpload
                initialUrl={form.profile_image || undefined}
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
            <label className={lc}>Organization Type</label>
            <select className={ic} value={form.org_type} onChange={set('org_type')}>
              <option value="">Select type…</option>
              {ORG_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={lc}>Organization Address</label>
            <PlacesAutocomplete
              value={form.org_address}
              onSelect={handlePlaceSelect}
              onChange={v => setForm(prev => ({ ...prev, org_address: v }))}
              className={ic}
              placeholder="Start typing address…"
            />
            <p className="text-xs text-gray-400 mt-1">Select from the dropdown to confirm.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lc}>Contact Name</label>
              <input className={ic} value={form.org_contact_name} onChange={set('org_contact_name')} placeholder="e.g., Jane Smith" />
            </div>
            <div>
              <label className={lc}>Contact Phone</label>
              <input
                type="tel"
                className={ic}
                value={form.org_contact_phone}
                onChange={e => setForm(prev => ({ ...prev, org_contact_phone: formatPhoneNumber(e.target.value) }))}
                placeholder="(123) 456-7890"
              />
            </div>
          </div>

          <div>
            <label className={lc}>Contact Email</label>
            {isLinked ? (
              <>
                <input type="email" className={icDisabled} value={form.email} disabled />
                <p className="text-xs text-gray-400 mt-1">Email cannot be changed on linked accounts.</p>
              </>
            ) : (
              <input type="email" className={ic} value={form.email} onChange={set('email')} placeholder="contact@organization.com" />
            )}
          </div>

          <div>
            <label className={lc}>Fee Tier</label>
            <select className={ic} value={form.fee_tier} onChange={set('fee_tier')}>
              <option value="">Select fee tier…</option>
              {FEE_TIERS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* ── Visit Defaults Section ── */}
          <div className="pt-2 border-t border-gray-200">
            <p className={sectionLabel}>Visit Defaults (optional)</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">These values will prepopulate when creating a visit for this organization.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lc}>Default Dogs Needed</label>
              <input
                type="number"
                min={1}
                className={ic}
                value={form.default_dogs_needed ?? ''}
                onChange={e => setForm(prev => ({ ...prev, default_dogs_needed: e.target.value ? Number(e.target.value) : null }))}
                placeholder="e.g., 3"
              />
            </div>
            <div>
              <label className={lc}>Default Space (sq ft)</label>
              <input
                type="number"
                min={0}
                className={ic}
                value={form.default_space_sqft ?? ''}
                onChange={e => setForm(prev => ({ ...prev, default_space_sqft: e.target.value ? Number(e.target.value) : null }))}
                placeholder="e.g., 500"
              />
            </div>
          </div>

          <div>
            <label className={lc}>Default Parking</label>
            <select
              className={ic}
              value={form.default_parking_coverage}
              onChange={set('default_parking_coverage')}
            >
              <option value="">— Select —</option>
              {PARKING_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={lc}>Default Parking Details for Volunteers</label>
            <textarea
              className={tc}
              value={form.default_parking_instructions}
              onChange={set('default_parking_instructions')}
              placeholder="e.g., Free parking in Lot B, enter from Main St."
            />
          </div>

          <div>
            <label className={lc}>Default Arrival Instructions</label>
            <textarea
              className={tc}
              value={form.default_arrival_instructions}
              onChange={set('default_arrival_instructions')}
              placeholder="e.g., Check in at the front desk, ask for Room 204."
            />
          </div>

          <div>
            <label className={lc}>Default Event Description</label>
            <textarea
              className={tc}
              value={form.default_event_description}
              onChange={set('default_event_description')}
              placeholder="e.g., Monthly therapy dog visit for seniors in the recreation room."
            />
          </div>

          <div>
            <label className={lc}>Default Accessibility Notes</label>
            <textarea
              className={tc}
              value={form.default_accessibility_notes}
              onChange={set('default_accessibility_notes')}
              placeholder="e.g., Wheelchair access required, allergy-free dogs only."
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="default_requires_vsc"
              checked={form.default_requires_vsc ?? false}
              onChange={e => setForm(prev => ({ ...prev, default_requires_vsc: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="default_requires_vsc" className="text-sm font-semibold text-gray-700">
              Default: Requires VSC
            </label>
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
            <Save size={16} /> {saving ? 'Saving…' : mode === 'create' ? 'Create Organization' : 'Save Changes'}
          </button>
        </div>

      </div>
    </div>
  );
}
