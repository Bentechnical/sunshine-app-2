// src/components/visits/OrgMyVisits.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  Calendar, Clock, MapPin, AlertCircle,
  ArrowLeft, ChevronRight, Edit2, Save, X,
  Phone, Mail, User, PawPrint, Building2, ExternalLink,
} from 'lucide-react';
import { formatCardTime } from '@/utils/timeZone';
import VisitMap from '@/components/ui/VisitMap';
import PlacesAutocomplete, { PlaceResult } from '@/components/ui/PlacesAutocomplete';

// ── Types ────────────────────────────────────────────────────────────────────

type VisitStatus = 'pending_review' | 'approved' | 'declined' | 'cancelled' | 'completed';
type VisitTab = 'upcoming' | 'pending' | 'past';

interface OrgVisit {
  id: number;
  title: string | null;
  visit_date: string;
  start_time: string;
  end_time: string;
  address: string;
  postal_code: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_place_id: string | null;
  status: VisitStatus;
  admin_note: string | null;
  created_at: string;
  max_volunteers: number;
  expected_visitors: number | null;
  requires_vsc: boolean;
  requires_vaccine: boolean;
  guest_contact_name: string | null;
  guest_contact_email: string | null;
  guest_contact_phone: string | null;
  audience_age_ranges: string[] | null;
  special_needs_notes: string | null;
  approx_space_sqft: number | null;
  parking_coverage: string | null;
  parking_instructions: string | null;
  arrival_instructions: string | null;
  accessibility_notes: string | null;
  registration_counts: { confirmed: number; waitlisted: number };
}

interface VolunteerReg {
  id: number;
  status: 'confirmed' | 'waitlisted';
  volunteer_first_name: string | null;
  dog_name: string | null;
  dog_breed: string | null;
  dog_picture_url: string | null;
}

interface EditForm {
  title: string;
  visit_date: string;
  start_time: string;
  end_time: string;
  address: string;
  location_place_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
  guest_contact_name: string;
  guest_contact_email: string;
  guest_contact_phone: string;
  visitor_count_expected: string;
  volunteer_slots: string;
  special_needs_notes: string;
  approx_space_sqft: string;
  parking_instructions: string;
  arrival_instructions: string;
  accessibility_notes: string;
  requires_vsc: boolean;
  requires_vaccine_record: boolean;
}

interface Props {
  orgProfileImage?: string | null;
  selectedVisitId?: number | null;
  onSelectVisit?: (id: number) => void;
  onBackFromVisit?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
      <span className="text-xs text-gray-600 whitespace-nowrap">{confirmed}/{total} volunteers</span>
    </div>
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

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateShort(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
}

function toTimeInput(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-CA', {
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'America/New_York',
  });
}

function visitToEditForm(v: OrgVisit): EditForm {
  return {
    title: v.title ?? '',
    visit_date: v.visit_date,
    start_time: toTimeInput(v.start_time),
    end_time: toTimeInput(v.end_time),
    address: v.address,
    location_place_id: v.location_place_id,
    location_lat: v.location_lat,
    location_lng: v.location_lng,
    guest_contact_name: v.guest_contact_name ?? '',
    guest_contact_email: v.guest_contact_email ?? '',
    guest_contact_phone: v.guest_contact_phone ?? '',
    visitor_count_expected: v.expected_visitors?.toString() ?? '',
    volunteer_slots: v.max_volunteers?.toString() ?? '1',
    special_needs_notes: v.special_needs_notes ?? '',
    approx_space_sqft: v.approx_space_sqft?.toString() ?? '',
    parking_instructions: v.parking_instructions ?? '',
    arrival_instructions: v.arrival_instructions ?? '',
    accessibility_notes: v.accessibility_notes ?? '',
    requires_vsc: v.requires_vsc,
    requires_vaccine_record: v.requires_vaccine,
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function OrgMyVisits({ orgProfileImage, selectedVisitId, onSelectVisit, onBackFromVisit }: Props) {
  const [visits, setVisits] = useState<OrgVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailRegs, setDetailRegs] = useState<VolunteerReg[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<VisitTab>('upcoming');

  useEffect(() => {
    const fetchVisits = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/visits/my');
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to load visits'); return; }
        setVisits(json.visits || []);
      } catch {
        setError('Failed to load visits');
      } finally {
        setLoading(false);
      }
    };
    fetchVisits();
  }, []);

  useEffect(() => {
    if (selectedVisitId == null) { setDetailRegs(null); return; }
    setDetailLoading(true);
    fetch(`/api/visits/${selectedVisitId}`)
      .then(r => r.json())
      .then(json => setDetailRegs(json.visit?.visit_registrations ?? []))
      .catch(() => setDetailRegs([]))
      .finally(() => setDetailLoading(false));
  }, [selectedVisitId]);

  // Reset edit state when leaving detail view
  useEffect(() => {
    if (selectedVisitId == null) {
      setEditForm(null);
      setSaveError(null);
    }
  }, [selectedVisitId]);

  const selectedVisit = selectedVisitId != null ? (visits.find(v => v.id === selectedVisitId) ?? null) : null;
  const isEditing = editForm !== null;
  const canEdit = selectedVisit && ['pending_review', 'approved'].includes(selectedVisit.status);

  const handleStartEdit = () => {
    if (selectedVisit) setEditForm(visitToEditForm(selectedVisit));
    setSaveError(null);
  };

  const handleCancelEdit = () => { setEditForm(null); setSaveError(null); };

  const handleBack = () => {
    setDetailRegs(null);
    setEditForm(null);
    setSaveError(null);
    onBackFromVisit?.();
  };

  const handleSave = async () => {
    if (!editForm || !selectedVisit) return;
    setSaveLoading(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/visits/${selectedVisit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          visit_date: editForm.visit_date,
          start_time: editForm.start_time,
          end_time: editForm.end_time,
          address: editForm.address,
          location_place_id: editForm.location_place_id,
          location_lat: editForm.location_lat,
          location_lng: editForm.location_lng,
          guest_contact_name: editForm.guest_contact_name,
          guest_contact_email: editForm.guest_contact_email,
          guest_contact_phone: editForm.guest_contact_phone,
          visitor_count_expected: editForm.visitor_count_expected ? parseInt(editForm.visitor_count_expected) : null,
          volunteer_slots: parseInt(editForm.volunteer_slots) || 1,
          special_needs_notes: editForm.special_needs_notes,
          approx_space_sqft: editForm.approx_space_sqft ? parseInt(editForm.approx_space_sqft) : null,
          parking_instructions: editForm.parking_instructions,
          arrival_instructions: editForm.arrival_instructions,
          accessibility_notes: editForm.accessibility_notes,
          requires_vsc: editForm.requires_vsc,
          requires_vaccine_record: editForm.requires_vaccine_record,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setSaveError(json.error || 'Failed to save'); return; }

      setVisits(prev => prev.map(v => {
        if (v.id !== selectedVisit.id) return v;
        return {
          ...v,
          title: editForm.title || null,
          visit_date: editForm.visit_date,
          address: editForm.address,
          location_place_id: editForm.location_place_id,
          location_lat: editForm.location_lat,
          location_lng: editForm.location_lng,
          guest_contact_name: editForm.guest_contact_name || null,
          guest_contact_email: editForm.guest_contact_email || null,
          guest_contact_phone: editForm.guest_contact_phone || null,
          expected_visitors: editForm.visitor_count_expected ? parseInt(editForm.visitor_count_expected) : null,
          max_volunteers: parseInt(editForm.volunteer_slots) || 1,
          special_needs_notes: editForm.special_needs_notes || null,
          approx_space_sqft: editForm.approx_space_sqft ? parseInt(editForm.approx_space_sqft) : null,
          parking_instructions: editForm.parking_instructions || null,
          arrival_instructions: editForm.arrival_instructions || null,
          accessibility_notes: editForm.accessibility_notes || null,
          requires_vsc: editForm.requires_vsc,
          requires_vaccine: editForm.requires_vaccine_record,
        };
      }));
      setEditForm(null);
    } catch {
      setSaveError('An error occurred. Please try again.');
    } finally {
      setSaveLoading(false);
    }
  };

  const set = (field: keyof EditForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setEditForm(prev => prev ? { ...prev, [field]: e.target.value } : prev);

  const setCheck = (field: keyof EditForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setEditForm(prev => prev ? { ...prev, [field]: e.target.checked } : prev);

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-600">Loading visits…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
        <AlertCircle className="text-red-500 mt-0.5 shrink-0" size={18} />
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    );
  }

  // ── Detail / Edit view ────────────────────────────────────────────────────

  if (selectedVisit) {
    const confirmed = selectedVisit.registration_counts?.confirmed ?? 0;
    const waitlisted = selectedVisit.registration_counts?.waitlisted ?? 0;
    const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
    const lc = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

    const confirmedRegs = (detailRegs ?? []).filter(r => r.status === 'confirmed');
    const waitlistedRegs = (detailRegs ?? []).filter(r => r.status === 'waitlisted');

    return (
      <div className="max-w-2xl mx-auto">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={handleBack} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium transition">
            <ArrowLeft size={16} /> My Visits
          </button>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button onClick={handleCancelEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition">
                  <X size={14} /> Cancel
                </button>
                <button onClick={handleSave} disabled={saveLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-[#0e62ae] text-white rounded-lg hover:bg-[#0a4f8f] disabled:opacity-50 transition">
                  <Save size={14} /> {saveLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </>
            ) : canEdit ? (
              <button onClick={handleStartEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition">
                <Edit2 size={14} /> Edit
              </button>
            ) : null}
          </div>
        </div>

        {saveError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{saveError}</div>
        )}

        {/* Header card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          {/* Logo + status row */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <OrgLogo url={orgProfileImage} size={56} />
            <StatusBadge status={selectedVisit.status} />
          </div>

          {/* Title below logo */}
          {isEditing ? (
            <input
              className={`${ic} text-base font-semibold mb-3`}
              value={editForm!.title}
              onChange={set('title')}
              placeholder="Visit title"
            />
          ) : (
            <h2 className="text-xl font-bold text-gray-900 mb-3">{selectedVisit.title || 'Untitled Visit'}</h2>
          )}

          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className={lc}>Visit Date</label>
                <input type="date" className={ic} value={editForm!.visit_date} onChange={set('visit_date')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lc}>Start Time</label>
                  <input type="time" className={ic} value={editForm!.start_time} onChange={set('start_time')} />
                </div>
                <div>
                  <label className={lc}>End Time</label>
                  <input type="time" className={ic} value={editForm!.end_time} onChange={set('end_time')} />
                </div>
              </div>
              <div>
                <label className={lc}>Address</label>
                <PlacesAutocomplete
                  initialValue={editForm!.address}
                  onSelect={(result: PlaceResult) => {
                    setEditForm(prev => prev ? {
                      ...prev,
                      address: result.formatted_address,
                      location_place_id: result.place_id,
                      location_lat: result.lat,
                      location_lng: result.lng,
                    } : prev);
                  }}
                  className={ic}
                />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className={`${lc} mb-2`}>Primary Contact</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={lc}>Name</label>
                    <input className={ic} value={editForm!.guest_contact_name} onChange={set('guest_contact_name')} />
                  </div>
                  <div>
                    <label className={lc}>Phone</label>
                    <input className={ic} value={editForm!.guest_contact_phone} onChange={set('guest_contact_phone')} />
                  </div>
                  <div>
                    <label className={lc}>Email</label>
                    <input type="email" className={ic} value={editForm!.guest_contact_email} onChange={set('guest_contact_email')} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-gray-400 shrink-0" />
                <span>{formatDate(selectedVisit.visit_date)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-gray-400 shrink-0" />
                <span>{formatCardTime(selectedVisit.start_time)} – {formatCardTime(selectedVisit.end_time)}</span>
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedVisit.address)}${selectedVisit.location_place_id ? `&query_place_id=${selectedVisit.location_place_id}` : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-[#0e62ae] group/addr transition-colors"
              >
                <MapPin size={14} className="text-gray-400 shrink-0 group-hover/addr:text-[#0e62ae]" />
                <span className="underline underline-offset-2 decoration-gray-300 group-hover/addr:decoration-[#0e62ae]">{selectedVisit.address}{selectedVisit.postal_code ? `, ${selectedVisit.postal_code}` : ''}</span>
                <ExternalLink size={11} className="text-gray-300 group-hover/addr:text-[#0e62ae] shrink-0" />
              </a>
              {(selectedVisit.guest_contact_name || selectedVisit.guest_contact_email || selectedVisit.guest_contact_phone) && (
                <div className="border-t border-gray-100 pt-2 mt-2 space-y-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Primary Contact</p>
                  {selectedVisit.guest_contact_name && (
                    <div className="flex items-center gap-2"><User size={13} className="text-gray-400 shrink-0" />{selectedVisit.guest_contact_name}</div>
                  )}
                  {selectedVisit.guest_contact_email && (
                    <div className="flex items-center gap-2"><Mail size={13} className="text-gray-400 shrink-0" />{selectedVisit.guest_contact_email}</div>
                  )}
                  {selectedVisit.guest_contact_phone && (
                    <div className="flex items-center gap-2"><Phone size={13} className="text-gray-400 shrink-0" />{selectedVisit.guest_contact_phone}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Admin note / pending message */}
        {selectedVisit.admin_note && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-yellow-700 mb-1">Note from Sunshine</p>
            <p className="text-sm text-yellow-900">{selectedVisit.admin_note}</p>
          </div>
        )}
        {selectedVisit.status === 'pending_review' && !isEditing && (
          <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500 italic">
            Our team is reviewing your request and will be in touch soon.
          </div>
        )}

        {/* Volunteers */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <PawPrint size={14} className="text-gray-400" /> Volunteers
          </h3>

          {isEditing ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lc}>Volunteer Slots</label>
                <input type="number" min="1" className={ic} value={editForm!.volunteer_slots} onChange={set('volunteer_slots')} />
              </div>
              <div>
                <label className={lc}>Expected Visitors</label>
                <input type="number" min="1" className={ic} value={editForm!.visitor_count_expected} onChange={set('visitor_count_expected')} placeholder="Optional" />
              </div>
            </div>
          ) : (
            <>
              <SlotBar confirmed={confirmed} total={selectedVisit.max_volunteers} />
              <div className="mt-2 mb-4 flex flex-wrap gap-4 text-sm text-gray-600">
                <span><span className="font-semibold text-gray-900">{confirmed}</span> confirmed</span>
                {waitlisted > 0 && <span><span className="font-semibold text-amber-700">{waitlisted}</span> waitlisted</span>}
                <span><span className="font-semibold text-gray-900">{Math.max(0, selectedVisit.max_volunteers - confirmed)}</span> spots open</span>
                {selectedVisit.expected_visitors && (
                  <span className="text-gray-400">· {selectedVisit.expected_visitors} expected visitors</span>
                )}
              </div>

              {detailLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-gray-400">Loading…</span>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {Array.from({ length: selectedVisit.max_volunteers }).map((_, i) => {
                      const reg = confirmedRegs[i];
                      if (reg) {
                        return (
                          <div key={reg.id} className="flex items-stretch rounded-xl overflow-hidden border border-gray-100 bg-gray-50 h-32">
                            <div className="w-32 shrink-0 bg-gray-200">
                              {reg.dog_picture_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={reg.dog_picture_url} alt={reg.dog_name ?? ''} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-blue-50">
                                  <PawPrint size={22} className="text-blue-200" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 px-4 flex flex-col justify-center gap-0.5">
                              <p className="text-sm font-semibold text-gray-900 leading-tight">{reg.dog_name ?? 'Unknown Dog'}</p>
                              {reg.dog_breed && <p className="text-xs text-gray-500">{reg.dog_breed}</p>}
                              {reg.volunteer_first_name && <p className="text-xs text-gray-400">Handler: {reg.volunteer_first_name}</p>}
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

                  {waitlistedRegs.length > 0 && (
                    <div className="border-t border-gray-100 mt-3 pt-3">
                      <p className="text-xs font-semibold text-amber-600 mb-2">Waitlisted</p>
                      <div className="space-y-2">
                        {waitlistedRegs.map(reg => (
                          <div key={reg.id} className="flex items-stretch rounded-xl overflow-hidden border border-amber-100 bg-amber-50 h-16">
                            <div className="w-16 shrink-0 bg-amber-100">
                              {reg.dog_picture_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={reg.dog_picture_url} alt={reg.dog_name ?? ''} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <PawPrint size={18} className="text-amber-300" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 px-4 flex flex-col justify-center gap-0.5">
                              <p className="text-sm font-semibold text-gray-800 leading-tight">{reg.dog_name ?? 'Unknown Dog'}</p>
                              {reg.dog_breed && <p className="text-xs text-gray-500">{reg.dog_breed}</p>}
                              {reg.volunteer_first_name && <p className="text-xs text-amber-600">Handler: {reg.volunteer_first_name}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Requirements */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Requirements</h3>
          {isEditing ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={editForm!.requires_vsc} onChange={setCheck('requires_vsc')} />
                <span className="text-sm text-gray-700">Volunteer Screening Check (VSC) required</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={editForm!.requires_vaccine_record} onChange={setCheck('requires_vaccine_record')} />
                <span className="text-sm text-gray-700">Vaccine records required</span>
              </label>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${selectedVisit.requires_vsc ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>
                VSC {selectedVisit.requires_vsc ? 'Required' : 'Not Required'}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${selectedVisit.requires_vaccine ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>
                Vaccine Records {selectedVisit.requires_vaccine ? 'Required' : 'Not Required'}
              </span>
            </div>
          )}
        </div>

        {/* Instructions & notes */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Instructions &amp; Notes</h3>
          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className={lc}>Space Size (sq ft)</label>
                <input type="number" className={ic} value={editForm!.approx_space_sqft} onChange={set('approx_space_sqft')} placeholder="Optional" />
              </div>
              <div>
                <label className={lc}>Parking Instructions</label>
                <textarea rows={2} className={ic} value={editForm!.parking_instructions} onChange={set('parking_instructions')} placeholder="Parking details…" />
              </div>
              <div>
                <label className={lc}>Arrival Instructions</label>
                <textarea rows={2} className={ic} value={editForm!.arrival_instructions} onChange={set('arrival_instructions')} placeholder="How should volunteers arrive / check in?" />
              </div>
              <div>
                <label className={lc}>Accessibility Notes</label>
                <textarea rows={2} className={ic} value={editForm!.accessibility_notes} onChange={set('accessibility_notes')} placeholder="Any accessibility considerations?" />
              </div>
              <div>
                <label className={lc}>Special Needs / Notes</label>
                <textarea rows={2} className={ic} value={editForm!.special_needs_notes} onChange={set('special_needs_notes')} placeholder="Any special needs for the audience?" />
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-gray-700">
              {selectedVisit.approx_space_sqft && (
                <p><span className="font-medium text-gray-500">Space:</span> {selectedVisit.approx_space_sqft.toLocaleString()} sq ft</p>
              )}
              {selectedVisit.parking_instructions && (
                <p><span className="font-medium text-gray-500">Parking:</span> {selectedVisit.parking_instructions}</p>
              )}
              {selectedVisit.arrival_instructions && (
                <p><span className="font-medium text-gray-500">Arrival:</span> {selectedVisit.arrival_instructions}</p>
              )}
              {selectedVisit.accessibility_notes && (
                <p><span className="font-medium text-gray-500">Accessibility:</span> {selectedVisit.accessibility_notes}</p>
              )}
              {selectedVisit.special_needs_notes && (
                <p><span className="font-medium text-gray-500">Special Needs:</span> {selectedVisit.special_needs_notes}</p>
              )}
              {!selectedVisit.approx_space_sqft && !selectedVisit.parking_instructions &&
               !selectedVisit.arrival_instructions && !selectedVisit.accessibility_notes &&
               !selectedVisit.special_needs_notes && (
                <p className="text-gray-400 italic text-xs">No instructions provided</p>
              )}
            </div>
          )}
        </div>

        {/* Map */}
        {!isEditing && selectedVisit.location_lat != null && selectedVisit.location_lng != null && (
          <VisitMap
            lat={selectedVisit.location_lat}
            lng={selectedVisit.location_lng}
            address={selectedVisit.address}
            placeId={selectedVisit.location_place_id}
          />
        )}

      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────

  const today = new Date().toISOString().split('T')[0];
  const upcoming = visits.filter(v => v.status === 'approved' && v.visit_date >= today);
  const pending  = visits.filter(v => v.status === 'pending_review');
  const past     = visits.filter(v =>
    ['completed', 'cancelled', 'declined'].includes(v.status) ||
    (v.status === 'approved' && v.visit_date < today)
  );

  const tabCounts: Record<VisitTab, number> = {
    upcoming: upcoming.length,
    pending:  pending.length,
    past:     past.length,
  };

  const tabVisits: Record<VisitTab, OrgVisit[]> = { upcoming, pending, past };
  const currentVisits = tabVisits[activeTab];

  const TAB_CONFIG: { key: VisitTab; label: string; showCount: boolean }[] = [
    { key: 'upcoming', label: 'Upcoming & Active', showCount: true },
    { key: 'pending',  label: 'Pending Review',    showCount: true },
    { key: 'past',     label: 'Past & Canceled',   showCount: false },
  ];

  const renderCard = (visit: OrgVisit) => {
    const confirmed = visit.registration_counts?.confirmed ?? 0;
    const waitlisted = visit.registration_counts?.waitlisted ?? 0;
    return (
      <div
        key={visit.id}
        onClick={() => onSelectVisit?.(visit.id)}
        className="bg-white rounded-xl border-2 border-gray-100 p-4 shadow-sm cursor-pointer hover:border-blue-200 hover:shadow-md transition-all group"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5">
            <OrgLogo url={orgProfileImage} size={36} />
            <StatusBadge status={visit.status} />
          </div>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors" />
        </div>
        <h3 className="font-semibold text-gray-900 truncate mb-1">{visit.title || 'Untitled Visit'}</h3>
        <p className="text-sm text-gray-600">{formatDateShort(visit.visit_date)} · {formatCardTime(visit.start_time)} – {formatCardTime(visit.end_time)}</p>
        <p className="text-sm text-gray-500 truncate mb-3">{visit.address}</p>
        <SlotBar confirmed={confirmed} total={visit.max_volunteers} />
        {waitlisted > 0 && <p className="text-xs text-amber-600 mt-1">{waitlisted} on waitlist</p>}
        {visit.guest_contact_name && <p className="text-xs text-gray-400 mt-1.5">Contact: {visit.guest_contact_name}</p>}
        {visit.admin_note && (
          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            <p className="text-xs font-semibold text-yellow-700">Note from Sunshine</p>
            <p className="text-xs text-yellow-900 line-clamp-2">{visit.admin_note}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-full">
        {TAB_CONFIG.map(({ key, label, showCount }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {showCount && tabCounts[key] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === key ? 'bg-[#0e62ae] text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {tabCounts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {currentVisits.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Calendar className="mx-auto mb-4 text-gray-300" size={48} />
          {activeTab === 'upcoming' && (
            <>
              <p className="font-medium">No upcoming visits</p>
              <p className="text-sm mt-1">Approved visits will appear here once scheduled.</p>
            </>
          )}
          {activeTab === 'pending' && (
            <>
              <p className="font-medium">No pending requests</p>
              <p className="text-sm mt-1">Submit a visit request and we'll review it shortly.</p>
            </>
          )}
          {activeTab === 'past' && (
            <>
              <p className="font-medium">No past visits yet</p>
              <p className="text-sm mt-1">Completed and canceled visits will appear here.</p>
            </>
          )}
        </div>
      ) : (
        <div className={`grid gap-4 sm:grid-cols-2 ${activeTab === 'past' ? 'opacity-75' : ''}`}>
          {currentVisits.map(renderCard)}
        </div>
      )}
    </div>
  );
}
