// src/components/visits/BrowseOrgVisits.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  Calendar, Clock, MapPin, AlertCircle, ArrowLeft,
  ChevronRight, Lock, CheckCircle, Building2, PawPrint, ExternalLink,
} from 'lucide-react';
import { formatCardTime } from '@/utils/timeZone';
import VisitMap from '@/components/ui/VisitMap';

// ── Types ────────────────────────────────────────────────────────────────────

type RegistrationStatus = 'confirmed' | 'waitlisted' | null;
type BrowseTab = 'browse' | 'my-events';

interface Visit {
  id: number;
  title: string | null;
  visit_date: string;
  start_time: string;
  end_time: string;
  address: string;
  location_lat: number | null;
  location_lng: number | null;
  location_place_id: string | null;
  distance_km: number | null;
  volunteer_slots: number;
  slots_remaining: number;
  confirmed_count: number;
  waitlisted_count: number;
  requires_vsc: boolean;
  parking_coverage: string | null;
  parking_instructions: string | null;
  arrival_instructions: string | null;
  accessibility_notes: string | null;
  event_description: string | null;
  visitor_count_expected: number | null;
  audience_age_ranges: string[] | null;
  org_name: string | null;
  org_profile_image: string | null;
  my_registration_status: RegistrationStatus;
  my_waitlist_position: number | null;
}

interface VolunteerReg {
  id: number;
  volunteer_id: string;
  status: 'confirmed' | 'waitlisted';
  waitlist_position: number | null;
  volunteer_first_name: string | null;
  dog_name: string | null;
  dog_breed: string | null;
  dog_picture_url: string | null;
}

interface VolunteerMeta {
  volunteer_has_vsc: boolean;
  volunteer_has_vaccine: boolean;
  volunteer_location_set: boolean;
}

interface Props {
  selectedVisitId?: number | null;
  activeTab?: BrowseTab;
  onSelectVisit?: (id: number) => void;
  onBackFromVisit?: () => void;
  onTabChange?: (tab: BrowseTab) => void;
  hideTabs?: boolean;
}

const DEFAULT_DISTANCE = 15;
const MAX_DISTANCE = 50;

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
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

function getLockReason(visit: Visit, meta: VolunteerMeta | null): string | null {
  if (!meta) return null;
  if (visit.requires_vsc && !meta.volunteer_has_vsc) return 'VSC document';
  if (!meta.volunteer_has_vaccine) return 'current rabies vaccine record';
  return null;
}

function getLockLabel(visit: Visit, meta: VolunteerMeta | null): string | null {
  if (!meta) return null;
  if (visit.requires_vsc && !meta.volunteer_has_vsc) return 'VSC Required';
  if (!meta.volunteer_has_vaccine) return 'Rabies Vaccine Record Required';
  return null;
}

function parseRegs(rawRegs: any[]): VolunteerReg[] {
  return (rawRegs ?? [])
    .filter((r: any) => r.status !== 'cancelled')
    .map((r: any) => {
      const user = r.users ?? {};
      const dog = Array.isArray(user.dogs) ? user.dogs[0] : (user.dogs ?? null);
      return {
        id: r.id,
        volunteer_id: r.volunteer_id,
        status: r.status,
        waitlist_position: r.waitlist_position ?? null,
        volunteer_first_name: user.first_name ?? null,
        dog_name: dog?.dog_name ?? null,
        dog_breed: dog?.dog_breed ?? null,
        dog_picture_url: dog?.dog_picture_url ?? null,
      };
    });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BrowseOrgVisits({
  selectedVisitId,
  activeTab = 'browse',
  onSelectVisit,
  onBackFromVisit,
  onTabChange,
  hideTabs = false,
}: Props) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [meta, setMeta] = useState<VolunteerMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDistance, setFilterDistance] = useState(DEFAULT_DISTANCE);
  const [filterQualifyOnly, setFilterQualifyOnly] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [actionError, setActionError] = useState<Record<number, string>>({});
  const [detailRegs, setDetailRegs] = useState<VolunteerReg[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/visits/available');
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to load visits'); return; }
        setVisits(json.visits ?? []);
        setMeta({
          volunteer_has_vsc: json.volunteer_has_vsc ?? false,
          volunteer_has_vaccine: json.volunteer_has_vaccine ?? false,
          volunteer_location_set: json.volunteer_location_set ?? false,
        });
      } catch {
        setError('Failed to load visits');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Fetch registration detail (dog/volunteer info) when a visit is selected
  useEffect(() => {
    if (selectedVisitId == null) { setDetailRegs(null); return; }
    setDetailLoading(true);
    fetch(`/api/visits/${selectedVisitId}`)
      .then(r => r.json())
      .then(json => setDetailRegs(parseRegs(json.visit?.visit_registrations ?? [])))
      .catch(() => setDetailRegs([]))
      .finally(() => setDetailLoading(false));
  }, [selectedVisitId]);

  const refreshDetailRegs = async (visitId: number) => {
    try {
      const r = await fetch(`/api/visits/${visitId}`);
      const json = await r.json();
      setDetailRegs(parseRegs(json.visit?.visit_registrations ?? []));
    } catch { /* non-critical */ }
  };

  const handleRegister = async (visitId: number) => {
    setActionLoading(visitId);
    setActionError(prev => { const n = { ...prev }; delete n[visitId]; return n; });
    try {
      const res = await fetch(`/api/visits/${visitId}/register`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setActionError(prev => ({ ...prev, [visitId]: json.error || 'Failed to register' }));
        return;
      }
      const newStatus: RegistrationStatus = json.status;
      setVisits(prev => prev.map(v => {
        if (v.id !== visitId) return v;
        const isWaitlisted = newStatus === 'waitlisted';
        return {
          ...v,
          my_registration_status: newStatus,
          my_waitlist_position: json.waitlist_position ?? null,
          confirmed_count: isWaitlisted ? v.confirmed_count : v.confirmed_count + 1,
          waitlisted_count: isWaitlisted ? v.waitlisted_count + 1 : v.waitlisted_count,
          slots_remaining: isWaitlisted ? v.slots_remaining : Math.max(0, v.slots_remaining - 1),
        };
      }));
      // Refresh dog bars in real time
      if (visitId === selectedVisitId) await refreshDetailRegs(visitId);
    } catch {
      setActionError(prev => ({ ...prev, [visitId]: 'An error occurred. Please try again.' }));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (visitId: number) => {
    setActionLoading(visitId);
    setActionError(prev => { const n = { ...prev }; delete n[visitId]; return n; });
    try {
      const res = await fetch(`/api/visits/${visitId}/cancel-registration`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setActionError(prev => ({ ...prev, [visitId]: json.error || 'Failed to cancel' }));
        return;
      }
      setVisits(prev => prev.map(v => {
        if (v.id !== visitId) return v;
        const wasConfirmed = v.my_registration_status === 'confirmed';
        return {
          ...v,
          my_registration_status: null,
          my_waitlist_position: null,
          confirmed_count: wasConfirmed ? Math.max(0, v.confirmed_count - 1) : v.confirmed_count,
          waitlisted_count: !wasConfirmed ? Math.max(0, v.waitlisted_count - 1) : v.waitlisted_count,
          slots_remaining: wasConfirmed ? v.slots_remaining + 1 : v.slots_remaining,
        };
      }));
      // Refresh dog bars in real time
      if (visitId === selectedVisitId) await refreshDetailRegs(visitId);
    } catch {
      setActionError(prev => ({ ...prev, [visitId]: 'An error occurred. Please try again.' }));
    } finally {
      setActionLoading(null);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  const selectedVisit = selectedVisitId != null
    ? visits.find(v => v.id === selectedVisitId) ?? null
    : null;

  const passesDistanceFilter = (v: Visit) => {
    if (!meta?.volunteer_location_set || v.distance_km == null) return true;
    return v.distance_km <= filterDistance;
  };

  // Browse shows ALL upcoming visits (including already-registered ones, with overlay)
  const browseVisits = visits.filter(v =>
    passesDistanceFilter(v) &&
    (!filterQualifyOnly || !getLockReason(v, meta))
  );

  const myEvents = visits
    .filter(v => v.my_registration_status !== null)
    .sort((a, b) => a.visit_date.localeCompare(b.visit_date));

  const hasAnyLocked = meta != null && visits.some(v => getLockReason(v, meta) !== null);

  // ── Loading / Error ───────────────────────────────────────────────────────

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

  // ── Detail view ───────────────────────────────────────────────────────────

  if (selectedVisit) {
    const lockReason = getLockReason(selectedVisit, meta);
    const myStatus = selectedVisit.my_registration_status;
    const isFull = selectedVisit.slots_remaining <= 0;
    const isLoading = actionLoading === selectedVisit.id;
    const err = actionError[selectedVisit.id];
    const backLabel = activeTab === 'my-events' ? 'My Events' : 'Browse Events';

    const confirmedRegs = (detailRegs ?? []).filter(r => r.status === 'confirmed');
    const waitlistedRegs = (detailRegs ?? []).filter(r => r.status === 'waitlisted');

    return (
      <div className="max-w-2xl mx-auto">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={onBackFromVisit}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium transition"
          >
            <ArrowLeft size={16} /> {backLabel}
          </button>
          <div className="flex items-center gap-2">
            <CountdownBadge dateStr={selectedVisit.visit_date} />
            {myStatus === 'confirmed' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                <CheckCircle size={12} /> Registered
              </span>
            )}
            {myStatus === 'waitlisted' && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                Waitlisted #{selectedVisit.my_waitlist_position}
              </span>
            )}
          </div>
        </div>

        {/* Header card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <OrgLogo url={selectedVisit.org_profile_image} size={56} />
            {selectedVisit.distance_km != null && (
              <span className="text-xs font-medium text-gray-400 bg-gray-50 border border-gray-100 px-2 py-1 rounded-full shrink-0">
                {selectedVisit.distance_km} km away
              </span>
            )}
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-0.5">{selectedVisit.title || 'Untitled Visit'}</h2>
          {selectedVisit.org_name && (
            <p className="text-base text-gray-500 mb-3">{selectedVisit.org_name}</p>
          )}

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
              <span className="underline underline-offset-2 decoration-gray-300 group-hover/addr:decoration-[#0e62ae]">{selectedVisit.address}</span>
              <ExternalLink size={11} className="text-gray-300 group-hover/addr:text-[#0e62ae] shrink-0" />
            </a>
          </div>

          <div className="border-t border-gray-100 pt-3 mt-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Requirements</p>
            <div className="flex flex-wrap gap-2">
              {selectedVisit.requires_vsc && (
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  !meta?.volunteer_has_vsc
                    ? 'bg-red-50 text-red-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  VSC Required {!meta?.volunteer_has_vsc ? '— missing' : '✓'}
                </span>
              )}
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                !meta?.volunteer_has_vaccine
                  ? 'bg-red-50 text-red-700'
                  : 'bg-orange-100 text-orange-700'
              }`}>
                Rabies Vaccine Record {!meta?.volunteer_has_vaccine ? '— missing' : '✓'}
              </span>
            </div>
          </div>
        </div>

        {/* About this visit */}
        {(selectedVisit.event_description || selectedVisit.visitor_count_expected || (selectedVisit.audience_age_ranges?.length ?? 0) > 0) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">About This Visit</h3>
            <div className="space-y-2 text-sm text-gray-700">
              {selectedVisit.event_description && (
                <p className="whitespace-pre-line">{selectedVisit.event_description}</p>
              )}
              {selectedVisit.visitor_count_expected && (
                <p><span className="font-medium text-gray-500">Expected visitors:</span> {selectedVisit.visitor_count_expected}</p>
              )}
              {(selectedVisit.audience_age_ranges?.length ?? 0) > 0 && (
                <p><span className="font-medium text-gray-500">Audience:</span> {selectedVisit.audience_age_ranges!.join(', ')}</p>
              )}
            </div>
          </div>
        )}

        {/* Sign-up / status card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <PawPrint size={14} className="text-gray-400" /> Volunteer Slots
          </h3>
          <SlotBar confirmed={selectedVisit.confirmed_count} total={selectedVisit.volunteer_slots} />
          <div className="mt-2 mb-4 flex flex-wrap gap-4 text-sm text-gray-600">
            <span><span className="font-semibold text-gray-900">{selectedVisit.confirmed_count}</span> confirmed</span>
            {selectedVisit.waitlisted_count > 0 && (
              <span><span className="font-semibold text-amber-700">{selectedVisit.waitlisted_count}</span> waitlisted</span>
            )}
            <span><span className="font-semibold text-gray-900">{selectedVisit.slots_remaining}</span> spots open</span>
          </div>

          {/* Dog / volunteer bars */}
          {detailLoading ? (
            <div className="flex items-center gap-2 py-2 mb-4">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-400">Loading…</span>
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                {Array.from({ length: selectedVisit.volunteer_slots }).map((_, i) => {
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
                <div className="border-t border-gray-100 pt-3 mb-4">
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

          {err && <p className="mb-3 text-sm text-red-600">{err}</p>}

          {lockReason ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2">
              <Lock size={15} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                This visit requires a <strong>{lockReason}</strong>. Upload it in your profile settings to sign up.
              </p>
            </div>
          ) : myStatus === 'confirmed' ? (
            <button
              onClick={() => handleCancel(selectedVisit.id)}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-white border border-red-300 text-red-600 hover:bg-red-50 text-sm font-semibold rounded-xl transition disabled:opacity-50"
            >
              {isLoading ? 'Cancelling…' : 'Cancel Registration'}
            </button>
          ) : myStatus === 'waitlisted' ? (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                You're <strong>#{selectedVisit.my_waitlist_position}</strong> on the waitlist.
                We'll notify you if a spot opens up.
              </div>
              <button
                onClick={() => handleCancel(selectedVisit.id)}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-semibold rounded-xl transition disabled:opacity-50"
              >
                {isLoading ? 'Leaving…' : 'Leave Waitlist'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleRegister(selectedVisit.id)}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-[#0e62ae] hover:bg-[#0a4f8f] text-white text-sm font-semibold rounded-xl transition disabled:opacity-50"
            >
              {isLoading ? 'Signing up…' : isFull ? 'Join Waitlist' : 'Sign Up'}
            </button>
          )}
        </div>

        {/* Logistics */}
        {(selectedVisit.parking_coverage || selectedVisit.parking_instructions || selectedVisit.arrival_instructions || selectedVisit.accessibility_notes) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Logistics</h3>
            <div className="space-y-2 text-sm text-gray-700">
              {selectedVisit.parking_coverage && (
                <p><span className="font-medium text-gray-500">Parking:</span> {{
                  free_on_site: 'Free parking on-site',
                  reimbursed_on_site: 'Volunteers pay — reimbursed on-site',
                  invoice: 'Volunteers pay — added to invoice',
                }[selectedVisit.parking_coverage] ?? selectedVisit.parking_coverage.replace(/_/g, ' ')}</p>
              )}
              {selectedVisit.parking_instructions && (
                <p><span className="font-medium text-gray-500">Parking details:</span> {selectedVisit.parking_instructions}</p>
              )}
              {selectedVisit.arrival_instructions && (
                <p><span className="font-medium text-gray-500">Arrival:</span> {selectedVisit.arrival_instructions}</p>
              )}
              {selectedVisit.accessibility_notes && (
                <p><span className="font-medium text-gray-500">Accessibility:</span> {selectedVisit.accessibility_notes}</p>
              )}
            </div>
          </div>
        )}

        {/* Map */}
        {selectedVisit.location_lat != null && selectedVisit.location_lng != null && (
          <div className="mb-4">
            <VisitMap
              lat={selectedVisit.location_lat}
              lng={selectedVisit.location_lng}
              address={selectedVisit.address}
              placeId={selectedVisit.location_place_id}
            />
          </div>
        )}

      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────

  const TAB_CONFIG: { key: BrowseTab; label: string; count: number }[] = [
    { key: 'browse',    label: 'Browse Events', count: browseVisits.length },
    { key: 'my-events', label: 'My Events',     count: myEvents.length },
  ];

  const currentVisits = activeTab === 'browse' ? browseVisits : myEvents;

  const renderCard = (visit: Visit) => {
    const locked = getLockReason(visit, meta);
    const lockLabel = getLockLabel(visit, meta);
    const myStatus = visit.my_registration_status;

    // Show registration banner + colored border on any tab when registered/waitlisted
    const isRegistered = !locked && myStatus !== null;

    return (
      <div
        key={visit.id}
        onClick={locked ? undefined : () => onSelectVisit?.(visit.id)}
        className={`bg-white rounded-xl border-2 shadow-sm transition-all relative overflow-hidden ${
          locked
            ? 'opacity-60 cursor-default border-gray-100'
            : isRegistered
            ? myStatus === 'confirmed'
              ? 'cursor-pointer hover:shadow-md group border-green-200'
              : 'cursor-pointer hover:shadow-md group border-amber-200'
            : 'cursor-pointer hover:border-blue-200 hover:shadow-md group border-gray-100'
        }`}
      >
        {/* Lock banner */}
        {locked && (
          <div className="flex items-center gap-1.5 bg-gray-700 text-white text-xs font-semibold px-3 py-1.5">
            <Lock size={11} />
            {lockLabel}
          </div>
        )}

        {/* Registration banner */}
        {isRegistered && myStatus === 'confirmed' && (
          <div className="flex items-center gap-1.5 bg-green-600 text-white text-xs font-semibold px-3 py-1.5">
            <CheckCircle size={11} />
            Registered
          </div>
        )}
        {isRegistered && myStatus === 'waitlisted' && (
          <div className="flex items-center gap-1.5 bg-amber-500 text-white text-xs font-semibold px-3 py-1.5">
            Waitlisted #{visit.my_waitlist_position}
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <OrgLogo url={visit.org_profile_image} size={36} />
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 truncate text-sm leading-tight">
                  {visit.title || 'Untitled Visit'}
                </h3>
                {visit.org_name && (
                  <p className="text-xs text-gray-400 truncate">{visit.org_name}</p>
                )}
              </div>
            </div>
            {!locked && (
              <ChevronRight
                size={16}
                className="text-gray-300 group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors"
              />
            )}
          </div>

          <p className="text-xs text-gray-600 mb-0.5">
            {formatDateShort(visit.visit_date)} · {formatCardTime(visit.start_time)} – {formatCardTime(visit.end_time)}
          </p>
          <p className="text-xs text-gray-500 truncate mb-1">{visit.address}</p>

          {visit.event_description && (
            <p className="text-xs text-gray-700 italic line-clamp-2 mb-2">&ldquo;{visit.event_description}&rdquo;</p>
          )}

          {visit.distance_km != null && (
            <p className="text-xs text-gray-400 mb-2">{visit.distance_km} km away</p>
          )}

          <SlotBar confirmed={visit.confirmed_count} total={visit.volunteer_slots} />

          {/* Bottom row: countdown */}
          <div className="mt-2">
            <CountdownBadge dateStr={visit.visit_date} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">

      {/* Tab bar */}
      {!hideTabs && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {TAB_CONFIG.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => onTabChange?.(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === key ? 'bg-[#0e62ae] text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Browse filters */}
      {activeTab === 'browse' && (meta?.volunteer_location_set || hasAnyLocked) && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          {meta?.volunteer_location_set && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Distance
                </label>
                <span className="text-xs font-semibold text-gray-700">{filterDistance} km</span>
              </div>
              <input
                type="range"
                min={5}
                max={MAX_DISTANCE}
                step={5}
                value={filterDistance}
                onChange={e => setFilterDistance(Number(e.target.value))}
                className="w-full accent-[#0e62ae]"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>5 km</span>
                <span>{MAX_DISTANCE} km</span>
              </div>
            </div>
          )}
          {hasAnyLocked && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterQualifyOnly}
                onChange={e => setFilterQualifyOnly(e.target.checked)}
                className="rounded accent-[#0e62ae]"
              />
              <span className="text-sm text-gray-700">Only show visits I qualify for</span>
            </label>
          )}
        </div>
      )}

      {/* Cards */}
      {currentVisits.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Calendar className="mx-auto mb-4 text-gray-300" size={48} />
          {activeTab === 'browse' ? (
            <>
              <p className="font-medium">No visits available</p>
              <p className="text-sm mt-1">Check back soon — new visits are added regularly.</p>
            </>
          ) : (
            <>
              <p className="font-medium">No upcoming events</p>
              <p className="text-sm mt-1">Browse and sign up for a visit to see it here.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {currentVisits.map(renderCard)}
        </div>
      )}

    </div>
  );
}
