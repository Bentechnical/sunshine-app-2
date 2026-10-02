'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { X } from 'lucide-react';
import { useDashboardUI } from '@/contexts/DashboardUIContext';
import AvatarUpload, { AvatarUploadHandle } from '@/components/profile/AvatarUpload';
import { geocodePostalCode } from '@/utils/geocode';

interface InitialProfile {
  bio: string | null;
  phone_number: string | null;
  profile_image: string | null;
  postal_code: string | null;
  travel_distance_km: number | null;
  pronouns: string | null;
  date_of_birth: string | null;
  open_to_individual_visits: boolean | null;
}

interface Props {
  initialProfile: InitialProfile;
  onClose: () => void;
  onSaved: () => void;
}

function formatPhoneNumber(value: string): string {
  const cleaned = value.replace(/\D/g, '').slice(0, 10);
  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
  if (!match) return value;
  const parts = [match[1], match[2], match[3]].filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return `(${parts[0]}`;
  if (parts.length === 2) return `(${parts[0]}) ${parts[1]}`;
  return `(${parts[0]}) ${parts[1]}-${parts[2]}`;
}

function normalizePostalCode(code: string): string {
  const upper = code.toUpperCase().replace(/\s+/g, '');
  return upper.length === 6 ? `${upper.slice(0, 3)} ${upper.slice(3)}` : upper;
}

export default function VolunteerEditModal({ initialProfile, onClose, onSaved }: Props) {
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const { setHideMobileNav } = useDashboardUI();
  const avatarRef = useRef<AvatarUploadHandle>(null);

  // Hide mobile nav while modal is open
  useEffect(() => {
    setHideMobileNav(true);
    return () => setHideMobileNav(false);
  }, [setHideMobileNav]);

  // Profile form state
  const [bio, setBio] = useState(initialProfile.bio ?? '');
  const [phone, setPhone] = useState(initialProfile.phone_number ?? '');
  const [postalCode, setPostalCode] = useState(initialProfile.postal_code ?? '');
  const [openToIndividualVisits, setOpenToIndividualVisits] = useState(initialProfile.open_to_individual_visits ?? true);
  const [travelDistance, setTravelDistance] = useState(initialProfile.travel_distance_km ?? 25);
  const [pronouns, setPronouns] = useState(initialProfile.pronouns ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(initialProfile.date_of_birth ?? '');
  const avatarUrlRef = useRef(initialProfile.profile_image ?? '');
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const handleSaveProfile = async () => {
    if (!user?.id) return;

    const cleanCode = postalCode.toUpperCase().replace(/\s+/g, '');
    if (!cleanCode) { setProfileError('Postal code is required.'); return; }
    const validPostal = /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleanCode);
    if (!validPostal) { setProfileError('Postal code must be in the format A1A 1A1.'); return; }

    setSaving(true);
    setProfileError(null);

    const normalized = normalizePostalCode(cleanCode);
    const payload: Record<string, unknown> = {
      bio,
      phone_number: phone,
      profile_image: avatarUrlRef.current,
      postal_code: normalized,
      open_to_individual_visits: openToIndividualVisits,
      travel_distance_km: openToIndividualVisits ? travelDistance : 25,
      pronouns,
      date_of_birth: dateOfBirth || null,
    };

    try {
      const { lat, lng } = await geocodePostalCode(normalized, user.id);
      payload.location_lat = lat;
      payload.location_lng = lng;
    } catch {
      // Geocoding failure is non-fatal
    }

    const { error } = await supabase.from('users').update(payload).eq('id', user.id);

    setSaving(false);

    if (error) {
      setProfileError('Failed to save. Please try again.');
      return;
    }

    onSaved();
    onClose();
  };

  const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const lc = 'block text-sm font-semibold text-gray-700 mb-1.5';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col pb-[env(safe-area-inset-bottom)]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Edit Profile</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <div className="space-y-5">

            {/* Photo */}
            <div className="flex items-center gap-4">
              <AvatarUpload
                ref={avatarRef}
                initialUrl={avatarUrlRef.current}
                fallbackUrl="https://via.placeholder.com/100"
                onUpload={url => { avatarUrlRef.current = url; }}
                size={72}
                altText="Profile picture"
              />
              <button
                type="button"
                onClick={() => avatarRef.current?.triggerClick()}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Change photo
              </button>
            </div>

            {/* Phone */}
            <div>
              <label className={lc}>Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(formatPhoneNumber(e.target.value))}
                placeholder="(123) 456-7890"
                className={ic}
              />
            </div>

            {/* Postal Code */}
            <div>
              <label className={lc}>Postal Code</label>
              <input
                type="text"
                value={postalCode}
                onChange={e => setPostalCode(e.target.value.toUpperCase())}
                placeholder="e.g., M5V 2T6"
                className={`${ic} uppercase`}
              />
            </div>

            {/* Individual visits opt-in */}
            <div className={`p-4 border rounded-xl transition-colors ${openToIndividualVisits ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={openToIndividualVisits}
                  onChange={e => setOpenToIndividualVisits(e.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Open to individual visit requests</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Allow people seeking an individual therapy dog visit to find my profile and send me a request.
                  </p>
                </div>
              </label>
            </div>

            {/* Bio */}
            <div>
              <label className={lc}>Bio</label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={4}
                placeholder="Tell us about yourself..."
                className={ic}
              />
            </div>

            {/* Pronouns */}
            <div>
              <label className={lc}>Pronouns</label>
              <select value={pronouns} onChange={e => setPronouns(e.target.value)} className={ic}>
                <option value="">Select pronouns</option>
                <option value="he/him">He/Him</option>
                <option value="she/her">She/Her</option>
                <option value="they/them">They/Them</option>
              </select>
            </div>

            {/* Date of Birth */}
            <div>
              <label className={lc}>Date of Birth</label>
              <input
                type="date"
                max={new Date().toISOString().split('T')[0]}
                value={dateOfBirth}
                onChange={e => setDateOfBirth(e.target.value)}
                className={ic}
              />
            </div>

            {profileError && <p className="text-sm text-red-600">{profileError}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="w-full py-2.5 px-4 bg-[#0e62ae] text-white text-sm font-semibold rounded-xl hover:bg-[#094e8b] transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

      </div>
    </div>
  );
}
