// src/components/admin/AdminManageRegions.tsx
'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronDown, ChevronUp, Plus, X, MapPin } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegionPlace {
  id: number;
  place_id: string;
  place_name: string;
  place_type: string;
  match_value: string;
  lat: number | null;
  lng: number | null;
  viewport_south: number | null;
  viewport_west: number | null;
  viewport_north: number | null;
  viewport_east: number | null;
  boundary_json: any | null;
  boundary_status: 'pending' | 'found' | 'not_found' | null;
}

interface Region {
  id: number;
  name: string;
  owner_pd_id: string | null;
  owner_pd_name: string | null;
  is_active: boolean;
  places: RegionPlace[];
  volunteer_count: number;
  org_count: number;
}

interface PdUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  pd_postal_code: string | null;
  profile_complete: boolean;
}

// ─── Google Maps loader (singleton) ──────────────────────────────────────────

declare global {
  interface Window {
    google: any;
    __mapsApiCallback: () => void;
  }
}

let mapsReady = false;
let mapsLoading = false;
const mapsCallbacks: Array<() => void> = [];

function loadMapsScript(onReady: () => void) {
  // Already loaded (handles HMR where module vars reset but script stays in DOM)
  if (window.google?.maps) { mapsReady = true; onReady(); return; }
  if (mapsReady) { onReady(); return; }
  mapsCallbacks.push(onReady);
  if (mapsLoading) return;
  mapsLoading = true;
  window.__mapsApiCallback = () => {
    mapsReady = true;
    mapsCallbacks.forEach(fn => fn());
    mapsCallbacks.length = 0;
  };
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=__mapsApiCallback`;
  script.async = true;
  document.head.appendChild(script);
}

// ─── Region Form Modal ────────────────────────────────────────────────────────

function RegionFormModal({
  region,
  onSave,
  onClose,
}: {
  region: Region | null;
  onSave: (updated: Region) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(region?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) { setError('Region name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const url = region ? `/api/admin/regions/${region.id}` : '/api/admin/regions';
      const method = region ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to save'); return; }
      onSave(json.region);
    } catch {
      setError('Failed to save region');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{region ? 'Edit Region Title' : 'Create Region'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Region Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Waterloo Region"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#0e62ae] text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : region ? 'Save' : 'Create Region'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Deactivate Confirm Modal ─────────────────────────────────────────────────

function DeactivateModal({
  region,
  onConfirm,
  onClose,
}: {
  region: Region;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [deactivating, setDeactivating] = useState(false);

  const handleConfirm = async () => {
    setDeactivating(true);
    await onConfirm();
    setDeactivating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Deactivate Region</h2>
        <p className="text-sm text-gray-700">
          Are you sure you want to deactivate <span className="font-semibold">{region.name}</span>?
        </p>
        {(region.volunteer_count > 0 || region.org_count > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            The following will be moved to <span className="font-semibold">Unassigned</span>:
            <ul className="mt-1 ml-3 list-disc">
              {region.volunteer_count > 0 && <li>{region.volunteer_count} volunteer{region.volunteer_count !== 1 ? 's' : ''}</li>}
              {region.org_count > 0 && <li>{region.org_count} organization{region.org_count !== 1 ? 's' : ''}</li>}
            </ul>
          </div>
        )}
        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deactivating}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            {deactivating ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Places Manager ───────────────────────────────────────────────────────────

function PlacesManager({
  region,
  onPlacesChanged,
}: {
  region: Region;
  onPlacesChanged: (places: RegionPlace[]) => void;
}) {
  const [places, setPlaces] = useState<RegionPlace[]>(region.places);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<any>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  // Ref that always holds the latest add handler — fixes stale closure in autocomplete listener
  const addHandlerRef = useRef<(payload: Omit<RegionPlace, 'id' | 'boundary_json' | 'boundary_status'>) => Promise<void>>(async () => {});

  addHandlerRef.current = async (payload: Omit<RegionPlace, 'id' | 'boundary_json' | 'boundary_status'>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/regions/${region.id}/places`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to add place'); return; }
      setPlaces(prev => {
        if (prev.some(p => p.place_id === payload.place_id)) return prev;
        return [...prev, json.place];
      });
      // onPlacesChanged called via useEffect watching places state
    } catch {
      setError('Failed to add place');
    } finally {
      setSaving(false);
    }
  };

  // Notify parent whenever places changes
  useEffect(() => {
    onPlacesChanged(places);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  // Load Google Maps
  useEffect(() => {
    loadMapsScript(() => setMapsLoaded(true));
  }, []);

  // Init Places Autocomplete — runs once when Maps loads
  useEffect(() => {
    if (!mapsLoaded || !inputRef.current || acRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['(regions)'],
      componentRestrictions: { country: 'ca' },
      fields: ['place_id', 'name', 'types', 'geometry', 'address_components'],
    });

    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place?.place_id || !place.geometry?.location) return;

      if (inputRef.current) inputRef.current.value = '';

      const types: string[] = place.types ?? [];
      const primaryType = types.find(t => t !== 'political') ?? types[0] ?? 'unknown';
      const comp = place.address_components?.find((c: any) => c.types.includes(primaryType));
      const matchValue = comp?.long_name ?? place.name ?? '';
      const viewport = place.geometry.viewport;

      // Always call via ref so we get the latest handler, not a stale closure
      addHandlerRef.current({
        place_id: place.place_id,
        place_name: place.name ?? matchValue,
        place_type: primaryType,
        match_value: matchValue,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        viewport_south: viewport ? viewport.getSouthWest().lat() : null,
        viewport_west: viewport ? viewport.getSouthWest().lng() : null,
        viewport_north: viewport ? viewport.getNorthEast().lat() : null,
        viewport_east: viewport ? viewport.getNorthEast().lng() : null,
      });
    });

    acRef.current = ac;
    return () => {
      if (acRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(acRef.current);
      }
      acRef.current = null;
    };
  }, [mapsLoaded]);

  // Init/update map when places change
  useEffect(() => {
    if (!mapsLoaded || !mapDivRef.current || places.length === 0) return;

    // If the map div was unmounted and remounted (new DOM node), reinitialize
    if (mapRef.current && !mapDivRef.current.hasChildNodes()) {
      mapRef.current = null;
    }

    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(mapDivRef.current, {
        zoom: 8,
        center: { lat: 43.7, lng: -79.5 },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
    }

    // Fit bounds to all places
    const bounds = new window.google.maps.LatLngBounds();
    let hasBounds = false;
    places.forEach(p => {
      if (p.viewport_south != null && p.viewport_west != null && p.viewport_north != null && p.viewport_east != null) {
        bounds.extend({ lat: p.viewport_south, lng: p.viewport_west });
        bounds.extend({ lat: p.viewport_north, lng: p.viewport_east });
        hasBounds = true;
      } else if (p.lat != null && p.lng != null) {
        bounds.extend({ lat: p.lat, lng: p.lng });
        hasBounds = true;
      }
    });
    if (hasBounds) mapRef.current.fitBounds(bounds);

    // Draw OSM boundary polygons using the stored GeoJSON
    mapRef.current.data.forEach((feature: any) => mapRef.current.data.remove(feature));
    places
      .filter(p => p.boundary_status === 'found' && p.boundary_json)
      .forEach(p => {
        mapRef.current.data.addGeoJson({
          type: 'Feature',
          geometry: p.boundary_json,
          properties: { place_id: p.place_id, place_name: p.place_name },
        });
      });
    mapRef.current.data.setStyle({
      fillColor: '#0e62ae',
      fillOpacity: 0.15,
      strokeColor: '#0e62ae',
      strokeOpacity: 0.8,
      strokeWeight: 2,
    });
  }, [places, mapsLoaded]);

  const handleRemove = async (place: RegionPlace) => {
    try {
      const res = await fetch(`/api/admin/regions/${region.id}/places/${place.id}`, { method: 'DELETE' });
      if (!res.ok) { setError('Failed to remove place'); return; }
      setPlaces(prev => prev.filter(p => p.id !== place.id));
    } catch {
      setError('Failed to remove place');
    }
  };

  const placeTypeLabel = (type: string) => {
    if (type === 'locality') return 'City';
    if (type === 'administrative_area_level_2') return 'Region/County';
    if (type === 'sublocality' || type === 'sublocality_level_1') return 'District';
    if (type === 'administrative_area_level_3') return 'Township';
    return type.replace(/_/g, ' ');
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1">
        <MapPin size={12} /> Geographic Coverage
      </p>

      {/* Autocomplete input */}
      <div className="mb-3">
        <input
          ref={inputRef}
          type="text"
          placeholder={mapsLoaded ? 'Search for a city or region to add…' : 'Loading…'}
          disabled={!mapsLoaded || saving}
          autoComplete="off"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <p className="text-xs text-gray-400 mt-1">
          Type a place name and select from the dropdown — e.g. &quot;Kitchener&quot;, &quot;Regional Municipality of Waterloo&quot;, &quot;City of Toronto&quot;
        </p>
      </div>

      {/* Added places as chips */}
      {places.length === 0 ? (
        <p className="text-xs text-gray-400 italic mb-3">No areas defined yet. Search above to add a city or region.</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {places.map(p => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full"
            >
              <span>{p.place_name}</span>
              <span className="text-blue-400 font-normal">({placeTypeLabel(p.place_type)})</span>
              <button
                onClick={() => handleRemove(p)}
                className="hover:text-red-600 ml-0.5 leading-none text-blue-400"
                aria-label={`Remove ${p.place_name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Map */}
      {places.length > 0 && (
        <>
          <div
            ref={mapDivRef}
            className="w-full rounded-lg border border-gray-200 overflow-hidden"
            style={{ height: 220 }}
          />
          <p className="text-xs text-gray-400 mt-1">
            Boundaries ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
              OpenStreetMap
            </a>{' '}contributors
          </p>
        </>
      )}

      {saving && <p className="text-xs text-gray-400 mt-2">Saving…</p>}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminManageRegions() {
  const [activeTab, setActiveTab] = useState<'regions' | 'pds'>('regions');
  const [regions, setRegions] = useState<Region[]>([]);
  const [pdUsers, setPdUsers] = useState<PdUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [showInactive, setShowInactive] = useState(false);

  const [formModal, setFormModal] = useState<{ region: Region | null } | null>(null);
  const [deactivateModal, setDeactivateModal] = useState<Region | null>(null);

  // PD invite state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [regRes, usersRes] = await Promise.all([
        fetch('/api/admin/regions'),
        fetch('/api/admin/approved-users'),
      ]);
      const [regJson, usersJson] = await Promise.all([regRes.json(), usersRes.json()]);

      if (!regRes.ok) { setError(regJson.error || 'Failed to load regions'); return; }

      setRegions(regJson.regions ?? []);
      const pds: PdUser[] = (usersJson.users ?? [])
        .filter((u: any) => u.role === 'pd')
        .map((u: any) => ({
          id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          email: u.email,
          phone: u.phone_number,
          pd_postal_code: u.pd_postal_code ?? null,
          profile_complete: u.profile_complete ?? false,
        }))
        .sort((a: PdUser, b: PdUser) => a.last_name.localeCompare(b.last_name));
      setPdUsers(pds);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleInvitePd = async () => {
    setInviteError(null);
    if (!inviteEmail.trim()) { setInviteError('Email is required.'); return; }
    setInviting(true);
    try {
      const res = await fetch('/api/admin/invite-pd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setInviteError(json.error || 'Failed to send invitation.'); return; }
      setInviteSuccess(true);
      setInviteEmail('');
    } catch {
      setInviteError('Failed to send invitation.');
    } finally {
      setInviting(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSaved = (saved: Region) => {
    // PATCH only returns raw DB row — resolve owner_pd_name from local pdUsers state
    const pd = pdUsers.find(p => p.id === saved.owner_pd_id);
    const owner_pd_name = pd ? `${pd.first_name} ${pd.last_name}` : null;
    setRegions(prev => {
      const exists = prev.find(r => r.id === saved.id);
      if (exists) return prev.map(r => r.id === saved.id ? { ...r, ...saved, owner_pd_name } : r);
      return [...prev, { ...saved, owner_pd_name, places: [], volunteer_count: 0, org_count: 0 }].sort((a, b) => a.name.localeCompare(b.name));
    });
    setFormModal(null);
  };

  const handlePdAssign = async (region: Region, pdId: string) => {
    const owner_pd_id = pdId || null;
    const pd = pdUsers.find(p => p.id === pdId);
    const owner_pd_name = pd ? `${pd.first_name} ${pd.last_name}` : null;
    try {
      const res = await fetch(`/api/admin/regions/${region.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_pd_id }),
      });
      if (!res.ok) return;
      setRegions(prev => prev.map(r => r.id === region.id ? { ...r, owner_pd_id, owner_pd_name } : r));
    } catch {
      // silent — UI will revert on next fetch
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateModal) return;
    try {
      const res = await fetch(`/api/admin/regions/${deactivateModal.id}/deactivate`, { method: 'POST' });
      if (!res.ok) { alert('Failed to deactivate region'); return; }
      setRegions(prev => prev.map(r =>
        r.id === deactivateModal.id
          ? { ...r, is_active: false, volunteer_count: 0, org_count: 0 }
          : r
      ));
      setDeactivateModal(null);
    } catch {
      alert('Failed to deactivate region');
    }
  };

  const handlePlacesChanged = (regionId: number, places: RegionPlace[]) => {
    setRegions(prev => prev.map(r => r.id === regionId ? { ...r, places } : r));
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const visibleRegions = showInactive ? regions : regions.filter(r => r.is_active);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-4">
      {/* Tab Nav */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('regions')}
          className={`px-4 py-2 rounded text-sm font-semibold transition ${activeTab === 'regions' ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
        >
          Regions
        </button>
        <button
          onClick={() => setActiveTab('pds')}
          className={`px-4 py-2 rounded text-sm font-semibold transition ${activeTab === 'pds' ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
        >
          Program Directors
        </button>
      </div>

      {/* ── Program Directors Tab ── */}
      {activeTab === 'pds' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{pdUsers.length} Program Director{pdUsers.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => { setShowInviteModal(true); setInviteSuccess(false); setInviteError(null); setInviteEmail(''); }}
              className="px-3 py-1.5 text-sm font-semibold text-[#0e62ae] border border-[#0e62ae] rounded-lg hover:bg-blue-50 transition"
            >
              + Invite Program Director
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12 gap-2">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-600">Loading…</span>
            </div>
          )}

          {!loading && (
            pdUsers.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-6 text-center">No Program Directors yet.</p>
            ) : (
              <table className="w-full text-sm border border-gray-200 rounded-md">
                <thead className="bg-gray-100 text-left">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Phone</th>
                    <th className="px-4 py-2">Postal Code</th>
                    <th className="px-4 py-2">Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {pdUsers.map(u => (
                    <tr key={u.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{u.first_name} {u.last_name}</td>
                      <td className="px-4 py-2 text-gray-600">{u.email}</td>
                      <td className="px-4 py-2 text-gray-600">{u.phone || '—'}</td>
                      <td className="px-4 py-2 text-gray-600">{u.pd_postal_code || '—'}</td>
                      <td className="px-4 py-2">
                        {u.profile_complete
                          ? <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Complete</span>
                          : <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">Pending setup</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      )}

      {/* ── Regions Tab ── */}
      {activeTab === 'regions' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Manage Regions</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {regions.filter(r => r.is_active).length} active region{regions.filter(r => r.is_active).length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={e => setShowInactive(e.target.checked)}
                  className="rounded"
                />
                Show inactive
              </label>
              <button
                onClick={() => setFormModal({ region: null })}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#0e62ae] text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
              >
                <Plus size={16} /> Create Region
              </button>
            </div>
          </div>

          {/* Loading / Error */}
          {loading && (
            <div className="flex items-center justify-center py-12 gap-2">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-600">Loading regions…</span>
            </div>
          )}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
          )}

          {/* Region Table */}
          {!loading && !error && (
            <>
              {visibleRegions.length === 0 ? (
                <p className="text-center text-gray-500 py-10 text-sm">
                  No regions yet. Create one to get started.
                </p>
              ) : (
                <table className="w-full text-sm border border-gray-200 rounded-md">
                  <thead className="bg-gray-100 text-left">
                    <tr>
                      <th className="px-4 py-2">Region</th>
                      <th className="px-4 py-2">Owner PD</th>
                      <th className="px-4 py-2">Volunteers</th>
                      <th className="px-4 py-2">Orgs</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-2 py-2 w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRegions.map(region => {
                      const isExpanded = expandedIds.includes(region.id);
                      return (
                        <React.Fragment key={region.id}>
                          <tr
                            className="border-t hover:bg-gray-50 cursor-pointer"
                            onClick={() => toggleExpand(region.id)}
                          >
                            <td className="px-4 py-3 font-medium text-gray-900">{region.name}</td>
                            <td className="px-4 py-3">
                              {region.owner_pd_name
                                ? <span className="text-gray-800">{region.owner_pd_name}</span>
                                : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">No owner</span>
                              }
                            </td>
                            <td className="px-4 py-3 text-gray-700">{region.volunteer_count}</td>
                            <td className="px-4 py-3 text-gray-700">{region.org_count}</td>
                            <td className="px-4 py-3">
                              {region.is_active
                                ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Active</span>
                                : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">Inactive</span>
                              }
                            </td>
                            <td className="px-2 py-3">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-gray-50 border-t">
                              <td colSpan={6} className="px-6 py-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <button
                                      onClick={e => { e.stopPropagation(); setFormModal({ region }); }}
                                      className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100"
                                    >
                                      Edit Region Title
                                    </button>
                                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                      <label className="text-xs font-medium text-gray-500 whitespace-nowrap">Owner PD:</label>
                                      <select
                                        value={region.owner_pd_id ?? ''}
                                        onChange={e => handlePdAssign(region, e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                      >
                                        <option value="">— No owner —</option>
                                        {pdUsers.map(pd => (
                                          <option key={pd.id} value={pd.id}>{pd.first_name} {pd.last_name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  {region.is_active && (
                                    <button
                                      onClick={e => { e.stopPropagation(); setDeactivateModal(region); }}
                                      className="px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100"
                                    >
                                      Deactivate
                                    </button>
                                  )}
                                </div>

                                <PlacesManager
                                  region={region}
                                  onPlacesChanged={places => handlePlacesChanged(region.id, places)}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {formModal !== null && (
        <RegionFormModal
          region={formModal.region}
          onSave={handleSaved}
          onClose={() => setFormModal(null)}
        />
      )}
      {deactivateModal && (
        <DeactivateModal
          region={deactivateModal}
          onConfirm={handleDeactivate}
          onClose={() => setDeactivateModal(null)}
        />
      )}

      {/* Invite PD Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Invite Program Director</h3>
            <p className="text-sm text-gray-500 mb-4">They&apos;ll receive an email with a link to create their account.</p>
            {inviteSuccess ? (
              <div className="text-center py-4">
                <p className="text-green-700 font-semibold mb-1">Invitation sent!</p>
                <div className="flex justify-center gap-3 mt-4">
                  <button
                    onClick={() => { setInviteSuccess(false); setInviteEmail(''); setInviteError(null); }}
                    className="px-4 py-2 text-sm font-medium text-[#0e62ae] border border-[#0e62ae] rounded-lg hover:bg-blue-50"
                  >
                    Send another
                  </button>
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleInvitePd()}
                    placeholder="pd@sunshinetherapydogs.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={inviting}
                    autoFocus
                  />
                </div>
                {inviteError && <p className="text-sm text-red-600 mb-3">{inviteError}</p>}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    disabled={inviting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInvitePd}
                    disabled={inviting || !inviteEmail.trim()}
                    className="px-4 py-2 text-sm font-semibold bg-[#0e62ae] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {inviting ? 'Sending…' : 'Send Invite'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
