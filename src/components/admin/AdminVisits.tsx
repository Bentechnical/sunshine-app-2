'use client';

import { useState, useEffect, useCallback } from 'react';
import { VISIT_TIME_OPTIONS, endTimeOptions } from '@/utils/timeOptions';

// ─── Types ────────────────────────────────────────────────────────────────────

type VisitStatus = 'pending_review' | 'approved' | 'declined' | 'cancelled' | 'completed';
type ViewMode = 'list' | 'detail' | 'create';
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
    dogs: Array<{ dog_name: string; dog_breed: string }>;
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
  visit_registrations: Registration[];
  visit_notes: VisitNote[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatTime(tsStr: string) {
  return new Date(tsStr).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}

function isWithinDays(dateStr: string, days: number) {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diff = (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

function StatusBadge({ status }: { status: VisitStatus }) {
  const config: Record<VisitStatus, { label: string; classes: string }> = {
    pending_review: { label: 'Pending Review', classes: 'bg-amber-100 text-amber-800' },
    approved:       { label: 'Approved',       classes: 'bg-green-100 text-green-800' },
    declined:       { label: 'Declined',        classes: 'bg-red-100 text-red-800' },
    cancelled:      { label: 'Cancelled',       classes: 'bg-gray-100 text-gray-600' },
    completed:      { label: 'Completed',       classes: 'bg-blue-100 text-blue-800' },
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
        {confirmed}/{total} filled
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

  // Org autocomplete
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
      postal_code: org.postal_code || f.postal_code,
    }));
  };

  const clearOrg = () => {
    setSelectedOrg(null);
    setForm(f => ({ ...f, organization_id: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.visit_date || !form.start_time || !form.end_time || !form.address) {
      setError('Date, start time, end time, and address are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Combine date + time into ISO timestamps
      const startTs = new Date(`${form.visit_date}T${form.start_time}`).toISOString();
      const endTs = new Date(`${form.visit_date}T${form.end_time}`).toISOString();

      const res = await fetch('/api/admin/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          start_time: startTs,
          end_time: endTs,
          volunteer_slots: Number(form.volunteer_slots),
          visitor_count_expected: form.visitor_count_expected ? Number(form.visitor_count_expected) : null,
          fee_tier: form.fee_tier || null,
          parking_coverage: form.parking_coverage || null,
          guest_org_name: form.guest_org_name || null,
          guest_contact_name: form.guest_contact_name || null,
          guest_contact_email: form.guest_contact_email || null,
          guest_contact_phone: form.guest_contact_phone || null,
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

      {/* Organization */}
      <div className={sectionClass}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Organization</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Org account link / autocomplete */}
          <div className="sm:col-span-2">
            <label className={labelClass}>Link to Org Account <span className="text-gray-400 font-normal normal-case">(optional — auto-fills fields below)</span></label>
            {selectedOrg ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                <span className="flex-1 text-blue-900 font-medium">{selectedOrg.org_name}</span>
                <button type="button" onClick={clearOrg} className="text-blue-500 hover:text-blue-700 text-xs font-semibold">Clear</button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Search by organization name…"
                  value={orgSearch}
                  onChange={e => { setOrgSearch(e.target.value); setShowOrgDropdown(true); }}
                  onFocus={() => setShowOrgDropdown(true)}
                  onBlur={() => setTimeout(() => setShowOrgDropdown(false), 150)}
                />
                {showOrgDropdown && filteredOrgs.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredOrgs.map(org => (
                      <button
                        key={org.id}
                        type="button"
                        onMouseDown={() => selectOrg(org)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
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

      {/* Date, Time & Location */}
      <div className={sectionClass}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Date, Time & Location</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.visit_date} onChange={e => set('visit_date', e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Start Time <span className="text-red-500">*</span></label>
            <select
              className={inputClass}
              value={form.start_time}
              onChange={e => {
                set('start_time', e.target.value);
                if (form.end_time && form.end_time <= e.target.value) set('end_time', '');
              }}
              required
            >
              <option value="">Select time</option>
              {VISIT_TIME_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>End Time <span className="text-red-500">*</span></label>
            <select
              className={inputClass}
              value={form.end_time}
              onChange={e => set('end_time', e.target.value)}
              required
              disabled={!form.start_time}
            >
              <option value="">Select time</option>
              {endTimeOptions(form.start_time).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={labelClass}>Address <span className="text-red-500">*</span></label>
            <input type="text" value={form.address} onChange={e => set('address', e.target.value)} required className={inputClass} placeholder="123 Main St, Vancouver, BC" />
          </div>
          <div>
            <label className={labelClass}>Postal Code</label>
            <input type="text" value={form.postal_code} onChange={e => set('postal_code', e.target.value.toUpperCase())} className={inputClass} placeholder="A1A 1A1" maxLength={7} />
          </div>
        </div>
      </div>

      {/* Logistics */}
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

      {/* Instructions */}
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
  onBack,
  onUpdated,
}: {
  visitId: number;
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

  const orgName = visit.guest_org_name || '—';
  const confirmedRegs = visit.visit_registrations.filter(r => r.status === 'confirmed');
  const waitlistedRegs = visit.visit_registrations.filter(r => r.status === 'waitlisted');

  return (
    <div className="space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-blue-600 hover:underline">← Back to list</button>
        <span className="text-gray-300">|</span>
        <StatusBadge status={visit.status} />
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900">
          {visit.title || orgName}
        </h2>
        {visit.title && <p className="text-sm text-gray-500 mt-0.5">{orgName}</p>}
        <p className="text-sm text-gray-600 mt-1">
          {formatDate(visit.visit_date)} · {formatTime(visit.start_time)} – {formatTime(visit.end_time)}
        </p>
        <p className="text-sm text-gray-600">{visit.address}</p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {visit.status === 'pending_review' && (
          <>
            <button onClick={() => { setShowApproveForm(true); setShowDeclineForm(false); setShowCancelForm(false); }}
              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700">
              Approve
            </button>
            <button onClick={() => { setShowDeclineForm(true); setShowApproveForm(false); setShowCancelForm(false); }}
              className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700">
              Decline
            </button>
          </>
        )}
        {visit.status === 'approved' && (
          <>
            <button onClick={() => doAction('complete')} disabled={busy}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              Mark Complete
            </button>
            <button onClick={() => { setShowCancelForm(true); setShowApproveForm(false); setShowDeclineForm(false); }}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50">
              Cancel Visit
            </button>
          </>
        )}
      </div>

      {/* Approve / Decline / Cancel inline forms */}
      {showApproveForm && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-green-900">Approve visit</p>
          <textarea value={actionNote} onChange={e => setActionNote(e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm" placeholder="Optional note to the organization…" />
          <div className="flex gap-2">
            <button onClick={() => doAction('approve', { admin_note: actionNote })} disabled={busy}
              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {busy ? 'Approving…' : 'Confirm Approval'}
            </button>
            <button onClick={() => setShowApproveForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          </div>
        </div>
      )}

      {showDeclineForm && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-red-900">Decline visit</p>
          <textarea value={actionNote} onChange={e => setActionNote(e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm" placeholder="Reason for declining (shared with organization)…" />
          <div className="flex gap-2">
            <button onClick={() => doAction('decline', { admin_note: actionNote })} disabled={busy}
              className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {busy ? 'Declining…' : 'Confirm Decline'}
            </button>
            <button onClick={() => setShowDeclineForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          </div>
        </div>
      )}

      {showCancelForm && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-900">Cancel visit</p>
          <textarea value={actionNote} onChange={e => setActionNote(e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm" placeholder="Reason for cancellation…" />
          <div className="flex gap-2">
            <button onClick={() => doAction('cancel', { admin_note: actionNote })} disabled={busy}
              className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {busy ? 'Cancelling…' : 'Confirm Cancellation'}
            </button>
            <button onClick={() => setShowCancelForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          </div>
        </div>
      )}

      {/* Visit details grid */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Visit Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {visit.guest_contact_email && (
            <div><span className="font-semibold text-gray-700">Contact Email: </span><span className="text-gray-900">{visit.guest_contact_email}</span></div>
          )}
          {visit.guest_contact_phone && (
            <div><span className="font-semibold text-gray-700">Contact Phone: </span><span className="text-gray-900">{visit.guest_contact_phone}</span></div>
          )}
          <div><span className="font-semibold text-gray-700">Volunteer Slots: </span><span className="text-gray-900">{confirmedRegs.length}/{visit.volunteer_slots} filled</span></div>
          {visit.visitor_count_expected && (
            <div><span className="font-semibold text-gray-700">Expected Visitors: </span><span className="text-gray-900">{visit.visitor_count_expected}</span></div>
          )}
          {visit.fee_tier && (
            <div><span className="font-semibold text-gray-700">Fee Tier: </span><span className="text-gray-900 capitalize">{visit.fee_tier}{visit.fee_amount ? ` ($${visit.fee_amount})` : ''}</span></div>
          )}
          {visit.parking_coverage && (
            <div><span className="font-semibold text-gray-700">Parking: </span><span className="text-gray-900">{visit.parking_coverage.replace(/_/g, ' ')}</span></div>
          )}
          <div>
            <span className="font-semibold text-gray-700">Requirements: </span>
            <span className="text-gray-900">
              {[visit.requires_vsc && 'VSC', visit.requires_vaccine_record && 'Vaccine record'].filter(Boolean).join(', ') || 'None'}
            </span>
          </div>
          {visit.audience_age_ranges && visit.audience_age_ranges.length > 0 && (
            <div><span className="font-semibold text-gray-700">Audience: </span><span className="text-gray-900">{visit.audience_age_ranges.join(', ')}</span></div>
          )}
          {visit.approx_space_sqft && (
            <div><span className="font-semibold text-gray-700">Space: </span><span className="text-gray-900">{visit.approx_space_sqft} sqft</span></div>
          )}
        </div>
        {visit.special_needs_notes && (
          <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Special Needs</p><p className="text-sm text-gray-800">{visit.special_needs_notes}</p></div>
        )}
        {visit.arrival_instructions && (
          <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Arrival Instructions</p><p className="text-sm text-gray-800">{visit.arrival_instructions}</p></div>
        )}
        {visit.parking_instructions && (
          <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Parking Instructions</p><p className="text-sm text-gray-800">{visit.parking_instructions}</p></div>
        )}
        {visit.accessibility_notes && (
          <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Accessibility</p><p className="text-sm text-gray-800">{visit.accessibility_notes}</p></div>
        )}
        {visit.admin_note && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-yellow-700 mb-1">Admin Note (shared with org)</p>
            <p className="text-sm text-yellow-900">{visit.admin_note}</p>
          </div>
        )}
      </div>

      {/* Registrations */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
          Registered Volunteers ({confirmedRegs.length}/{visit.volunteer_slots})
          {waitlistedRegs.length > 0 && <span className="ml-2 text-amber-600 font-normal">· {waitlistedRegs.length} waitlisted</span>}
        </h3>

        {confirmedRegs.length === 0 && waitlistedRegs.length === 0 ? (
          <p className="text-sm text-gray-500">No volunteers registered yet.</p>
        ) : (
          <div className="space-y-3">
            {[...confirmedRegs, ...waitlistedRegs].map(reg => (
              <div key={reg.id} className={`flex items-start justify-between gap-4 p-3 rounded-lg border ${reg.status === 'waitlisted' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {reg.users?.first_name ?? '—'} {reg.users?.last_name ?? ''}
                    </span>
                    {reg.status === 'waitlisted' && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                        Waitlist #{reg.waitlist_position}
                      </span>
                    )}
                  </div>
                  {reg.users?.dogs?.[0] && (
                    <p className="text-xs text-gray-500 mt-0.5">{reg.users.dogs[0].dog_name} ({reg.users.dogs[0].dog_breed})</p>
                  )}
                  {reg.users?.email && (
                    <p className="text-xs text-gray-500">{reg.users.email}</p>
                  )}
                </div>
                {visit.status === 'approved' && (
                  <button onClick={() => handleRemoveRegistration(reg.id)} disabled={busy}
                    className="text-xs text-red-600 hover:text-red-800 font-medium shrink-0 disabled:opacity-50">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Internal Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Internal Notes</h3>

        {visit.visit_notes.length === 0 ? (
          <p className="text-sm text-gray-500">No notes yet.</p>
        ) : (
          <div className="space-y-3">
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

export default function AdminVisits() {
  const [view, setView] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending_review');
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);

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
    if (view === 'list') fetchVisits();
  }, [view, fetchVisits]);

  const openDetail = (id: number) => {
    setSelectedVisitId(id);
    setView('detail');
  };

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

  // ── Render: Detail view ──
  if (view === 'detail' && selectedVisitId !== null) {
    return (
      <div className="px-4 py-4">
        <VisitDetailView
          visitId={selectedVisitId}
          onBack={() => setView('list')}
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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 gap-2">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-600">Loading visits…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Empty */}
      {!loading && !error && visits.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p className="font-medium">No visits found</p>
          <p className="text-sm mt-1">
            {statusFilter === 'pending_review' ? 'No pending visit requests.' : 'No visits matching this filter.'}
          </p>
        </div>
      )}

      {/* Visit cards */}
      {!loading && !error && visits.length > 0 && (
        <div className="space-y-3">
          {visits.map(visit => {
            const isUrgent = visit.status === 'approved' && visit.slots_remaining > 0 && isWithinDays(visit.visit_date, 14);
            const orgLabel = visit.guest_org_name || visit.guest_contact_name || 'Unknown organization';

            return (
              <div key={visit.id}
                className={`bg-white rounded-xl border-2 p-4 shadow-sm ${isUrgent ? 'border-orange-300' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <StatusBadge status={visit.status} />
                      {isUrgent && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                          Slots needed — within 2 weeks
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 truncate">
                      {visit.title || orgLabel}
                    </h3>
                    {visit.title && <p className="text-xs text-gray-500">{orgLabel}</p>}
                    <p className="text-sm text-gray-600 mt-1">
                      {formatDate(visit.visit_date)} · {formatTime(visit.start_time)} – {formatTime(visit.end_time)}
                    </p>
                    <p className="text-sm text-gray-500 truncate">{visit.address}</p>
                    <div className="mt-2 max-w-xs">
                      <SlotBar confirmed={visit.confirmed_count} total={visit.volunteer_slots} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    <button onClick={() => openDetail(visit.id)}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50">
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
