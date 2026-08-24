'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { Loader2, CheckCircle, AlertCircle, Clock, Pencil } from 'lucide-react';
import Image from 'next/image';
import VolunteerEditModal from './VolunteerEditModal';

type ComplianceStatus = 'missing' | 'pending_review' | 'approved' | 'expiring' | 'expired' | 'rejected';

interface ProfileData {
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string | null;
  profile_image?: string | null;
  bio?: string | null;
  postal_code?: string | null;
  travel_distance_km?: number | null;
  open_to_individual_visits?: boolean | null;
  location_lat?: number | null;
  location_lng?: number | null;
  role?: 'individual' | 'volunteer' | 'admin';
  pronouns?: string | null;
  birthday?: number | null;
  physical_address?: string | null;
  other_pets_on_site?: boolean | null;
  other_pets_description?: string | null;
  third_party_available?: string | null;
  additional_information?: string | null;
  liability_waiver_accepted?: boolean | null;
  liability_waiver_accepted_at?: string | null;
  visit_recipient_type?: string | null;
  relationship_to_recipient?: string | null;
  dependant_name?: string | null;
  assigned_region_id?: number | null;
  // Compliance
  vsc_document_url?: string | null;
  vsc_date_issued?: string | null;
  vsc_renewal_due?: string | null;
  vsc_verification_status?: string | null;
}

function getComplianceStatus(documentUrl: string | null, expiryDate: string | null, verificationStatus: string | null): ComplianceStatus {
  if (!documentUrl) return 'missing';
  if (verificationStatus === 'rejected') return 'rejected';
  if (!verificationStatus || verificationStatus === 'pending_review') return 'pending_review';
  // approved
  if (!expiryDate) return 'approved';
  const expiry = new Date(expiryDate);
  const daysUntil = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= 30) return 'expiring';
  return 'approved';
}

const statusConfig: Record<ComplianceStatus, { label: string; icon: React.ReactNode; classes: string }> = {
  missing:        { label: 'VSC Missing',       icon: <AlertCircle size={12} />, classes: 'bg-red-100 text-red-700' },
  pending_review: { label: 'VSC Needs Review',  icon: <Clock size={12} />,       classes: 'bg-amber-100 text-amber-800' },
  approved:       { label: 'VSC Valid',         icon: <CheckCircle size={12} />, classes: 'bg-green-100 text-green-700' },
  expiring:       { label: 'VSC Expiring Soon', icon: <Clock size={12} />,       classes: 'bg-amber-100 text-amber-700' },
  expired:        { label: 'VSC Expired',       icon: <AlertCircle size={12} />, classes: 'bg-red-100 text-red-800' },
  rejected:       { label: 'VSC Rejected',      icon: <AlertCircle size={12} />, classes: 'bg-red-100 text-red-700' },
};

const PROFILE_FIELDS = 'first_name, last_name, email, phone_number, profile_image, bio, postal_code, travel_distance_km, open_to_individual_visits, location_lat, location_lng, role, pronouns, birthday, physical_address, other_pets_on_site, other_pets_description, third_party_available, additional_information, liability_waiver_accepted, liability_waiver_accepted_at, visit_recipient_type, relationship_to_recipient, dependant_name, assigned_region_id, vsc_document_url, vsc_date_issued, vsc_renewal_due, vsc_verification_status';

export default function ProfileCardBlock() {
  const { user } = useUser();
  const supabase = useSupabaseClient();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [regionInfo, setRegionInfo] = useState<{ name: string; pd_first_name: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);

  const loadProfile = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('users')
      .select(PROFILE_FIELDS)
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error loading profile:', error);
      return;
    }
    setProfile(data);
    setLoading(false);

    if (data?.role === 'volunteer' && data?.assigned_region_id) {
      const { data: region } = await supabase
        .from('pd_regions')
        .select('name, owner:users!owner_pd_id(first_name)')
        .eq('id', data.assigned_region_id)
        .single();
      if (region) {
        const ownerArr = region.owner as { first_name: string }[] | null;
        const pdFirstName = Array.isArray(ownerArr) && ownerArr.length > 0 ? ownerArr[0].first_name : null;
        setRegionInfo({ name: region.name, pd_first_name: pdFirstName });
      }
    } else {
      setRegionInfo(null);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading || !profile) {
    return (
      <div className="bg-white rounded-xl p-4 flex items-center justify-center min-h-50">
        <Loader2 className="animate-spin text-gray-500" />
      </div>
    );
  }

  const fullName = `${profile.first_name} ${profile.last_name}`;
  const bio = profile.bio;

  // Only show compliance badge for volunteers
  const isVolunteer = profile.role === 'volunteer';
  const vscStatus = isVolunteer
    ? getComplianceStatus(profile.vsc_document_url ?? null, profile.vsc_renewal_due ?? null, profile.vsc_verification_status ?? null)
    : null;
  const vscConfig = vscStatus ? statusConfig[vscStatus] : null;

  return (
    <>
      <div className="rounded-xl px-4 py-4 flex flex-col gap-5">

        {/* Top section: image + name + edit button */}
        <div className="flex flex-col md:flex-row items-start gap-5">
          {profile.profile_image && (
            <div className="shrink-0 mx-auto md:mx-0">
              <div className="relative w-36 aspect-square rounded-xl overflow-hidden shadow-md">
                <Image
                  src={profile.profile_image}
                  alt="Profile"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col gap-1.5 min-w-0 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-2xl font-bold text-gray-900">{fullName}</h3>
              <button
                onClick={() => setShowEditModal(true)}
                className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                <Pencil size={12} />
                Edit
              </button>
            </div>

            <div className="flex flex-col gap-1 mt-1 text-sm">
              <p><span className="text-gray-500">Email:</span> <span className="text-gray-800">{profile.email}</span></p>
              <p><span className="text-gray-500">Phone:</span> <span className="text-gray-800">{profile.phone_number || 'Not provided'}</span></p>
              {profile.postal_code && (
                <p><span className="text-gray-500">Postal Code:</span> <span className="text-gray-800">{profile.postal_code}</span></p>
              )}
              {profile.pronouns && (
                <p><span className="text-gray-500">Pronouns:</span> <span className="text-gray-800">{profile.pronouns}</span></p>
              )}
              {profile.birthday && profile.visit_recipient_type !== 'other' && (
                <p><span className="text-gray-500">Birth Year:</span> <span className="text-gray-800">{profile.birthday}</span></p>
              )}
            </div>

            {/* VSC compliance badge */}
            {vscConfig && (
              <button
                onClick={() => setShowEditModal(true)}
                className={`mt-1 self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80 ${vscConfig.classes}`}
                title="Click to manage compliance documents"
              >
                {vscConfig.icon}
                {vscConfig.label}
              </button>
            )}
          </div>
        </div>

        {/* Extended profile details */}
        {(profile.role === 'individual' || profile.role === 'volunteer') && (
          <div className="flex flex-col gap-5 border-t border-gray-100 pt-5">

            {profile.role === 'individual' && profile.visit_recipient_type === 'other' && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Visit Recipient</h4>
                <div className="text-sm flex flex-col gap-1">
                  <p><span className="text-gray-500">Name:</span> <span className="text-gray-800">{profile.dependant_name}</span></p>
                  <p><span className="text-gray-500">Relationship:</span> <span className="text-gray-800">{profile.relationship_to_recipient}</span></p>
                  {profile.pronouns && <p><span className="text-gray-500">Pronouns:</span> <span className="text-gray-800">{profile.pronouns}</span></p>}
                  {profile.birthday && <p><span className="text-gray-500">Birth Year:</span> <span className="text-gray-800">{profile.birthday}</span></p>}
                </div>
              </div>
            )}

            {profile.role === 'individual' && (
              <div className="flex flex-col gap-4 text-sm">
                {bio && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Reason for Visit</p>
                    <p className="text-gray-600 italic border-l-2 border-gray-200 pl-3 leading-relaxed">"{bio}"</p>
                  </div>
                )}
                {profile.physical_address && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Location of Visits</p>
                    <p className="text-gray-700">{profile.physical_address}</p>
                  </div>
                )}
                {profile.other_pets_on_site && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Other Animals on Site</p>
                    <p className="text-gray-700">{profile.other_pets_description || 'Yes'}</p>
                  </div>
                )}
                {profile.third_party_available && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Third Party Contact</p>
                    <p className="text-gray-700">{profile.third_party_available}</p>
                  </div>
                )}
                {profile.additional_information && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Additional Information</p>
                    <p className="text-gray-700">{profile.additional_information}</p>
                  </div>
                )}
              </div>
            )}

            {profile.role === 'volunteer' && (
              <div className="flex flex-col gap-4 text-sm">
                {regionInfo && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Region</p>
                    <p className="text-gray-700">
                      {regionInfo.name}
                      {regionInfo.pd_first_name && (
                        <span className="text-gray-500"> — Coordinator: {regionInfo.pd_first_name}</span>
                      )}
                    </p>
                  </div>
                )}
                {profile.travel_distance_km && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Travel Distance</p>
                    <p className="text-gray-700">{profile.travel_distance_km} km</p>
                  </div>
                )}
                {bio && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Bio</p>
                    <p className="text-gray-600 italic border-l-2 border-gray-200 pl-3 leading-relaxed">"{bio}"</p>
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Edit modal — volunteers only */}
      {showEditModal && isVolunteer && (
        <VolunteerEditModal
          initialProfile={{
            bio: profile.bio ?? null,
            phone_number: profile.phone_number ?? null,
            profile_image: profile.profile_image ?? null,
            postal_code: profile.postal_code ?? null,
            travel_distance_km: profile.travel_distance_km ?? null,
            open_to_individual_visits: profile.open_to_individual_visits ?? true,
            pronouns: profile.pronouns ?? null,
            vsc_document_url: profile.vsc_document_url ?? null,
            vsc_date_issued: profile.vsc_date_issued ?? null,
            vsc_renewal_due: profile.vsc_renewal_due ?? null,
            vsc_verification_status: profile.vsc_verification_status ?? null,
          }}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            setLoading(true);
            loadProfile();
          }}
        />
      )}
    </>
  );
}
