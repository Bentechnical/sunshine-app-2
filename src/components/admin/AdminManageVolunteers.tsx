// src/components/admin/AdminManageVolunteers.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DogProfile {
  dog_name: string;
  dog_breed: string;
  dog_bio: string;
  dog_picture_url: string;
  dog_age?: number;
}

interface Region {
  id: number;
  name: string;
  is_active: boolean;
  owner_pd_id: string | null;
}

interface Volunteer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  postal_code: string;
  travel_distance_km: number;
  bio: string;
  profile_picture_url: string;
  dog?: DogProfile | null;
  audience_categories: string[];
  is_browsable: boolean;
  assigned_region_id: number | null;
  region_assignment_method: string | null;
}

type ComplianceStatus = 'missing' | 'pending_review' | 'approved' | 'expiring' | 'expired' | 'rejected';

interface ComplianceRecord {
  vsc: { status: ComplianceStatus; date_issued: string | null; renewal_due: string | null; document_url: string | null; verification_status: string | null; verified_at: string | null; verified_by: string | null };
  vaccine: { status: ComplianceStatus; date_issued: string | null; expiry_date: string | null; dog_name: string | null; document_url: string | null; verification_status: string | null; verified_at: string | null; verified_by: string | null };
}

type SignedDocs = { vsc_signed_url: string | null; vaccine_signed_url: string | null; dog_name: string | null };

interface ArchivedVolunteer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  archived_at: string;
}

interface ActiveAppointment {
  id: number;
  start_time: string;
  status: 'pending' | 'confirmed';
  other_user_name: string;
  dog_name?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const allCategories = ['Young Kids', 'Teens/Young Adults', 'Adults', 'Seniors'];

const statusConfig: Record<ComplianceStatus, { label: string; classes: string }> = {
  missing:        { label: 'Missing',       classes: 'bg-red-100 text-red-700' },
  pending_review: { label: 'Needs Review',  classes: 'bg-amber-100 text-amber-800' },
  approved:       { label: 'Compliant',     classes: 'bg-green-100 text-green-700' },
  expiring:       { label: 'Expiring Soon', classes: 'bg-amber-100 text-amber-700' },
  expired:        { label: 'Expired',       classes: 'bg-red-100 text-red-800' },
  rejected:       { label: 'Rejected',      classes: 'bg-red-100 text-red-700' },
};

function ComplianceBadge({ status }: { status: ComplianceStatus | undefined }) {
  if (!status) return <span className="text-xs text-gray-400">—</span>;
  const { label, classes } = statusConfig[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${classes}`}>
      {label}
    </span>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ─── Document Review Modal ────────────────────────────────────────────────────

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function VerificationActions({
  volunteerId,
  documentType,
  currentStatus,
  verifiedAt,
  onVerified,
}: {
  volunteerId: string;
  documentType: 'vsc' | 'vaccine';
  currentStatus: string | null;
  verifiedAt: string | null;
  onVerified: (newStatus: 'approved' | 'rejected') => void;
}) {
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = async (action: 'approve' | 'reject') => {
    setActing(action);
    setActionError(null);
    const apiAction = action === 'approve'
      ? (documentType === 'vsc' ? 'approve_vsc' : 'approve_vaccine')
      : (documentType === 'vsc' ? 'reject_vsc' : 'reject_vaccine');
    try {
      const res = await fetch(`/api/admin/compliance/${volunteerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: apiAction }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || 'Action failed'); return; }
      onVerified(action === 'approve' ? 'approved' : 'rejected');
    } catch {
      setActionError('Action failed. Please try again.');
    } finally {
      setActing(null);
    }
  };

  const statusLabel = currentStatus === 'approved' ? 'Approved' : currentStatus === 'rejected' ? 'Rejected' : 'Pending Review';
  const statusClasses = currentStatus === 'approved' ? 'bg-green-100 text-green-700' : currentStatus === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusClasses}`}>{statusLabel}</span>
        {currentStatus === 'approved' && verifiedAt && (
          <span className="text-xs text-gray-400">Verified {formatDateTime(verifiedAt)}</span>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={() => handleAction('approve')} disabled={!!acting}
          className="flex-1 px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
          {acting === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button onClick={() => handleAction('reject')} disabled={!!acting}
          className="flex-1 px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition">
          {acting === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
      {actionError && <p className="text-xs text-red-600">{actionError}</p>}
    </div>
  );
}

function DocumentModal({
  volunteerId,
  volunteerName,
  record,
  prefetchedDocs,
  onClose,
  onVerified,
}: {
  volunteerId: string;
  volunteerName: string;
  record: ComplianceRecord;
  prefetchedDocs?: SignedDocs | null;
  onClose: () => void;
  onVerified: (updated: ComplianceRecord) => void;
}) {
  const [loading, setLoading] = useState(!prefetchedDocs);
  const [docs, setDocs] = useState<SignedDocs | null>(prefetchedDocs ?? null);
  const [error, setError] = useState<string | null>(null);
  const [localRecord, setLocalRecord] = useState(record);

  const vscHasDoc = !!(docs?.vsc_signed_url);
  const vaccineHasDoc = !!(docs?.vaccine_signed_url);
  const showTabs = vscHasDoc && vaccineHasDoc;
  const defaultTab = record.vsc.verification_status === 'pending_review' && record.vsc.document_url ? 'vsc' : 'vaccine';
  const [activeTab, setActiveTab] = useState<'vsc' | 'vaccine'>(defaultTab);

  useEffect(() => {
    if (prefetchedDocs) return;
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/admin/compliance/${volunteerId}/documents`);
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to load documents'); return; }
        setDocs(json.documents ? { ...json.documents, dog_name: json.dog_name } : null);
      } catch {
        setError('Failed to load documents');
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, [volunteerId, prefetchedDocs]);

  const handleVscVerified = (newStatus: 'approved' | 'rejected') => {
    const updated = { ...localRecord, vsc: { ...localRecord.vsc, verification_status: newStatus, verified_at: new Date().toISOString() } };
    setLocalRecord(updated);
    onVerified(updated);
  };

  const handleVaccineVerified = (newStatus: 'approved' | 'rejected') => {
    const updated = { ...localRecord, vaccine: { ...localRecord.vaccine, verification_status: newStatus, verified_at: new Date().toISOString() } };
    setLocalRecord(updated);
    onVerified(updated);
  };

  const rawUrl = docs ? (activeTab === 'vsc' ? docs.vsc_signed_url : docs.vaccine_signed_url) : null;
  const activeUrl = rawUrl ? `${rawUrl}#toolbar=0&navpanes=0` : null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 pl-70">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden" style={{ height: '85vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{volunteerName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Review compliance documents and approve or reject submissions</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-6">&times;</button>
        </div>

        {/* Tabs */}
        {!loading && !error && showTabs && (
          <div className="flex border-b border-gray-100 px-6 shrink-0">
            {(['vsc', 'vaccine'] as const).map(tab => {
              const isPending = tab === 'vsc'
                ? localRecord.vsc.verification_status === 'pending_review'
                : localRecord.vaccine.verification_status === 'pending_review';
              const label = tab === 'vsc' ? 'VSC Document' : `Rabies Vaccine${docs?.dog_name ? ` — ${docs.dog_name}` : ''}`;
              return (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${activeTab === tab ? 'border-[#0e62ae] text-[#0e62ae]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {label}
                  {isPending && <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Needs Review</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        {loading && (
          <div className="flex-1 flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600">Loading document…</span>
          </div>
        )}
        {error && <div className="flex-1 flex items-center justify-center"><p className="text-sm text-red-600">{error}</p></div>}

        {!loading && !error && docs && (
          <div className="flex flex-1 min-h-0">
            {/* Document preview */}
            <div className="flex-1 bg-gray-100 min-h-0">
              {activeUrl ? (
                <iframe key={activeUrl} src={activeUrl} className="w-full h-full border-0" title="Compliance document preview" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-sm text-gray-400 italic">No document uploaded</p>
                </div>
              )}
            </div>

            {/* Metadata + actions */}
            <div className="w-72 shrink-0 border-l border-gray-100 flex flex-col p-5 overflow-y-auto">
              {!showTabs && (
                <p className="text-sm font-bold text-gray-800 mb-4">
                  {activeTab === 'vsc' ? 'Volunteer Screening Check' : `Rabies Vaccine Record${docs.dog_name ? ` — ${docs.dog_name}` : ''}`}
                </p>
              )}
              {activeTab === 'vsc' && (
                <div className="space-y-4 mb-6">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Date Issued</p>
                    <p className="text-sm text-gray-900">{formatDate(localRecord.vsc.date_issued)}</p>
                  </div>
                  {localRecord.vsc.renewal_due && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Renewal Due</p>
                      <p className="text-sm text-gray-900">{formatDate(localRecord.vsc.renewal_due)}</p>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'vaccine' && (
                <div className="space-y-4 mb-6">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Date Issued</p>
                    <p className="text-sm text-gray-900">{formatDate(localRecord.vaccine.date_issued)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Expiry Date</p>
                    <p className="text-sm text-gray-900">{formatDate(localRecord.vaccine.expiry_date)}</p>
                  </div>
                </div>
              )}
              <div className="mt-auto space-y-3">
                {activeTab === 'vsc' && docs.vsc_signed_url && (
                  <VerificationActions volunteerId={volunteerId} documentType="vsc"
                    currentStatus={localRecord.vsc.verification_status} verifiedAt={localRecord.vsc.verified_at}
                    onVerified={handleVscVerified} />
                )}
                {activeTab === 'vaccine' && docs.vaccine_signed_url && (
                  <VerificationActions volunteerId={volunteerId} documentType="vaccine"
                    currentStatus={localRecord.vaccine.verification_status} verifiedAt={localRecord.vaccine.verified_at}
                    onVerified={handleVaccineVerified} />
                )}
                <p className="text-xs text-gray-400">Document links expire after 1 hour.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  role?: 'admin' | 'pd';
}

export default function AdminManageVolunteers({ role = 'admin' }: Props) {
  const { user: clerkUser } = useUser();
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [complianceMap, setComplianceMap] = useState<Map<string, ComplianceRecord>>(new Map());
  const [archivedVolunteers, setArchivedVolunteers] = useState<ArchivedVolunteer[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const regionFilterInitialized = React.useRef(false);
  const [loading, setLoading] = useState(true);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('all'); // 'all' | 'unassigned' | region id
  const [complianceFilter, setComplianceFilter] = useState<'none' | 'review' | 'issues'>('none');
  const [selectedDocVolunteer, setSelectedDocVolunteer] = useState<{ id: string; name: string; record: ComplianceRecord } | null>(null);
  const [signedUrlCache, setSignedUrlCache] = useState<Map<string, SignedDocs>>(new Map());
  const [reassigningId, setReassigningId] = useState<string | null>(null);

  // Archive modal
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [userToArchive, setUserToArchive] = useState<{ id: string; name: string } | null>(null);
  const [archiveWarning, setArchiveWarning] = useState<{ appointments: ActiveAppointment[] } | null>(null);
  const [archiving, setArchiving] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [usersRes, complianceRes, regionsRes] = await Promise.all([
          fetch('/api/admin/approved-users'),
          fetch('/api/admin/compliance'),
          fetch('/api/admin/regions'),
        ]);
        const [usersJson, complianceJson, regionsJson] = await Promise.all([
          usersRes.json(),
          complianceRes.json(),
          regionsRes.json(),
        ]);

        if (!usersRes.ok) {
          setError(usersJson.error || 'Failed to load volunteers');
          return;
        }

        const sorted: Volunteer[] = usersJson.users
          .filter((u: any) => u.role === 'volunteer')
          .map((u: any) => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            phone: u.phone_number,
            city: u.city,
            postal_code: u.postal_code,
            travel_distance_km: u.travel_distance_km,
            bio: u.bio,
            profile_picture_url: u.profile_image,
            dog: u.dogs ? {
              dog_name: u.dogs.dog_name,
              dog_breed: u.dogs.dog_breed,
              dog_bio: u.dogs.dog_bio,
              dog_picture_url: u.dogs.dog_picture_url,
              dog_age: u.dogs.dog_age,
            } : null,
            audience_categories: u.audience_categories || [],
            is_browsable: u.is_browsable ?? true,
            assigned_region_id: u.assigned_region_id ?? null,
            region_assignment_method: u.region_assignment_method ?? null,
          }))
          .sort((a: Volunteer, b: Volunteer) => a.last_name.localeCompare(b.last_name));

        setVolunteers(sorted);
        if (regionsRes.ok && regionsJson.regions) {
          setRegions(regionsJson.regions);
        }

        if (complianceRes.ok && complianceJson.volunteers) {
          const map = new Map<string, ComplianceRecord>();
          for (const v of complianceJson.volunteers) {
            map.set(v.id, { vsc: v.vsc, vaccine: v.vaccine });
          }
          setComplianceMap(map);
        }
      } catch (err) {
        console.error('[AdminManageVolunteers] Error:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Pre-fetch signed URLs for pending_review volunteers in the background
  useEffect(() => {
    const pending = Array.from(complianceMap.entries()).filter(([, c]) =>
      c.vsc.verification_status === 'pending_review' || c.vaccine.verification_status === 'pending_review'
    );
    if (pending.length === 0) return;
    pending.forEach(async ([id]) => {
      if (signedUrlCache.has(id)) return;
      try {
        const res = await fetch(`/api/admin/compliance/${id}/documents`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.documents) {
          setSignedUrlCache(prev => new Map(prev).set(id, { ...json.documents, dog_name: json.dog_name }));
        }
      } catch { /* non-fatal */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complianceMap]);

  useEffect(() => {
    if (viewMode !== 'archived') return;
    const fetchArchived = async () => {
      setArchivedLoading(true);
      try {
        const res = await fetch('/api/admin/archived-users');
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to load archived users'); return; }
        const filtered: ArchivedVolunteer[] = json.users
          .filter((u: any) => u.role === 'volunteer')
          .map((u: any) => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            phone: u.phone_number,
            city: u.city,
            archived_at: u.archived_at,
          }))
          .sort((a: ArchivedVolunteer, b: ArchivedVolunteer) =>
            new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime()
          );
        setArchivedVolunteers(filtered);
      } catch (err) {
        console.error('[AdminManageVolunteers] Error fetching archived:', err);
      } finally {
        setArchivedLoading(false);
      }
    };
    fetchArchived();
  }, [viewMode]);

  // ── Archive handlers ──────────────────────────────────────────────────────────

  const handleArchiveUser = async (userId: string, userName: string) => {
    setUserToArchive({ id: userId, name: userName });
    setArchiving(false);
    try {
      const res = await fetch('/api/admin/archive-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const result = await res.json();
      if (result.requires_confirmation) {
        setArchiveWarning({ appointments: result.active_appointments });
        setArchiveModalOpen(true);
      } else if (result.success) {
        setVolunteers(prev => prev.filter(u => u.id !== userId));
        alert('Volunteer archived successfully');
      } else {
        alert(`Failed to archive: ${result.error}`);
      }
    } catch {
      alert('Failed to archive volunteer');
    }
  };

  const confirmArchive = async () => {
    if (!userToArchive) return;
    setArchiving(true);
    try {
      const res = await fetch('/api/admin/archive-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userToArchive.id, confirmed: true }),
      });
      const result = await res.json();
      if (result.success) {
        setVolunteers(prev => prev.filter(u => u.id !== userToArchive.id));
        setArchiveModalOpen(false);
        setUserToArchive(null);
        setArchiveWarning(null);
      } else {
        alert(`Failed to archive: ${result.error}`);
      }
    } catch {
      alert('Failed to archive volunteer');
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchiveUser = async (userId: string, userName: string) => {
    if (!confirm(`Restore ${userName}'s account? They will be able to access the platform again.`)) return;
    try {
      const res = await fetch('/api/admin/unarchive-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const result = await res.json();
      if (result.success) {
        setArchivedVolunteers(prev => prev.filter(u => u.id !== userId));
        alert('Volunteer unarchived successfully');
      } else {
        alert(`Failed to unarchive: ${result.error}`);
      }
    } catch {
      alert('Failed to unarchive volunteer');
    }
  };

  // ── Other handlers ────────────────────────────────────────────────────────────

  const toggleExpand = (userId: string) => {
    setExpandedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const updateAudience = async (userId: string, newCategories: string[]) => {
    const res = await fetch('/api/admin/update-audience-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role: 'volunteer', category_labels: newCategories }),
    });
    if (!res.ok) console.error('Failed to update audience prefs');
  };

  const handleCheckboxChange = (userId: string, label: string, current: string[]) => {
    const newCategories = current.includes(label)
      ? current.filter(c => c !== label)
      : [...current, label];
    updateAudience(userId, newCategories);
    setVolunteers(prev => prev.map(u => u.id === userId ? { ...u, audience_categories: newCategories } : u));
  };

  const handleToggleBrowsable = async (userId: string, current: boolean) => {
    setVolunteers(prev => prev.map(u => u.id === userId ? { ...u, is_browsable: !current } : u));
    const res = await fetch('/api/admin/set-browsable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, is_browsable: !current }),
    });
    if (!res.ok) {
      setVolunteers(prev => prev.map(u => u.id === userId ? { ...u, is_browsable: current } : u));
      alert('Failed to update visibility');
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────────

  const hasComplianceIssue = (volunteerId: string) => {
    const c = complianceMap.get(volunteerId);
    if (!c) return false;
    return ['missing', 'expiring', 'expired'].includes(c.vsc.status) ||
           ['missing', 'expiring', 'expired'].includes(c.vaccine.status);
  };

  const hasNeedsReview = (volunteerId: string) => {
    const c = complianceMap.get(volunteerId);
    if (!c) return false;
    return c.vsc.status === 'pending_review' || c.vaccine.status === 'pending_review';
  };

  const issueCount = volunteers.filter(v => hasComplianceIssue(v.id)).length;
  const reviewCount = volunteers.filter(v => hasNeedsReview(v.id)).length;

  const handleReassignRegion = async (volunteerId: string, newRegionId: number | null) => {
    setReassigningId(volunteerId);
    try {
      const res = await fetch('/api/admin/assign-volunteer-region', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volunteer_id: volunteerId, region_id: newRegionId }),
      });
      if (!res.ok) { alert('Failed to update region'); return; }
      setVolunteers(prev => prev.map(v =>
        v.id === volunteerId
          ? { ...v, assigned_region_id: newRegionId, region_assignment_method: 'manual' }
          : v
      ));
    } catch {
      alert('Failed to update region');
    } finally {
      setReassigningId(null);
    }
  };

  // For PD: default region filter to their region once regions load
  React.useEffect(() => {
    if (role !== 'pd' || !clerkUser?.id || regions.length === 0 || regionFilterInitialized.current) return;
    const myRegion = regions.find(r => r.is_active && r.owner_pd_id === clerkUser.id);
    if (myRegion) setRegionFilter(String(myRegion.id));
    regionFilterInitialized.current = true;
  }, [regions, clerkUser?.id, role]);

  const filteredVolunteers = volunteers.filter(v => {
    const matchesSearch = `${v.first_name} ${v.last_name} ${v.email} ${v.city}`
      .toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCompliance =
      complianceFilter === 'none' ? true :
      complianceFilter === 'review' ? hasNeedsReview(v.id) :
      hasComplianceIssue(v.id);
    const matchesRegion =
      regionFilter === 'all' ? true :
      regionFilter === 'unassigned' ? v.assigned_region_id === null :
      v.assigned_region_id === parseInt(regionFilter, 10);
    return matchesSearch && matchesCompliance && matchesRegion;
  });

  const filteredArchived = archivedVolunteers.filter(v =>
    `${v.first_name} ${v.last_name} ${v.email} ${v.city}`
      .toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderCategoryBubbles = (categories: string[]) => {
    const sorted = [...categories].sort((a, b) => allCategories.indexOf(a) - allCategories.indexOf(b));
    return (
      <div className="flex flex-wrap gap-1">
        {sorted.map(label => (
          <span key={label} className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">
            {label}
          </span>
        ))}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-4">
      {/* Compliance Alert Banner */}
      {!loading && viewMode === 'active' && (reviewCount > 0 || issueCount > 0) && (
        <div className="mb-4 flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Compliance</span>
          <div className="flex items-center gap-2 flex-wrap">
            {reviewCount > 0 && (
              <button
                onClick={() => setComplianceFilter(f => f === 'review' ? 'none' : 'review')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${
                  complianceFilter === 'review'
                    ? 'bg-amber-500 text-white'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                {reviewCount} awaiting review
              </button>
            )}
            {issueCount > 0 && (
              <button
                onClick={() => setComplianceFilter(f => f === 'issues' ? 'none' : 'issues')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${
                  complianceFilter === 'issues'
                    ? 'bg-red-500 text-white'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                {issueCount} missing/expired
              </button>
            )}
          </div>
          {complianceFilter !== 'none' && (
            <button
              onClick={() => setComplianceFilter('none')}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600 font-medium"
            >
              Show all
            </button>
          )}
        </div>
      )}
      {!loading && viewMode === 'active' && issueCount === 0 && volunteers.length > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle size={18} className="text-green-600 shrink-0" />
          <p className="text-sm text-green-800 font-medium">All volunteers are compliant.</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setViewMode('active')}
              className={`px-4 py-2 rounded text-sm font-semibold transition ${
                viewMode === 'active' ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800'
              }`}
            >
              Active Volunteers
            </button>
            <button
              onClick={() => setViewMode('archived')}
              className={`px-4 py-2 rounded text-sm font-semibold transition ${
                viewMode === 'archived' ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-800'
              }`}
            >
              Archived
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={regionFilter}
              onChange={e => setRegionFilter(e.target.value)}
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm"
            >
              <option value="all">All Regions</option>
              <option value="unassigned">Unassigned</option>
              {regions.filter(r => r.is_active).map(r => (
                <option key={r.id} value={String(r.id)}>{r.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm w-48"
            />
          </div>
        </div>

        {/* Loading */}
        {(loading || (viewMode === 'archived' && archivedLoading)) && (
          <div className="flex items-center justify-center py-12 gap-2">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-600">Loading volunteers...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>
        )}

        {/* Active Volunteers Table */}
        {!loading && !error && viewMode === 'active' && (
          <table className="w-full text-sm border border-gray-200 rounded-md">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2">Region</th>
                <th className="px-4 py-2">VSC</th>
                <th className="px-4 py-2">Vaccine</th>
                <th className="px-4 py-2">Audience</th>
                <th className="px-2 py-2 w-6" />
              </tr>
            </thead>
            <tbody>
              {filteredVolunteers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    {complianceFilter !== 'none' ? 'No volunteers match this filter.' : 'No volunteers found.'}
                  </td>
                </tr>
              ) : filteredVolunteers.map(user => {
                const isExpanded = expandedUserIds.includes(user.id);
                const compliance = complianceMap.get(user.id);
                const rowHasIssue = hasComplianceIssue(user.id);
                return (
                  <React.Fragment key={user.id}>
                    <tr
                      className={`border-t hover:bg-gray-50 cursor-pointer ${rowHasIssue ? 'bg-red-50/30' : ''}`}
                      onClick={() => toggleExpand(user.id)}
                    >
                      <td className="px-4 py-2">{user.first_name} {user.last_name}</td>
                      <td className="px-4 py-2">{user.email}</td>
                      <td className="px-4 py-2">{user.city}</td>
                      <td className="px-4 py-2">
                        {user.assigned_region_id
                          ? <span className="text-sm text-gray-800">{regions.find(r => r.id === user.assigned_region_id)?.name ?? '—'}</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Unassigned</span>
                        }
                      </td>
                      <td className="px-4 py-2"><ComplianceBadge status={compliance?.vsc.status} /></td>
                      <td className="px-4 py-2"><ComplianceBadge status={compliance?.vaccine.status} /></td>
                      <td className="px-4 py-2">{renderCategoryBubbles(user.audience_categories)}</td>
                      <td className="px-2 py-2">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50 border-t">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="flex flex-col lg:flex-row gap-6">
                            {/* Volunteer info */}
                            <div className="flex gap-4 items-start w-full lg:w-1/2">
                              <img
                                src={user.profile_picture_url}
                                alt={`${user.first_name} ${user.last_name}`}
                                className="w-28 h-28 object-cover rounded-lg"
                              />
                              <div className="space-y-3">
                                <h3 className="text-lg font-semibold text-gray-900">Volunteer Information</h3>
                                <div className="space-y-2 text-sm">
                                  <p><span className="font-semibold text-gray-700">Phone:</span> <span className="text-gray-900">{user.phone}</span></p>
                                  <p><span className="font-semibold text-gray-700">Postal Code:</span> <span className="text-gray-900">{user.postal_code}</span></p>
                                  <p><span className="font-semibold text-gray-700">Travel Distance:</span> <span className="text-gray-900">{user.travel_distance_km} km</span></p>
                                  <p><span className="font-semibold text-gray-700">Bio:</span></p>
                                  <p className="text-gray-900 italic">&ldquo;{user.bio}&rdquo;</p>
                                </div>
                              </div>
                            </div>
                            {/* Dog info */}
                            {user.dog && (
                              <div className="flex gap-4 items-start w-full lg:w-1/2">
                                <img
                                  src={user.dog.dog_picture_url}
                                  alt={user.dog.dog_name}
                                  className="w-28 h-28 object-cover rounded-lg"
                                />
                                <div className="space-y-3">
                                  <h3 className="text-lg font-semibold text-gray-900">Dog Information</h3>
                                  <div className="space-y-2 text-sm">
                                    <p><span className="font-semibold text-gray-700">Name:</span> <span className="text-gray-900">{user.dog.dog_name}</span></p>
                                    <p><span className="font-semibold text-gray-700">Breed:</span> <span className="text-gray-900">{user.dog.dog_breed}</span></p>
                                    {user.dog.dog_age && <p><span className="font-semibold text-gray-700">Age:</span> <span className="text-gray-900">{user.dog.dog_age} years</span></p>}
                                    <p><span className="font-semibold text-gray-700">Bio:</span></p>
                                    <p className="text-gray-900 italic">&ldquo;{user.dog.dog_bio}&rdquo;</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Compliance detail */}
                          {compliance && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Compliance Documents</h4>
                                <button
                                  onClick={e => { e.stopPropagation(); setSelectedDocVolunteer({ id: user.id, name: `${user.first_name} ${user.last_name}`, record: compliance }); }}
                                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition ${
                                    compliance.vsc.verification_status === 'pending_review' || compliance.vaccine.verification_status === 'pending_review'
                                      ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                      : 'text-blue-600 hover:underline'
                                  }`}
                                >
                                  {compliance.vsc.verification_status === 'pending_review' || compliance.vaccine.verification_status === 'pending_review' ? 'Review' : 'View Docs'}
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="font-medium text-gray-600 mb-1">VSC</p>
                                  <ComplianceBadge status={compliance.vsc.status} />
                                  {compliance.vsc.date_issued && (
                                    <p className="text-xs text-gray-500 mt-1">Issued: {formatDate(compliance.vsc.date_issued)}</p>
                                  )}
                                  {compliance.vsc.renewal_due && (
                                    <p className="text-xs text-gray-500">Renewal due: {formatDate(compliance.vsc.renewal_due)}</p>
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-gray-600 mb-1">
                                    Vaccine Record{compliance.vaccine.dog_name ? ` — ${compliance.vaccine.dog_name}` : ''}
                                  </p>
                                  <ComplianceBadge status={compliance.vaccine.status} />
                                  {compliance.vaccine.expiry_date && (
                                    <p className="text-xs text-gray-500 mt-1">Expires: {formatDate(compliance.vaccine.expiry_date)}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Audience Preferences */}
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Audience Preferences</h4>
                            <div className="flex flex-wrap items-center gap-4">
                              {allCategories.map(label => (
                                <label key={label} className="flex items-center gap-1 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={user.audience_categories.includes(label)}
                                    onChange={() => handleCheckboxChange(user.id, label, user.audience_categories)}
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Admin Controls */}
                          <div className="mt-6 pt-4 border-t border-gray-200 space-y-3">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-gray-700 shrink-0">Region:</span>
                              <select
                                value={user.assigned_region_id ?? ''}
                                onChange={e => handleReassignRegion(user.id, e.target.value ? parseInt(e.target.value, 10) : null)}
                                onClick={e => e.stopPropagation()}
                                disabled={reassigningId === user.id}
                                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                              >
                                <option value="">— Unassigned —</option>
                                {regions.filter(r => r.is_active).map(r => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>
                              {user.region_assignment_method && (
                                <span className="text-xs text-gray-400">
                                  {user.region_assignment_method === 'fsa_auto' ? 'Auto (FSA)' :
                                   user.region_assignment_method === 'boundary_auto' ? 'Auto (boundary)' :
                                   user.region_assignment_method === 'distance_auto' ? 'Auto (distance)' : 'Manual'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-6">
                              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={user.is_browsable}
                                  onChange={() => handleToggleBrowsable(user.id, user.is_browsable)}
                                  onClick={e => e.stopPropagation()}
                                />
                                <span className="font-medium text-gray-700">Visible in search</span>
                              </label>
                              <button
                                onClick={() => handleArchiveUser(user.id, `${user.first_name} ${user.last_name}`)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition"
                              >
                                Archive Volunteer
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Archived Volunteers Table */}
        {!loading && !error && viewMode === 'archived' && !archivedLoading && (
          <table className="w-full text-sm border border-gray-200 rounded-md">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2">Archived Date</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredArchived.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No archived volunteers found.</td>
                </tr>
              ) : filteredArchived.map(user => (
                <tr key={user.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">{user.first_name} {user.last_name}</td>
                  <td className="px-4 py-2">{user.email}</td>
                  <td className="px-4 py-2">{user.city}</td>
                  <td className="px-4 py-2">{new Date(user.archived_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleUnarchiveUser(user.id, `${user.first_name} ${user.last_name}`)}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition"
                    >
                      Unarchive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Archive Confirmation Modal */}
      {archiveModalOpen && userToArchive && archiveWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {archiveWarning.appointments.length === 0 ? (
                <>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Archive Volunteer</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    Are you sure you want to archive <span className="font-semibold">{userToArchive.name}</span>?
                  </p>
                  <p className="text-sm text-gray-600 mb-6">They will no longer be able to access the platform or book appointments.</p>
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => { setArchiveModalOpen(false); setUserToArchive(null); setArchiveWarning(null); }}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                      disabled={archiving}
                    >
                      Cancel
                    </button>
                    <button onClick={confirmArchive} disabled={archiving}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md disabled:opacity-50">
                      {archiving ? 'Archiving...' : 'Archive Volunteer'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Warning: {archiveWarning.appointments.length} active appointment{archiveWarning.appointments.length !== 1 ? 's' : ''}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">Archiving this volunteer will automatically cancel the following appointments:</p>
                  {archiveWarning.appointments.filter(a => a.status === 'confirmed').length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-red-700 mb-2">Confirmed ({archiveWarning.appointments.filter(a => a.status === 'confirmed').length}):</h4>
                      <ul className="space-y-2 ml-4">
                        {archiveWarning.appointments.filter(a => a.status === 'confirmed').map(appt => (
                          <li key={appt.id} className="text-sm text-gray-700">
                            • {new Date(appt.start_time).toLocaleString()} with <span className="font-medium">{appt.other_user_name}</span>
                            {appt.dog_name && <span className="text-gray-500"> ({appt.dog_name})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {archiveWarning.appointments.filter(a => a.status === 'pending').length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-orange-700 mb-2">Pending ({archiveWarning.appointments.filter(a => a.status === 'pending').length}):</h4>
                      <ul className="space-y-2 ml-4">
                        {archiveWarning.appointments.filter(a => a.status === 'pending').map(appt => (
                          <li key={appt.id} className="text-sm text-gray-700">
                            • {new Date(appt.start_time).toLocaleString()} with <span className="font-medium">{appt.other_user_name}</span>
                            {appt.dog_name && <span className="text-gray-500"> ({appt.dog_name})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                    <p className="text-sm text-yellow-800">The other parties will be notified via email that their appointments were canceled by a Sunshine administrator.</p>
                  </div>
                  <p className="text-sm text-gray-700 mb-6">
                    Are you sure you want to archive <span className="font-semibold">{userToArchive.name}</span> and cancel their appointments?
                  </p>
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => { setArchiveModalOpen(false); setUserToArchive(null); setArchiveWarning(null); }}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                      disabled={archiving}
                    >
                      Cancel
                    </button>
                    <button onClick={confirmArchive} disabled={archiving}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md disabled:opacity-50">
                      {archiving ? 'Archiving...' : 'Archive & Cancel Appointments'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Document Modal */}
      {selectedDocVolunteer && (
        <DocumentModal
          volunteerId={selectedDocVolunteer.id}
          volunteerName={selectedDocVolunteer.name}
          record={selectedDocVolunteer.record}
          prefetchedDocs={signedUrlCache.get(selectedDocVolunteer.id) ?? null}
          onClose={() => setSelectedDocVolunteer(null)}
          onVerified={(updated) => {
            setSignedUrlCache(prev => { const m = new Map(prev); m.delete(selectedDocVolunteer.id); return m; });
            setSelectedDocVolunteer(prev => prev ? { ...prev, record: updated } : null);
          }}
        />
      )}
    </div>
  );
}
