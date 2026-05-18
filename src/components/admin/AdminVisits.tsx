'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Clock, MapPin, ChevronRight, Building2, PawPrint,
  ExternalLink, ArrowLeft, Phone, Mail, User,
} from 'lucide-react';
import { VISIT_TIME_OPTIONS, endTimeOptions } from '@/utils/timeOptions';
import { formatCardTime } from '@/utils/timeZone';
import PlacesAutocomplete, { PlaceResult } from '@/components/ui/PlacesAutocomplete';
import VisitMap from '@/components/ui/VisitMap';

// ─── Types ────────────────────────────────────────────────────────────────────

type VisitStatus = 'pending_review' | 'approved' | 'declined' | 'cancelled' | 'completed';
type ViewMode = 'list' | 'create';
type StatusFilter = 'pending_review' | 'approved' | 'all';

interface VisitSummary {
  id: number;
  title: string | null;
  guest_org_name: string | null;
  guest_contact_name: string | null;
  guest_contact_email: string | null;
  visit_date: string;
  start_time: string;
  end_time: string;
  address: string;
  volunteer_slots: number;
  confirmed_count: number;
  waitlist_count: number;
  slots_remaining: number;
  requires_vsc: boolean;
  requires_vaccine_record: boolean;
  status: VisitStatus;
  admin_note: string | null;
  created_at: string;
  org_profile_image: string | null;
  org_name: string | null;
}

interface Registration {
  id: number;
  volunteer_id: string;
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  waitlist_position: number | null;
  contact_shared: boolean;
  admin_note: string | null;
  users: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string | null;
    dogs: Array<{ dog_name: string; dog_breed: string; dog_picture_url: string | null }>;
  } | null;
}

interface VisitNote {
  id: number;
  note_text: string;
  created_at: string;
  users: { first_name: string; last_name: string } | null;
}

interface VisitDetail {
  id: number;
  title: string | null;
  organization_id: string | null;
  guest_org_name: string | null;
  guest_contact_name: string | null;
  guest_contact_email: string | null;
  guest_contact_phone: string | null;
  visit_date: string;
  start_time: string;
  end_time: string;
  address: string;
  location_lat: number | null;
  location_lng: number | null;
  location_place_id: string | null;
  audience_age_ranges: string[] | null;
  visitor_count_expected: number | null;
  special_needs_notes: string | null;
  approx_space_sqft: number | null;
  fee_tier: string | null;
  fee_amount: number | null;
  volunteer_slots: number;
  parking_coverage: string | null;
  parking_instructions: string | null;
  arrival_instructions: string | null;
  accessibility_notes: string | null;
  requires_vsc: boolean;
  requires_vaccine_record: boolean;
  status: VisitStatus;
  admin_note: string | null;
  org: { org_name: string | null; profile_image: string | null } | null;
  visit_registrations: Registration[];
  visit_notes: VisitNote[];
}

interface Props {
  selectedVisitId?: number | null;
  onSelectVisit?: (id: number) => void;
  onBackFromVisit?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateShort(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function isWithinDays(dateStr: string, days: number) {
  const d = daysUntil(dateStr);
  return d >= 0 && d <= days;
}

function CountdownBadge({ dateStr }: { dateStr: string }) {
  const days = daysUntil(dateStr);
  if (days < 0) return null;
  const label = days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `In ${days} days`;
  const cls =
    days === 0 ? 'bg-green-100 text-green-700' :
    days <= 2  ? 'bg-amber-100 text-amber-700' :
                 'bg-blue-50 text-blue-600';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      <Calendar size={10} />
      {label}
    </span>
  );
}

function OrgLogo({ url, size = 40 }: { url: string | null | undefined; size?: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt="Organization logo"
        className="object-cover rounded-lg border border-gray-100 shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <Building2 size={size * 0.45} className="text-blue-300" />
    </div>
  );
}

function StatusBadge({ status }: { status: VisitStatus }) {
  const config: Record<VisitStatus, { label: string; classes: string }> = {
    pending_review: { label: 'Pending Review', classes: 'bg-amber-100 text-amber-800' },
    approved:       { label: 'Approved',        classes: 'bg-green-100 text-green-800' },
    declined:       { label: 'Declined',         classes: 'bg-red-100 text-red-800' },
    cancelled:      { label: 'Cancelled',        classes: 'bg-gray-100 text-gray-600' },
    completed:      { label: 'Completed',        classes: 'bg-blue-100 text-blue-800' },
  };
  const { label, classes } = config[status] ?? config.pending_review;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}

function SlotBar({ confirmed, total }: { confirmed: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (confirmed / total) * 100) : 0;
  const isFull = confirmed >= total;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isFull ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-600 whitespace-nowrap">
        {confirmed}/{total} volunteers
      </span>
    </div>
  );
}

// ─── Create Visit Form ────────────────────────────────────────────────────────

function CreateVisitForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    organization_id: '',
    guest_org_name: '',
    guest_contact_name: '',
    guest_contact_email: '',
    guest_contact_phone: '',
    visit_date: '',
    start_time: '',
    end_time: '',
    address: '',
    location_place_id: '',
    location_lat: null as number | null,
    location_lng: null as number | null,
    postal_code: '',
    volunteer_slots: 1,
    requires_vsc: false,
    requires_vaccine_record: true,
    visitor_count_expected: '',
    fee_tier: '',
    parking_coverage: '',
    special_needs_notes: '',
    arrival_instructions: '',
    parking_instructions: '',
    status: 'approved',
  });

  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  type OrgOption = { id: string; email: string; org_name: string; org_contact_name: string; org_contact_phone: string; org_address: string; postal_code: string };
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [orgSearch, setOrgSearch] = useState('');
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<{ id: string; org_name: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/approved-users')
      .then(r => r.json())
      .then(json => setOrgOptions((json.users ?? []).filter((u: any) => u.role === 'organization')))
      .catch(() => {});
  }, []);

  const filteredOrgs = orgSearch
    ? orgOptions.filter(o => (o.org_name ?? '').toLowerCase().includes(orgSearch.toLowerCase()))
    : orgOptions;

  const selectOrg = (org: OrgOption) => {
    setSelectedOrg({ id: org.id, org_name: org.org_name });
    setOrgSearch('');
    setShowOrgDropdown(false);
    setForm(f => ({
      ...f,
      organization_id: org.id,
      guest_org_name: org.org_name || f.guest_org_name,
      guest_contact_name: org.org_contact_name || f.guest_contact_name,
      guest_contact_email: org.email || f.guest_contact_email,
      guest_contact_phone: org.org_contact_phone || f.guest_contact_phone,
      address: org.org_address || f.address,
    }));
  };

  const handlePlaceSelect = (result: PlaceResult) => {
    setForm(f => ({
      ...f,
      address: result.formatted_address,
      location_place_id: result.place_id,
      location_lat: result.lat,
      location_lng: result.lng,
      postal_code: result.postal_code || f.postal_code,
    }));
  };

  const clearOrg = () => {
    setSelectedOrg(null);
    setForm(f => ({ ...f, organization_id: '' }));
  };

  const handleSubmit = async (e: React.BaseSyntheticEvent) => {
    e.preventDefault();
    if (!form.visit_date || !form.start_time || !form.end_time || !form.address) {
      setError('Date, start time, end time, and address are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          volunteer_slots: Number(form.volunteer_slots),
          visitor_count_expected: form.visitor_count_expected ? Number(form.visitor_count_expected) : null,
          fee_tier: form.fee_tier || null,
          parking_coverage: form.parking_coverage || null,
          guest_org_name: form.guest_org_name || null,
          guest_contact_name: form.guest_contact_name || null,
          guest_contact_email: form.guest_contact_email || null,
          guest_contact_phone: form.guest_contact_phone || null,
          location_place_id: form.location_place_id || null,
          location_lat: form.location_lat,
          location_lng: form.location_lng,
          postal_code: form.postal_code || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to create visit'); return; }
      onCreated();
    } catch {
      setError('Failed to create visit');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const labelClass = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
  const sectionClass = 'bg-white rounded-xl border border-gray-200 p-4 space-y-3';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Create Visit</h2>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

      <div className={sectionClass}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Organization</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelClass}>Link to Org Account <span className="text-gray-400 font-normal normal-case">(optional — auto-fills fields below)</span></label>
            {selectedOrg ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                <span className="flex-1 text-blue-900 font-medium">{selectedOrg.org_name}</span>
                <button type="button" onClick={clearOrg} className="text-blue-500 hover:text-blue-700 text-xs font-semibold">Clear</button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" className={inputClass} placeholder="Search by organization name…"
                  value={orgSearch}
                  onChange={e => { setOrgSearch(e.target.value); setShowOrgDropdown(true); }}
                  onFocus={() => setShowOrgDropdown(true)}
                  onBlur={() => setTimeout(() => setShowOrgDropdown(false), 150)}
                />
                {showOrgDropdown && filteredOrgs.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredOrgs.map(org => (
                      <button key={org.id} type="button" onMouseDown={() => selectOrg(org)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0">
                        <span className="font-medium text-gray-900">{org.org_name}</span>
                        {org.org_contact_name && <span className="text-gray-500 ml-2">· {org.org_contact_name}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Visit Title <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)} className={inputClass} placeholder="e.g. Spring Visit — Maple Ridge Elementary" />
          </div>
          <div>
            <label className={labelClass}>Organization Name</label>
            <input type="text" value={form.guest_org_name} onChange={e => set('guest_org_name', e.target.value)} className={inputClass} placeholder="e.g. Maple Ridge Elementary" />
          </div>
          <div>
            <label className={labelClass}>Contact Name</label>
            <input type="text" value={form.guest_contact_name} onChange={e => set('guest_contact_name', e.target.value)} className={inputClass} placeholder="e.g. Jane Smith" />
          </div>
          <div>
            <label className={labelClass}>Contact Email</label>
            <input type="email" value={form.guest_contact_email} onChange={e => set('guest_contact_email', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Contact Phone</label>
            <input type="tel" value={form.guest_contact_phone} onChange={e => set('guest_contact_phone', e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Date, Time & Location</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.visit_date} onChange={e => set('visit_date', e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Start Time <span className="text-red-500">*</span></label>
            <select className={inputClass} value={form.start_time}
              onChange={e => { set('start_time', e.target.value); if (form.end_time && form.end_time <= e.target.value) set('end_time', ''); }}
              required>
              <option value="">Select time</option>
              {VISIT_TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>End Time <span className="text-red-500">*</span></label>
            <select className={inputClass} value={form.end_time} onChange={e => set('end_time', e.target.value)} required disabled={!form.start_time}>
              <option value="">Select time</option>
              {endTimeOptions(form.start_time).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Address <span className="text-red-500">*</span></label>
          <PlacesAutocomplete value={form.address} onSelect={handlePlaceSelect} onChange={v => set('address', v)} className={inputClass} placeholder="Start typing the visit location…" />
          <p className="text-xs text-gray-400 mt-1">Select from the dropdown to confirm.</p>
        </div>
      </div>

      <div className={sectionClass}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Logistics</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelClass}>Volunteer Slots</label>
            <input type="number" min={1} max={20} value={form.volunteer_slots} onChange={e => set('volunteer_slots', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Expected Visitors</label>
            <input type="number" min={1} value={form.visitor_count_expected} onChange={e => set('visitor_count_expected', e.target.value)} className={inputClass} placeholder="e.g. 30" />
          </div>
          <div>
            <label className={labelClass}>Fee Tier</label>
            <select value={form.fee_tier} onChange={e => set('fee_tier', e.target.value)} className={inputClass}>
              <option value="">— Select —</option>
              <option value="free">Free</option>
              <option value="standard">Standard ($200)</option>
              <option value="reduced">Reduced ($50)</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Parking</label>
            <select value={form.parking_coverage} onChange={e => set('parking_coverage', e.target.value)} className={inputClass}>
              <option value="">— Select —</option>
              <option value="free_on_site">Free on site</option>
              <option value="reimbursed_on_site">Reimbursed</option>
              <option value="invoice">On invoice</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-5 pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.requires_vsc} onChange={e => set('requires_vsc', e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm text-gray-700">Requires VSC</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.requires_vaccine_record} onChange={e => set('requires_vaccine_record', e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm text-gray-700">Requires Vaccine Record</span>
          </label>
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-sm text-gray-700 whitespace-nowrap">Initial status:</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="approved">Approved</option>
              <option value="pending_review">Pending Review</option>
            </select>
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Instructions & Notes <span className="text-gray-300 font-normal normal-case">(optional)</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Special Needs</label>
            <textarea value={form.special_needs_notes} onChange={e => set('special_needs_notes', e.target.value)} rows={3} className={inputClass} placeholder="Mobility aides, allergies…" />
          </div>
          <div>
            <label className={labelClass}>Arrival Instructions</label>
            <textarea value={form.arrival_instructions} onChange={e => set('arrival_instructions', e.target.value)} rows={3} className={inputClass} placeholder="Check-in location, access…" />
          </div>
          <div>
            <label className={labelClass}>Parking Instructions</label>
            <textarea value={form.parking_instructions} onChange={e => set('parking_instructions', e.target.value)} rows={3} className={inputClass} placeholder="Where to park…" />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="px-6 py-2 bg-[#0e62ae] text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Creating…' : 'Create Visit'}
        </button>
        <button type="button" onClick={onCancel} className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Visit Detail View ────────────────────────────────────────────────────────

function VisitDetailView({
  visitId,
  orgImage,
  onBack,
  onUpdated,
}: {
  visitId: number;
  orgImage: string | null;
  onBack: () => void;
  onUpdated: () => void;
}) {
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionNote, setActionNote] = useState('');
  const [newNote, setNewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  // Shared note (admin_note — visible to the org)
  const [editingSharedNote, setEditingSharedNote] = useState(false);
  const [sharedNoteText, setSharedNoteText] = useState('');
  const [savingSharedNote, setSavingSharedNote] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/visits/${visitId}`);
      const json = await res.json();
      if (res.ok) setVisit(json.visit);
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (path: string, body?: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/visits/${visitId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Action failed'); return; }
      await load();
      onUpdated();
      setActionNote('');
      setShowDeclineForm(false);
      setShowApproveForm(false);
      setShowCancelForm(false);
    } finally {
      setBusy(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/visits/${visitId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_text: newNote }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to add note'); return; }
      setNewNote('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSharedNote = async () => {
    setSavingSharedNote(true);
    try {
      const res = await fetch(`/api/admin/visits/${visitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_note: sharedNoteText.trim() || null }),
      });
      if (res.ok) { await load(); setEditingSharedNote(false); }
    } finally {
      setSavingSharedNote(false);
    }
  };

  const handleRemoveRegistration = async (regId: number) => {
    if (!confirm('Remove this volunteer from the visit?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/visits/${visitId}/registrations/${regId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to remove volunteer'); return; }
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!visit) {
    return <p className="text-red-600 p-4">Failed to load visit details.</p>;
  }

  const orgName = visit.guest_org_name || visit.org?.org_name || '—';
  const confirmedRegs = visit.visit_registrations.filter(r => r.status === 'confirmed');
  const waitlistedRegs = visit.visit_registrations.filter(r => r.status === 'waitlisted');

  return (
    <div className="max-w-2xl mx-auto">

      {/* Top bar */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium transition">
          <ArrowLeft size={16} /> All Visits
        </button>
        <CountdownBadge dateStr={visit.visit_date} />
      </div>

      {/* Header card — logo + status + action buttons in top row */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <OrgLogo url={orgImage ?? visit.org?.profile_image ?? null} size={56} />

          {/* Status + action buttons — top right */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StatusBadge status={visit.status} />
            <div className="flex items-center gap-1.5">
              {visit.status === 'pending_review' && (
                <>
                  <button
                    onClick={() => { setShowApproveForm(v => !v); setShowDeclineForm(false); setShowCancelForm(false); }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${showApproveForm ? 'bg-green-700 text-white' : 'bg-green-600 text-white hover:bg-green-700'}`}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => { setShowDeclineForm(v => !v); setShowApproveForm(false); setShowCancelForm(false); }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${showDeclineForm ? 'bg-red-700 text-white' : 'bg-red-600 text-white hover:bg-red-700'}`}
                  >
                    Decline
                  </button>
                </>
              )}
              {visit.status === 'approved' && (
                <>
                  <button onClick={() => doAction('complete')} disabled={busy}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition">
                    {busy ? '…' : 'Complete'}
                  </button>
                  <button
                    onClick={() => { setShowCancelForm(v => !v); setShowApproveForm(false); setShowDeclineForm(false); }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${showCancelForm ? 'border-gray-400 bg-gray-100 text-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <p className="text-xl font-bold text-gray-900 mb-0.5">{orgName}</p>
        {visit.title && (
          <p className="text-sm text-gray-500 mb-0.5">{visit.title}</p>
        )}

        <div className="space-y-1.5 text-sm text-gray-700 mt-3">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400 shrink-0" />
            <span>{formatDate(visit.visit_date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-gray-400 shrink-0" />
            <span>{formatCardTime(visit.start_time)} – {formatCardTime(visit.end_time)}</span>
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address)}${visit.location_place_id ? `&query_place_id=${visit.location_place_id}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-[#0e62ae] group/addr transition-colors"
          >
            <MapPin size={14} className="text-gray-400 shrink-0 group-hover/addr:text-[#0e62ae]" />
            <span className="underline underline-offset-2 decoration-gray-300 group-hover/addr:decoration-[#0e62ae]">{visit.address}</span>
            <ExternalLink size={11} className="text-gray-300 group-hover/addr:text-[#0e62ae] shrink-0" />
          </a>

          {(visit.guest_contact_name || visit.guest_contact_email || visit.guest_contact_phone) && (
            <div className="border-t border-gray-100 pt-2 mt-2 space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Primary Contact</p>
              {visit.guest_contact_name && (
                <div className="flex items-center gap-2"><User size={13} className="text-gray-400 shrink-0" />{visit.guest_contact_name}</div>
              )}
              {visit.guest_contact_email && (
                <div className="flex items-center gap-2"><Mail size={13} className="text-gray-400 shrink-0" />{visit.guest_contact_email}</div>
              )}
              {visit.guest_contact_phone && (
                <div className="flex items-center gap-2"><Phone size={13} className="text-gray-400 shrink-0" />{visit.guest_contact_phone}</div>
              )}
            </div>
          )}
        </div>

        {/* Inline action forms — inside header card */}
        {showApproveForm && (
          <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm font-semibold text-green-800">Approve visit</p>
            <textarea value={actionNote} onChange={e => setActionNote(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder="Optional note to the organization (shared with them)…" />
            <div className="flex gap-2">
              <button onClick={() => doAction('approve', { admin_note: actionNote })} disabled={busy}
                className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-green-700">
                {busy ? 'Approving…' : 'Confirm Approval'}
              </button>
              <button onClick={() => { setShowApproveForm(false); setActionNote(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Dismiss</button>
            </div>
          </div>
        )}
        {showDeclineForm && (
          <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm font-semibold text-red-800">Decline visit</p>
            <textarea value={actionNote} onChange={e => setActionNote(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder="Reason for declining (shared with organization)…" />
            <div className="flex gap-2">
              <button onClick={() => doAction('decline', { admin_note: actionNote })} disabled={busy}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-red-700">
                {busy ? 'Declining…' : 'Confirm Decline'}
              </button>
              <button onClick={() => { setShowDeclineForm(false); setActionNote(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Dismiss</button>
            </div>
          </div>
        )}
        {showCancelForm && (
          <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm font-semibold text-amber-800">Cancel visit</p>
            <textarea value={actionNote} onChange={e => setActionNote(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Reason for cancellation (shared with organization)…" />
            <div className="flex gap-2">
              <button onClick={() => doAction('cancel', { admin_note: actionNote })} disabled={busy}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-amber-700">
                {busy ? 'Cancelling…' : 'Confirm Cancellation'}
              </button>
              <button onClick={() => { setShowCancelForm(false); setActionNote(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Dismiss</button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

      {/* Volunteers card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <PawPrint size={14} className="text-gray-400" /> Volunteers
          <span className="text-gray-400 font-normal">({confirmedRegs.length}/{visit.volunteer_slots})</span>
          {waitlistedRegs.length > 0 && <span className="text-amber-600 font-normal">· {waitlistedRegs.length} waitlisted</span>}
        </h3>

        <SlotBar confirmed={confirmedRegs.length} total={visit.volunteer_slots} />

        <div className="mt-2 mb-4 flex flex-wrap gap-4 text-sm text-gray-600">
          <span><span className="font-semibold text-gray-900">{confirmedRegs.length}</span> confirmed</span>
          {waitlistedRegs.length > 0 && <span><span className="font-semibold text-amber-700">{waitlistedRegs.length}</span> waitlisted</span>}
          <span><span className="font-semibold text-gray-900">{Math.max(0, visit.volunteer_slots - confirmedRegs.length)}</span> spots open</span>
          {visit.visitor_count_expected && (
            <span className="text-gray-400">· {visit.visitor_count_expected} expected visitors</span>
          )}
        </div>

        {/* Confirmed dog cards */}
        <div className="space-y-2">
          {Array.from({ length: visit.volunteer_slots }).map((_, i) => {
            const reg = confirmedRegs[i];
            const dog = reg?.users?.dogs?.[0] ?? null;
            if (reg) {
              return (
                <div key={reg.id} className="flex items-stretch rounded-xl overflow-hidden border border-gray-100 bg-gray-50 h-32">
                  <div className="w-32 shrink-0 bg-gray-200">
                    {dog?.dog_picture_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={dog.dog_picture_url} alt={dog.dog_name ?? ''} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-blue-50">
                        <PawPrint size={22} className="text-blue-200" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 px-4 flex flex-col justify-center gap-0.5 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 leading-tight">{dog?.dog_name ?? 'Unknown Dog'}</p>
                        {dog?.dog_breed && <p className="text-xs text-gray-500">{dog.dog_breed}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">Handler: {reg.users?.first_name ?? '—'} {reg.users?.last_name ?? ''}</p>
                        {reg.users?.email && <p className="text-xs text-gray-400 truncate">{reg.users.email}</p>}
                      </div>
                      {visit.status === 'approved' && (
                        <button onClick={() => handleRemoveRegistration(reg.id)} disabled={busy}
                          className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0 disabled:opacity-50">
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={`empty-${i}`} className="flex items-stretch rounded-xl overflow-hidden border-2 border-dashed border-gray-200 h-32">
                <div className="w-32 shrink-0 bg-gray-50 flex items-center justify-center">
                  <PawPrint size={22} className="text-gray-200" />
                </div>
                <div className="flex-1 px-4 flex items-center">
                  <p className="text-sm text-gray-300 font-medium">Open Slot</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Waitlisted */}
        {waitlistedRegs.length > 0 && (
          <div className="border-t border-gray-100 mt-3 pt-3">
            <p className="text-xs font-semibold text-amber-600 mb-2">Waitlisted</p>
            <div className="space-y-2">
              {waitlistedRegs.map(reg => {
                const dog = reg.users?.dogs?.[0] ?? null;
                return (
                  <div key={reg.id} className="flex items-stretch rounded-xl overflow-hidden border border-amber-100 bg-amber-50 h-16">
                    <div className="w-16 shrink-0 bg-amber-100">
                      {dog?.dog_picture_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={dog.dog_picture_url} alt={dog.dog_name ?? ''} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <PawPrint size={18} className="text-amber-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 px-4 flex flex-col justify-center gap-0.5 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-800">{dog?.dog_name ?? 'Unknown Dog'}</p>
                            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">#{reg.waitlist_position}</span>
                          </div>
                          {dog?.dog_breed && <p className="text-xs text-gray-500">{dog.dog_breed}</p>}
                          <p className="text-xs text-amber-600">Handler: {reg.users?.first_name ?? '—'} {reg.users?.last_name ?? ''}</p>
                        </div>
                        {visit.status === 'approved' && (
                          <button onClick={() => handleRemoveRegistration(reg.id)} disabled={busy}
                            className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0 disabled:opacity-50">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Requirements card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Requirements</h3>
        <div className="flex flex-wrap gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${visit.requires_vsc ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>
            VSC {visit.requires_vsc ? 'Required' : 'Not Required'}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${visit.requires_vaccine_record ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>
            Vaccine Records {visit.requires_vaccine_record ? 'Required' : 'Not Required'}
          </span>
        </div>
        {(visit.fee_tier || visit.audience_age_ranges?.length) && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-sm text-gray-700">
            {visit.fee_tier && (
              <p><span className="font-medium text-gray-500">Fee:</span> {visit.fee_tier}{visit.fee_amount ? ` ($${visit.fee_amount})` : ''}</p>
            )}
            {visit.audience_age_ranges && visit.audience_age_ranges.length > 0 && (
              <p><span className="font-medium text-gray-500">Audience:</span> {visit.audience_age_ranges.join(', ')}</p>
            )}
          </div>
        )}
      </div>

      {/* Instructions card */}
      {(visit.parking_instructions || visit.arrival_instructions || visit.accessibility_notes || visit.special_needs_notes || visit.parking_coverage || visit.approx_space_sqft) && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Instructions &amp; Notes</h3>
          <div className="space-y-2 text-sm text-gray-700">
            {visit.parking_coverage && (
              <p><span className="font-medium text-gray-500">Parking:</span> {visit.parking_coverage.replace(/_/g, ' ')}</p>
            )}
            {visit.approx_space_sqft && (
              <p><span className="font-medium text-gray-500">Space:</span> {visit.approx_space_sqft.toLocaleString()} sq ft</p>
            )}
            {visit.parking_instructions && (
              <p><span className="font-medium text-gray-500">Parking instructions:</span> {visit.parking_instructions}</p>
            )}
            {visit.arrival_instructions && (
              <p><span className="font-medium text-gray-500">Arrival:</span> {visit.arrival_instructions}</p>
            )}
            {visit.accessibility_notes && (
              <p><span className="font-medium text-gray-500">Accessibility:</span> {visit.accessibility_notes}</p>
            )}
            {visit.special_needs_notes && (
              <p><span className="font-medium text-gray-500">Special needs:</span> {visit.special_needs_notes}</p>
            )}
          </div>
        </div>
      )}

      {/* Map */}
      {visit.location_lat != null && visit.location_lng != null && (
        <div className="mb-4">
          <VisitMap
            lat={visit.location_lat}
            lng={visit.location_lng}
            address={visit.address}
            placeId={visit.location_place_id}
          />
        </div>
      )}

      {/* Notes shared with organization (admin_note) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Notes for Organization</h3>
          <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">Visible to org</span>
        </div>
        {editingSharedNote ? (
          <div className="space-y-2">
            <textarea
              value={sharedNoteText}
              onChange={e => setSharedNoteText(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="This note will be visible to the organization on their dashboard…"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={handleSaveSharedNote} disabled={savingSharedNote}
                className="px-4 py-2 bg-[#0e62ae] text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {savingSharedNote ? 'Saving…' : 'Save Note'}
              </button>
              <button onClick={() => { setEditingSharedNote(false); setSharedNoteText(visit.admin_note ?? ''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            {visit.admin_note ? (
              <p className="text-sm text-gray-800 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2.5 mb-2">{visit.admin_note}</p>
            ) : (
              <p className="text-sm text-gray-400 italic mb-2">No note added yet.</p>
            )}
            <button
              onClick={() => { setSharedNoteText(visit.admin_note ?? ''); setEditingSharedNote(true); }}
              className="text-xs text-[#0e62ae] font-semibold hover:underline"
            >
              {visit.admin_note ? 'Edit note' : '+ Add note'}
            </button>
          </div>
        )}
      </div>

      {/* Internal Notes */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Internal Notes</h3>
        {visit.visit_notes.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No notes yet.</p>
        ) : (
          <div className="space-y-3 mb-3">
            {visit.visit_notes.map(note => (
              <div key={note.id} className="text-sm bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-gray-800">{note.note_text}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {note.users ? `${note.users.first_name} ${note.users.last_name}` : 'Admin'} · {new Date(note.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={2}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Add an internal note…" />
          <button onClick={handleAddNote} disabled={busy || !newNote.trim()}
            className="px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-900 disabled:opacity-40 self-end">
            Add
          </button>
        </div>
      </div>

    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminVisits({ selectedVisitId, onSelectVisit, onBackFromVisit }: Props) {
  const [view, setView] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending_review');
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVisits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/admin/visits${params}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to load visits'); return; }
      setVisits(json.visits ?? []);
    } catch {
      setError('Failed to load visits');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (view !== 'create') fetchVisits();
  }, [view, fetchVisits]);

  // org image from list cache for the selected visit
  const selectedVisitSummary = visits.find(v => v.id === selectedVisitId) ?? null;

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'pending_review', label: 'Visit Requests' },
    { key: 'approved', label: 'Active Visits' },
    { key: 'all', label: 'All Visits' },
  ];

  // ── Render: Create form ──
  if (view === 'create') {
    return (
      <div className="px-4 py-4">
        <CreateVisitForm
          onCreated={() => { setView('list'); fetchVisits(); }}
          onCancel={() => setView('list')}
        />
      </div>
    );
  }

  // ── Render: Detail view (URL-driven) ──
  if (selectedVisitId != null) {
    return (
      <div className="px-4 py-4">
        <VisitDetailView
          visitId={selectedVisitId}
          orgImage={selectedVisitSummary?.org_profile_image ?? null}
          onBack={() => onBackFromVisit?.()}
          onUpdated={fetchVisits}
        />
      </div>
    );
  }

  // ── Render: List view ──
  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Organization Visits</h1>
        <button onClick={() => setView('create')}
          className="px-4 py-2 bg-[#0e62ae] text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
          + Create Visit
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {filterTabs.map(({ key, label }) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              statusFilter === key ? 'bg-[#0e62ae] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-2">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-600">Loading visits…</span>
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && visits.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <Calendar className="mx-auto mb-4 text-gray-300" size={48} />
          <p className="font-medium">No visits found</p>
          <p className="text-sm mt-1">
            {statusFilter === 'pending_review' ? 'No pending visit requests.' : 'No visits matching this filter.'}
          </p>
        </div>
      )}

      {/* Visit cards — 2-column grid, OrgMyVisits card style */}
      {!loading && !error && visits.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {visits.map(visit => {
            const orgLabel = visit.guest_org_name || visit.org_name || 'Unknown organization';
            const isUrgent = visit.status === 'approved' && visit.slots_remaining > 0 && isWithinDays(visit.visit_date, 14);

            return (
              <div
                key={visit.id}
                onClick={() => onSelectVisit?.(visit.id)}
                className="bg-white rounded-xl border-2 border-gray-100 p-4 shadow-sm cursor-pointer hover:border-blue-200 hover:shadow-md transition-all group"
              >
                {/* Status row */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <OrgLogo url={visit.org_profile_image} size={36} />
                    <StatusBadge status={visit.status} />
                    {isUrgent && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                        Urgent
                      </span>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 shrink-0 transition-colors" />
                </div>

                {/* Org name (primary) + event title (secondary) */}
                <p className="text-base font-bold text-gray-900 truncate mb-0.5">{orgLabel}</p>
                {visit.title && (
                  <p className="text-sm text-gray-500 truncate mb-0.5">{visit.title}</p>
                )}

                {/* Date / time / address */}
                <p className="text-sm text-gray-600 mb-0.5">
                  {formatDateShort(visit.visit_date)} · {formatCardTime(visit.start_time)} – {formatCardTime(visit.end_time)}
                </p>
                <p className="text-sm text-gray-500 truncate mb-3">{visit.address}</p>

                <SlotBar confirmed={visit.confirmed_count} total={visit.volunteer_slots} />

                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <CountdownBadge dateStr={visit.visit_date} />
                  {visit.waitlist_count > 0 && (
                    <span className="text-xs text-amber-600">{visit.waitlist_count} on waitlist</span>
                  )}
                </div>

                {visit.admin_note && (
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-yellow-700">Note from Sunshine</p>
                    <p className="text-xs text-yellow-900 line-clamp-2">{visit.admin_note}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
