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
}

export default function ProfileCardBlock() {
  const { user } = useUser();
  const supabase = useSupabaseClient();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditForm, setShowEditForm] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    let isMounted = true;

    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('users')
        .select(
          'first_name, last_name, email, phone_number, profile_image, bio, postal_code, travel_distance_km, location_lat, location_lng, role'
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
  }, [user?.id]);

  const handleUpdateProfile = async (
    bio: string,
    phone: string,
    avatarUrl?: string,
    postalCode?: string,
    travelDistanceKm?: number
  ) => {
    if (!user?.id) return;

    const updatePayload: any = {
      bio,
      phone_number: phone,
      profile_image: avatarUrl,
      postal_code: postalCode,
    };

    if (profile?.role === 'volunteer') {
      updatePayload.travel_distance_km = travelDistanceKm ?? 10;
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
        'first_name, last_name, email, phone_number, profile_image, bio, postal_code, travel_distance_km, location_lat, location_lng, role'
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
    <div className="rounded-lg px-3 py-2 flex flex-col justify-between min-h-[200px]">
      <div className="flex flex-col md:flex-row items-start">
        {profile.profile_image && (
          <div className="flex-shrink-0 mb-4 md:mb-0 mx-auto md:mx-0 md:mr-6">
            <div className="relative w-36 aspect-square rounded-lg overflow-hidden shadow-md border border-gray-300">
              <Image
                src={profile.profile_image}
                alt="Profile"
                fill
                className="object-cover"
              />
            </div>
          </div>
        )}

        <div className="md:ml-6 flex-1">
          <h2 className="text-sm text-gray-500 tracking-wide mb-1 font-semibold">My Profile</h2>
          <hr className="border-t border-gray-200 mb-3" />
          <h3 className="text-lg font-semibold mb-1">{fullName}</h3>
          <p className="text-sm text-gray-800"><strong>Email:</strong> {email}</p>
          <p className="text-sm text-gray-800"><strong>Phone:</strong> {phone}</p>
          {profile.postal_code && (
            <p className="text-sm text-gray-800"><strong>Postal Code:</strong> {profile.postal_code}</p>
          )}
          {profile.role === 'volunteer' && profile.travel_distance_km && (
            <p className="text-sm text-gray-800"><strong>Travel Distance:</strong> {profile.travel_distance_km} km</p>
          )}
          {bio && (
            <div className="text-sm text-gray-700 mt-1 whitespace-pre-line break-words max-h-20 overflow-y-auto pr-1">
              {bio}
            </div>
          )}
        </div>
      </div>

      <Button className="w-full mt-3 text-sm py-2" onClick={() => setShowEditForm(true)}>
        Edit Profile
      </Button>
    </div>
  );
}
