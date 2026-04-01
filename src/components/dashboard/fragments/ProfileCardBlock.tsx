'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import EditProfileForm from '@/components/profile/EditProfileForm';
import { geocodePostalCode } from '@/utils/geocode';

interface ProfileData {
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string | null;
  profile_image?: string | null;
  bio?: string | null;
  postal_code?: string | null;
  travel_distance_km?: number | null;
  location_lat?: number | null;
  location_lng?: number | null;
  role?: 'individual' | 'volunteer' | 'admin';
  // New individual user fields
  pronouns?: string | null;
  birthday?: number | null;
  physical_address?: string | null;
  other_pets_on_site?: boolean | null;
  other_pets_description?: string | null;
  third_party_available?: string | null;
  additional_information?: string | null;
  liability_waiver_accepted?: boolean | null;
  liability_waiver_accepted_at?: string | null;
  // Visit recipient fields
  visit_recipient_type?: string | null;
  relationship_to_recipient?: string | null;
  dependant_name?: string | null;
}

export default function ProfileCardBlock() {
  const { user } = useUser();
  const supabase = useSupabaseClient();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditForm, setShowEditForm] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    // Don't reload profile if edit form is open (prevents data loss during editing)
    if (showEditForm) return;

    let isMounted = true;

    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('users')
        .select(
          'first_name, last_name, email, phone_number, profile_image, bio, postal_code, travel_distance_km, location_lat, location_lng, role, pronouns, birthday, physical_address, other_pets_on_site, other_pets_description, third_party_available, additional_information, liability_waiver_accepted, liability_waiver_accepted_at, visit_recipient_type, relationship_to_recipient, dependant_name'
        )
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error loading profile:', error);
        return;
      }

      if (isMounted) {
        setProfile(data);
        setLoading(false);
      }
    };

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [user?.id, showEditForm]);

  const handleUpdateProfile = async (
    bio: string,
    phone: string,
    avatarUrl?: string,
    postalCode?: string,
    travelDistanceKm?: number,
    pronouns?: string,
    birthday?: string,
    physicalAddress?: string,
    otherPetsOnSite?: boolean,
    otherPetsDescription?: string,
    thirdPartyAvailable?: string,
    additionalInformation?: string,
    visitRecipientType?: string,
    relationshipToRecipient?: string,
    dependantName?: string
  ) => {
    if (!user?.id) return;

    const updatePayload: any = {
      bio,
      phone_number: phone,
      profile_image: avatarUrl,
      postal_code: postalCode,
      pronouns: pronouns, // Add pronouns for both individuals and volunteers
    };

    if (profile?.role === 'volunteer') {
      updatePayload.travel_distance_km = travelDistanceKm ?? 10;
    }

    // Add individual-specific fields
    if (profile?.role === 'individual') {
      updatePayload.birthday = birthday ? parseInt(birthday) : null;
      updatePayload.physical_address = physicalAddress;
      updatePayload.other_pets_on_site = otherPetsOnSite;
      updatePayload.other_pets_description = otherPetsDescription;
      updatePayload.third_party_available = thirdPartyAvailable;
      updatePayload.additional_information = additionalInformation;
      
      // Add visit recipient fields
      updatePayload.visit_recipient_type = visitRecipientType;
      updatePayload.relationship_to_recipient = relationshipToRecipient;
      updatePayload.dependant_name = dependantName;
    }

    if (postalCode && user?.id) {
  try {
    const { lat, lng } = await geocodePostalCode(postalCode, user.id);

        updatePayload.location_lat = lat;
        updatePayload.location_lng = lng;
        console.log('[Geo] Updated lat/lng for postal code:', postalCode, lat, lng);
      } catch (err) {
        console.error('[Geo] Failed to geocode postal code:', postalCode, err);
      }
    }

    const { error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', user.id);

    if (error) {
      console.error('Error updating profile:', error);
      return;
    }

    setShowEditForm(false);
    setLoading(true);

    const { data } = await supabase
      .from('users')
      .select(
        'first_name, last_name, email, phone_number, profile_image, bio, postal_code, travel_distance_km, location_lat, location_lng, role, pronouns, birthday, physical_address, other_pets_on_site, other_pets_description, third_party_available, additional_information, liability_waiver_accepted, liability_waiver_accepted_at, visit_recipient_type, relationship_to_recipient, dependant_name'
      )
      .eq('id', user.id)
      .single();

    setProfile(data);
    setLoading(false);
  };

  if (loading || !profile) {
    return (
      <div className="bg-white shadow-md rounded-lg p-4 flex items-center justify-center min-h-[200px]">
        <Loader2 className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (showEditForm && user?.id) {
    return (
      <EditProfileForm
        initialBio={profile.bio}
        initialPhone={profile.phone_number ?? ''}
        initialAvatarUrl={profile.profile_image ?? ''}
        initialPostalCode={profile.postal_code ?? ''}
        initialTravelDistance={profile.travel_distance_km ?? 10}
        initialPronouns={profile.pronouns ?? ''}
        initialBirthday={profile.birthday?.toString() ?? ''}
        initialPhysicalAddress={profile.physical_address ?? ''}
        initialOtherPetsOnSite={profile.other_pets_on_site ?? false}
        initialOtherPetsDescription={profile.other_pets_description ?? ''}
        initialThirdPartyAvailable={profile.third_party_available ?? ''}
        initialAdditionalInformation={profile.additional_information ?? ''}
        initialVisitRecipientType={profile.visit_recipient_type ?? ''}
        initialRelationshipToRecipient={profile.relationship_to_recipient ?? ''}
        initialDependantName={profile.dependant_name ?? ''}
        role={profile.role ?? 'individual'}
        userId={user.id}
        onSubmit={handleUpdateProfile}
      />
    );
  }

  const fullName = `${profile.first_name} ${profile.last_name}`;
  const email = profile.email;
  const phone = profile.phone_number || 'Not provided';
  const bio = profile.bio;

  return (
    <div className="rounded-xl px-4 py-4 flex flex-col gap-5">

      {/* Top section: image + essential fields */}
      <div className="flex flex-col md:flex-row items-start gap-5">
        {profile.profile_image && (
          <div className="flex-shrink-0 mx-auto md:mx-0">
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

        <div className="flex-1 flex flex-col gap-1.5">
          <h3 className="text-2xl font-bold text-gray-900">{fullName}</h3>
          <div className="flex flex-col gap-1 mt-1 text-sm">
            <p><span className="text-gray-500">Email:</span> <span className="text-gray-800">{email}</span></p>
            <p><span className="text-gray-500">Phone:</span> <span className="text-gray-800">{phone}</span></p>
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
        </div>
      </div>

      {/* Bottom section: full-width extended profile details */}
      {(profile.role === 'individual' || profile.role === 'volunteer') && (
        <div className="flex flex-col gap-5 border-t border-gray-100 pt-5">

          {/* Visit Recipient (individuals arranging for someone else) */}
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

          {/* Profile Details — individuals */}
          {profile.role === 'individual' && (
            <div className="flex flex-col gap-4">
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
            </div>
          )}

          {/* Profile Details — volunteers */}
          {profile.role === 'volunteer' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 text-sm">
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
            </div>
          )}

        </div>
      )}

      <Button className="w-full text-sm py-2" onClick={() => setShowEditForm(true)}>
        Edit Profile
      </Button>
    </div>
  );
}
