// src/components/admin/AdminVolunteerDetail.tsx
// Volunteer detail view, reached from the Manage Volunteers list.
//
// Four cards: Profile (person + dog), Eligibility (tier, compliance, conditions), Notes, and
// Visit History — with Archive alone at the bottom. An earlier version had seven cards plus a
// stats row and read as sprawl, especially on the lower-resolution displays most PDs use.
//
// Two placement principles, so the layout reads as deliberate:
//   * Controls sit next to the thing they describe, not in a settings dump. Region is in Profile
//     (it's who owns this volunteer), tier is in Eligibility (it's what they're allowed to do),
//     archive is at the bottom (it's destructive).
//   * Compliance is Eligibility, not dog information. The VSC is a record about the person; only
//     the rabies vaccine belongs to the dog, and it just names which dog.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import {
  ArrowLeft, Calendar, Clock, ChevronRight, User, Dog as DogIcon,
  Plus, X, Pencil, Trash2,
} from 'lucide-react';
import { formatCardTime } from '@/utils/timeZone';
import { formatPhoneDisplay } from '@/utils/formatPhone';
import { formatDate } from '@/components/admin/compliance/ComplianceBadge';
import { DocumentModal } from '@/components/admin/compliance/DocumentModal';
import type {
  ComplianceRecord, ComplianceStatus, DogProfile,
} from '@/components/admin/compliance/types';
import { TIER_OPTIONS, type VolunteerTier } from '@/components/admin/volunteerTiers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VolunteerDetail {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  postal_code: string | null;
  physical_address: string | null;
  date_of_birth: string | null;
  pronouns: string | null;
  bio: string | null;
  profile_image: string | null;
  status: string;
  created_at: string;
  archived_at: string | null;
  volunteer_tier: VolunteerTier;
  assigned_region_id: number | null;
  region_assignment_method: string | null;
  region_name: string | null;
}

interface Exclusion {
  group_id: number;
  label: string | null;
  created_at: string;
  created_by_name: string | null;
}

interface VolunteerNote {
  id: number;
  note_text: string;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
}

interface Stats {
  attended: number;
  upcoming: number;
  total_registrations: number;
}

interface VisitRow {
  registration_id: number;
  registration_status: 'confirmed' | 'waitlisted' | 'cancelled';
  waitlist_position: number | null;
  cancellation_reason: string | null;
  admin_note: string | null;
  visit_id: number;
  title: string | null;
  org_name: string | null;
  visit_date: string;
  start_time: string;
  end_time: string;
  address: string;
  visit_status: string;
}

/** The dog row as the endpoint returns it — DogProfile plus the compliance columns. */
interface DogDetail extends DogProfile {
  id: number;
  status: string;
  vaccine_expiry_date: string | null;
}

interface Payload {
  volunteer: VolunteerDetail;
  dog: DogDetail | null;
  compliance: ComplianceRecord;
  exclusions: Exclusion[];
  audience_groups: { id: number; label: string }[];
  notes: VolunteerNote[];
  stats: Stats;
  visits: VisitRow[];
}

interface Region {
  id: number;
  name: string;
  is_active: boolean;
}

interface ActiveAppointment {
  id: number;
  start_time: string;
  status: 'pending' | 'confirmed';
  other_user_name: string;
  dog_name?: string;
}

interface Props {
  volunteerId: string;
  onBack: () => void;
  onSelectVisit: (visitId: number) => void;
  /** Drives who may edit or delete notes: PDs their own, admins anyone's. */
  role?: 'admin' | 'pd';
  /** Passed down from the list, which has already loaded them — saves a duplicate request. */
  regions: Region[];
  /**
   * Keeps the list behind this view in step. Given a patch, the list updates that one row;
   * given nothing, it refetches — which is what document verification needs.
   */
  onVolunteerChanged?: (patch?: Record<string, unknown>) => void;
}

type HistoryFilter = 'all' | 'upcoming' | 'past' | 'cancelled';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateShort(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatStamp(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function RegistrationBadge({ row }: { row: VisitRow }) {
  const config =
    row.registration_status === 'confirmed'
      ? { label: row.visit_status === 'completed' ? 'Attended' : 'Confirmed', classes: 'bg-green-100 text-green-800' }
      : row.registration_status === 'waitlisted'
        ? { label: row.waitlist_position ? `Waitlist #${row.waitlist_position}` : 'Waitlisted', classes: 'bg-amber-100 text-amber-800' }
        : ['cancelled', 'declined'].includes(row.visit_status)
          ? { label: 'Visit cancelled', classes: 'bg-gray-100 text-gray-600' }
          : row.admin_note
            ? { label: 'Removed by PD', classes: 'bg-gray-100 text-gray-600' }
            : { label: 'Withdrew', classes: 'bg-red-100 text-red-700' };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${config.classes}`}>
      {config.label}
    </span>
  );
}

/** One compliance line: what the document is, and where it stands. */
function ComplianceRow({ label, status }: { label: string; status: ComplianceStatus }) {
  const config: Record<ComplianceStatus, { text: string; dot: string; fg: string }> = {
    approved:       { text: 'Approved',      dot: 'bg-green-500', fg: 'text-green-700' },
    pending_review: { text: 'Needs review',  dot: 'bg-amber-500', fg: 'text-amber-700' },
    expiring:       { text: 'Expiring soon', dot: 'bg-amber-400', fg: 'text-amber-700' },
    expired:        { text: 'Expired',       dot: 'bg-red-500',   fg: 'text-red-700' },
    rejected:       { text: 'Rejected',      dot: 'bg-red-500',   fg: 'text-red-700' },
    missing:        { text: 'Missing',       dot: 'bg-red-400',   fg: 'text-red-700' },
  };
  const { text, dot, fg } = config[status];
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-gray-700">{label}</span>
      <span className="inline-flex items-center gap-2 shrink-0">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <span className={`text-sm font-medium ${fg}`}>{text}</span>
      </span>
    </div>
  );
}

const CARD = 'bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-5';
const FIELD_LABEL = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminVolunteerDetail({
  volunteerId, onBack, onSelectVisit, role = 'admin', regions, onVolunteerChanged,
}: Props) {
  const { user: clerkUser } = useUser();

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [docModalOpen, setDocModalOpen] = useState(false);

  // Per-control saving/error state, so one failing control doesn't blank the page.
  const [saving, setSaving] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Conditions are plain flags now — any nuance belongs in a note instead.
  const [addingCondition, setAddingCondition] = useState(false);

  // Notes
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');

  // Archive flow
  const [archiveModal, setArchiveModal] = useState<{ appointments: ActiveAppointment[] } | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/volunteers/${volunteerId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to load volunteer'); return; }
      setData(json);
    } catch {
      setError('Failed to load volunteer');
    } finally {
      setLoading(false);
    }
  }, [volunteerId]);

  useEffect(() => { load(); }, [load]);

  /**
   * Run a mutation and reflect the result. `key` drives the per-control disabled state.
   *
   * Every control here auto-saves, and this used to refetch the entire profile afterwards —
   * volunteer, dog, compliance, conditions, notes, stats and the whole visit history — then ask
   * the list to reload as well. Four round trips for one dropdown change. That's invisible at
   * 15ms and painful at 1.1s, which is what a PD on a slow or distant connection actually sees.
   *
   * So `apply` patches local state from what the server returned, and `listPatch` updates the one
   * row behind this view. Omitting `apply` falls back to the full refetch, which is still the
   * right call where a write changes more than the caller can predict — document verification,
   * for instance.
   */
  const mutate = async (
    key: string,
    run: () => Promise<Response>,
    opts?: {
      apply?: (prev: Payload, json: any) => Payload;
      listPatch?: Record<string, unknown>;
      then?: () => void;
    },
  ) => {
    setSaving(key);
    setActionError(null);
    try {
      const res = await run();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(json.error || 'That didn\'t save. Please try again.');
        return false;
      }
      if (opts?.apply) {
        setData(prev => (prev ? opts.apply!(prev, json) : prev));
      } else {
        await load({ quiet: true });
      }
      onVolunteerChanged?.(opts?.listPatch);
      opts?.then?.();
      return true;
    } catch {
      setActionError('That didn\'t save. Please try again.');
      return false;
    } finally {
      setSaving(null);
    }
  };

  const handleTierChange = (tier: VolunteerTier) =>
    mutate('tier', () => fetch(`/api/admin/volunteers/${volunteerId}/tier`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volunteer_tier: tier }),
    }), {
      apply: prev => ({ ...prev, volunteer: { ...prev.volunteer, volunteer_tier: tier } }),
      listPatch: { volunteer_tier: tier },
    });

  const handleRegionChange = (regionId: number | null) =>
    mutate('region', () => fetch('/api/admin/assign-volunteer-region', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volunteer_id: volunteerId, region_id: regionId }),
    }), {
      apply: prev => ({
        ...prev,
        volunteer: {
          ...prev.volunteer,
          assigned_region_id: regionId,
          // The endpoint always records a hand-picked region as 'manual'.
          region_assignment_method: regionId === null ? null : 'manual',
          region_name: regions.find(r => r.id === regionId)?.name ?? null,
        },
      }),
      listPatch: {
        assigned_region_id: regionId,
        region_assignment_method: regionId === null ? null : 'manual',
      },
    });

  const handleAddExclusion = (groupId: number) =>
    mutate('condition-add', () => fetch(`/api/admin/volunteers/${volunteerId}/exclusions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId }),
    }), {
      apply: (prev, json) => json?.exclusion
        ? { ...prev, exclusions: [...prev.exclusions, json.exclusion] }
        : prev,
      then: () => setAddingCondition(false),
    });

  const handleRemoveExclusion = (groupId: number) =>
    mutate(`condition-${groupId}`, () => fetch(
      `/api/admin/volunteers/${volunteerId}/exclusions?group_id=${groupId}`,
      { method: 'DELETE' },
    ), {
      apply: prev => ({
        ...prev,
        exclusions: prev.exclusions.filter(e => e.group_id !== groupId),
      }),
    });

  const handleAddNote = () => {
    if (!noteDraft.trim()) return;
    return mutate('note', () => fetch(`/api/admin/volunteers/${volunteerId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_text: noteDraft }),
    }), {
      // Newest first, matching the order the endpoint returns them in.
      apply: (prev, json) => json?.note
        ? { ...prev, notes: [json.note, ...prev.notes] }
        : prev,
      then: () => setNoteDraft(''),
    });
  };

  const handleSaveEdit = (noteId: number) => {
    if (!editDraft.trim()) return;
    const text = editDraft.trim();
    return mutate(`note-${noteId}`, () => fetch(
      `/api/admin/volunteers/${volunteerId}/notes/${noteId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_text: text }),
      },
    ), {
      apply: prev => ({
        ...prev,
        notes: prev.notes.map(n => (n.id === noteId ? { ...n, note_text: text } : n)),
      }),
      then: () => { setEditingNoteId(null); setEditDraft(''); },
    });
  };

  const handleDeleteNote = (noteId: number) => {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    return mutate(`note-${noteId}`, () => fetch(
      `/api/admin/volunteers/${volunteerId}/notes/${noteId}`,
      { method: 'DELETE' },
    ), {
      apply: prev => ({ ...prev, notes: prev.notes.filter(n => n.id !== noteId) }),
    });
  };

  /**
   * Archiving is two-step: the API returns requires_confirmation with the active appointments it
   * would cancel, and only proceeds once `confirmed` is sent.
   */
  const handleArchive = async (confirmed: boolean) => {
    setArchiving(true);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/archive-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: volunteerId, ...(confirmed ? { confirmed: true } : {}) }),
      });
      const json = await res.json();

      if (json.requires_confirmation) {
        setArchiveModal({ appointments: json.active_appointments ?? [] });
        return;
      }
      if (!json.success) {
        setActionError(json.error || 'Failed to archive volunteer');
        return;
      }
      setArchiveModal(null);
      onVolunteerChanged?.();
      onBack();
    } catch {
      setActionError('Failed to archive volunteer');
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-4 max-w-3xl mx-auto">
        <div className="flex items-center justify-center py-16 gap-2">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">Loading volunteer…</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 py-4 max-w-3xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium transition mb-5">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error ?? 'Volunteer not found.'}
        </div>
      </div>
    );
  }

  const {
    volunteer: v, dog, compliance, exclusions, notes, stats, visits,
    audience_groups: audienceGroups,
  } = data;
  const fullName = `${v.first_name} ${v.last_name}`;

  const nowIso = new Date().toISOString();
  const filteredVisits = visits.filter(row => {
    if (historyFilter === 'upcoming') {
      return row.registration_status !== 'cancelled'
        && row.end_time > nowIso
        && row.visit_status === 'approved';
    }
    if (historyFilter === 'past') {
      return row.registration_status === 'confirmed'
        && (row.visit_status === 'completed' || row.end_time <= nowIso);
    }
    if (historyFilter === 'cancelled') return row.registration_status === 'cancelled';
    return true;
  });

  const hasAnyDoc = compliance.vsc.document_url || compliance.vaccine.document_url;
  const needsReview = compliance.vsc.verification_status === 'pending_review'
    || compliance.vaccine.verification_status === 'pending_review';
  const availableGroups = audienceGroups.filter(
    g => !exclusions.some(e => e.group_id === g.id)
  );

  /** PDs may only change their own notes; admins may change anyone's. */
  const canChangeNote = (note: VolunteerNote) =>
    role === 'admin' || (!!clerkUser?.id && note.author_id === clerkUser.id);

  return (
    <div className="px-4 py-4 max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium transition mb-5"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* ── Profile: the person, then their dog ── */}
      <div className={CARD}>
        <div className="flex gap-4 items-start mb-5">
          {v.profile_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.profile_image} alt={fullName} className="w-16 h-16 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <User size={28} className="text-blue-300" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
              {v.archived_at && (
                <span className="text-[10px] font-semibold bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded-full">
                  Archived
                </span>
              )}
            </div>
            {v.pronouns && <p className="text-sm text-gray-500 mt-0.5">{v.pronouns}</p>}
            <p className="text-sm text-gray-500 mt-0.5">
              {[v.city, v.postal_code].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <p className={FIELD_LABEL}>Email</p>
            <p className="text-gray-900 wrap-break-word">{v.email || '—'}</p>
          </div>
          <div>
            <p className={FIELD_LABEL}>Phone</p>
            <p className="text-gray-900">{formatPhoneDisplay(v.phone ?? '') || '—'}</p>
          </div>
          <div>
            <p className={FIELD_LABEL}>Date of Birth</p>
            <p className="text-gray-900">{formatDate(v.date_of_birth)}</p>
          </div>
          <div>
            <p className={FIELD_LABEL}>Joined</p>
            <p className="text-gray-900">
              {new Date(v.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
          </div>
          <div>
            <p className={FIELD_LABEL}>Region</p>
            <div className="flex items-center gap-2">
              <select
                value={v.assigned_region_id ?? ''}
                onChange={e => handleRegionChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                disabled={saving === 'region'}
                className="border border-gray-300 rounded pl-2 pr-7 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">— Unassigned —</option>
                {regions.filter(r => r.is_active).map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {v.region_assignment_method && (
                <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
                  {v.region_assignment_method === 'manual' ? 'Manual' : 'Auto'}
                </span>
              )}
            </div>
          </div>
        </div>

        {v.bio && (
          <div className="mt-5">
            <p className={FIELD_LABEL}>Bio</p>
            <p className="text-sm text-gray-900 italic">&ldquo;{v.bio}&rdquo;</p>
          </div>
        )}

        {/* Dog, stacked under the person inside the same card — same team, no card boundary */}
        <div className="mt-5 pt-5 border-t border-gray-200">
          {dog ? (
            <div className="flex gap-4 items-start">
              {dog.dog_picture_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dog.dog_picture_url} alt={dog.dog_name} className="w-24 h-24 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-24 h-24 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                  <DogIcon size={36} className="text-amber-300" />
                </div>
              )}
              <div className="min-w-0 text-sm">
                <p className="font-bold text-gray-900">{dog.dog_name}</p>
                <p className="text-gray-600">
                  {[dog.dog_breed, dog.dog_age ? `${dog.dog_age} yr${dog.dog_age !== 1 ? 's' : ''}` : null]
                    .filter(Boolean).join(' · ') || '—'}
                </p>
                {dog.dog_bio && <p className="text-gray-900 italic mt-1">&ldquo;{dog.dog_bio}&rdquo;</p>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">No dog profile on file.</p>
          )}
        </div>
      </div>

      {/* ── Eligibility: what this team is cleared to do ── */}
      <div className={CARD}>
        <h2 className="text-base font-bold text-gray-900 mb-4">Eligibility</h2>

        <div className="flex items-center gap-3 flex-wrap mb-1">
          <span className="text-sm font-medium text-gray-700">Tier</span>
          <select
            value={v.volunteer_tier}
            onChange={e => handleTierChange(e.target.value as VolunteerTier)}
            disabled={saving === 'tier'}
            className="border border-gray-300 rounded pl-2 pr-7 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            {TIER_OPTIONS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">
            {TIER_OPTIONS.find(t => t.value === v.volunteer_tier)?.hint}
          </span>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <ComplianceRow label="Volunteer Screening Check" status={compliance.vsc.status} />
          <ComplianceRow
            label={`Rabies vaccine${compliance.vaccine.dog_name ? ` — ${compliance.vaccine.dog_name}` : ''}`}
            status={compliance.vaccine.status}
          />
          {hasAnyDoc && (
            <button
              onClick={() => setDocModalOpen(true)}
              className={`mt-2 text-sm font-semibold rounded-lg px-4 py-1.5 transition ${
                needsReview
                  ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
                  : 'bg-blue-50 text-[#0e62ae] border border-blue-200 hover:bg-blue-100'
              }`}
            >
              {needsReview ? 'Review Documents' : 'View Documents'}
            </button>
          )}
        </div>

        {/* Conditions. Most volunteers have none, so this stays near-invisible when empty —
            a quiet add link rather than a section with a heading and an empty state. */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          {exclusions.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {exclusions.map(e => (
                <span
                  key={e.group_id}
                  title={`Set by ${e.created_by_name ?? 'unknown'} on ${formatDate(e.created_at.slice(0, 10))}`}
                  className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-2 py-1 rounded-full"
                >
                  Not suitable for {e.label ?? 'unknown group'}
                  <button
                    onClick={() => handleRemoveExclusion(e.group_id)}
                    disabled={saving === `condition-${e.group_id}`}
                    title="Remove this condition"
                    className="text-red-400 hover:text-red-700 transition disabled:opacity-40"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {addingCondition && availableGroups.length > 0 ? (
            <div className="flex items-center gap-2 flex-wrap">
              {availableGroups.map(g => (
                <button
                  key={g.id}
                  onClick={() => handleAddExclusion(g.id)}
                  disabled={saving === 'condition-add'}
                  className="text-xs font-semibold border border-gray-300 text-gray-700 px-2 py-1 rounded-full hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Not suitable for {g.label}
                </button>
              ))}
              <button
                onClick={() => setAddingCondition(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          ) : availableGroups.length > 0 && (
            <button
              onClick={() => setAddingCondition(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 transition"
            >
              <Plus size={12} /> Add visit condition
            </button>
          )}
        </div>

        {actionError && <p className="text-xs text-red-600 mt-3">{actionError}</p>}
      </div>

      {/* ── Notes ── */}
      <div className={CARD}>
        <h2 className="text-base font-bold text-gray-900 mb-1">Notes</h2>
        <p className="text-xs text-gray-500 mb-4">
          Internal only — not visible to the volunteer.
        </p>

        <div className="mb-5">
          <textarea
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            placeholder="What you observed, what was agreed, anything the next PD should know."
            rows={3}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={handleAddNote}
              disabled={!noteDraft.trim() || saving === 'note'}
              className="px-4 py-1.5 bg-[#0e62ae] text-white text-sm font-semibold rounded hover:bg-[#0a4e8a] transition disabled:opacity-50"
            >
              {saving === 'note' ? 'Saving…' : 'Add Note'}
            </button>
          </div>
        </div>

        {notes.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No notes yet.</p>
        ) : (
          <div className="space-y-4">
            {notes.map(n => (
              <div key={n.id} className="border-l-2 border-gray-200 pl-3">
                {editingNoteId === n.id ? (
                  <>
                    <textarea
                      value={editDraft}
                      onChange={e => setEditDraft(e.target.value)}
                      rows={3}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleSaveEdit(n.id)}
                        disabled={!editDraft.trim() || saving === `note-${n.id}`}
                        className="px-3 py-1 bg-[#0e62ae] text-white text-xs font-semibold rounded hover:bg-[#0a4e8a] transition disabled:opacity-50"
                      >
                        {saving === `note-${n.id}` ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setEditingNoteId(null); setEditDraft(''); }}
                        className="px-3 py-1 text-xs font-semibold text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{n.note_text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[11px] text-gray-400">
                        {n.author_name ?? 'Unknown'} · {formatStamp(n.created_at)}
                      </p>
                      {canChangeNote(n) && (
                        <>
                          <button
                            onClick={() => { setEditingNoteId(n.id); setEditDraft(n.note_text); }}
                            title="Edit note"
                            className="text-gray-300 hover:text-gray-600 transition"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteNote(n.id)}
                            disabled={saving === `note-${n.id}`}
                            title="Delete note"
                            className="text-gray-300 hover:text-red-600 transition disabled:opacity-40"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Visit history: last, because it's the only unbounded section ── */}
      <div className={CARD}>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="text-base font-bold text-gray-900">Visit History</h2>
          <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden">
            {(['all', 'upcoming', 'past', 'cancelled'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setHistoryFilter(tab)}
                className={`px-3 py-1.5 text-xs font-semibold transition-all border-r border-gray-200 last:border-r-0 ${
                  historyFilter === tab
                    ? 'bg-[#0e62ae] text-white'
                    : 'bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredVisits.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Calendar className="mx-auto mb-3 text-gray-300" size={36} />
            <p className="font-medium">
              {historyFilter === 'all' ? 'No visits yet' : `No ${historyFilter} visits`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredVisits.map(row => (
              <div
                key={row.registration_id}
                onClick={() => onSelectVisit(row.visit_id)}
                className="border border-gray-100 rounded-xl p-4 cursor-pointer transition-all group hover:border-blue-200 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <RegistrationBadge row={row} />
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 shrink-0 transition-colors" />
                </div>

                <p className="text-sm font-semibold text-gray-900 mb-0.5">
                  {row.title || row.org_name || 'Therapy Dog Visit'}
                </p>
                {row.org_name && row.title && (
                  <p className="text-xs text-gray-500 mb-1">{row.org_name}</p>
                )}

                <div className="flex items-center gap-4 text-sm text-gray-600 mb-1">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-gray-400" />
                    {formatDateShort(row.visit_date)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock size={13} className="text-gray-400" />
                    {formatCardTime(row.start_time)} – {formatCardTime(row.end_time)}
                  </span>
                </div>

                <p className="text-xs text-gray-500 truncate">{row.address}</p>

                {row.registration_status === 'cancelled' && (row.cancellation_reason || row.admin_note) && (
                  <p className="text-xs text-gray-500 italic mt-2 border-l-2 border-gray-200 pl-2">
                    {row.cancellation_reason || row.admin_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {visits.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-6 text-xs text-gray-500">
            <span>{stats.attended} attended</span>
            <span>{stats.upcoming} upcoming</span>
            <span>{stats.total_registrations} total sign-ups</span>
          </div>
        )}
      </div>

      {/* ── Archive, alone at the bottom ── */}
      {!v.archived_at && (
        <div className="flex justify-end mb-6">
          <button
            onClick={() => handleArchive(false)}
            disabled={archiving}
            className="px-4 py-1.5 border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition disabled:opacity-50"
          >
            {archiving && !archiveModal ? 'Checking…' : 'Archive Volunteer'}
          </button>
        </div>
      )}

      {docModalOpen && (
        <DocumentModal
          volunteerId={v.id}
          volunteerName={fullName}
          record={compliance}
          dog={dog}
          onClose={() => setDocModalOpen(false)}
          onVerified={() => { load({ quiet: true }); onVolunteerChanged?.(); }}
        />
      )}

      {/* Archive confirmation. Only shown once the API has reported what it would cancel. */}
      {archiveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            {archiveModal.appointments.length === 0 ? (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Archive Volunteer</h3>
                <p className="text-sm text-gray-700 mb-2">
                  Archive <span className="font-semibold">{fullName}</span>?
                </p>
                <p className="text-sm text-gray-600 mb-6">
                  They will no longer be able to sign in or register for visits. Their history is kept
                  and the account can be restored from the Archived tab.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {archiveModal.appointments.length} active appointment{archiveModal.appointments.length !== 1 ? 's' : ''} will be cancelled
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Archiving {fullName} will automatically cancel the following, and the other parties
                  will be emailed:
                </p>
                <ul className="space-y-1.5 mb-5 ml-1">
                  {archiveModal.appointments.map(appt => (
                    <li key={appt.id} className="text-sm text-gray-700">
                      • {new Date(appt.start_time).toLocaleString()} with{' '}
                      <span className="font-medium">{appt.other_user_name}</span>
                      {appt.dog_name && <span className="text-gray-500"> ({appt.dog_name})</span>}
                      <span className={`ml-2 text-xs font-semibold ${appt.status === 'confirmed' ? 'text-red-700' : 'text-orange-700'}`}>
                        {appt.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {actionError && <p className="text-sm text-red-600 mb-4">{actionError}</p>}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setArchiveModal(null); setActionError(null); }}
                disabled={archiving}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleArchive(true)}
                disabled={archiving}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md disabled:opacity-50"
              >
                {archiving
                  ? 'Archiving…'
                  : archiveModal.appointments.length > 0 ? 'Archive & Cancel' : 'Archive Volunteer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
