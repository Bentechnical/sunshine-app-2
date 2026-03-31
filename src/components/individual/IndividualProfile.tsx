'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useSupabaseClient } from '@/utils/supabase/client';
import { optimizeSupabaseImage, getImageSizes } from '@/utils/imageOptimization';
import ChatRequestButton from '@/components/chat/ChatRequestButton';

interface IndividualProfileData {
  first_name: string;
  last_name: string;
  pronouns: string | null;
  bio: string | null;
  city: string | null;
  profile_image: string | null;
  visit_recipient_type: string | null;
  relationship_to_recipient: string | null;
  dependant_name: string | null;
  additional_information: string | null;
  other_pets_on_site: boolean | null;
  other_pets_description: string | null;
  physical_address: string | null;
}

interface IndividualProfileProps {
  individualId: string;
  dogId: number | null;
  distanceKm: number;
  onBack: () => void;
  onGoToChat: () => void;
}

export default function IndividualProfile({
  individualId,
  dogId,
  distanceKm,
  onBack,
  onGoToChat,
}: IndividualProfileProps) {
  const supabase = useSupabaseClient();
  const [profile, setProfile] = useState<IndividualProfileData | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const [profileRes, categoriesRes] = await Promise.all([
        supabase
          .from('users')
          .select(
            'first_name, last_name, pronouns, bio, city, profile_image, visit_recipient_type, relationship_to_recipient, dependant_name, additional_information, other_pets_on_site, other_pets_description, physical_address'
          )
          .eq('id', individualId)
          .single(),
        supabase
          .from('individual_audience_tags')
          .select('audience_categories(name)')
          .eq('individual_id', individualId),
      ]);

      if (profileRes.data) setProfile(profileRes.data);

      if (categoriesRes.data) {
        const names = categoriesRes.data
          .map((row: any) => row.audience_categories?.name)
          .filter(Boolean);
        setCategories(names);
      }

      setLoading(false);
    };

    fetchProfile();
  }, [individualId]);

  if (loading) return <p className="p-4">Loading...</p>;
  if (!profile) return <p className="p-4">Profile not found.</p>;

  const lastInitial = profile.last_name ? profile.last_name[0] : '';
  const isVisitingOther = profile.visit_recipient_type === 'other';
  const visitSubject = isVisitingOther && profile.dependant_name
    ? profile.dependant_name
    : profile.first_name;

  return (
    <div className="px-4 pb-4">
      <div className="bg-white shadow-lg rounded-xl p-5 flex flex-col gap-5">

        {/* Back button */}
        <button
          className="text-sm text-[#0e62ae] font-semibold hover:underline self-start"
          onClick={onBack}
        >
          ← Back to Browse
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column - Image only */}
          <div className="col-span-1">
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-gray-100">
              {profile.profile_image ? (
                <Image
                  src={optimizeSupabaseImage(profile.profile_image, { width: 600, quality: 80 })}
                  alt={profile.first_name}
                  fill
                  sizes={getImageSizes('profile')}
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl text-gray-400">
                  {profile.first_name[0]}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - All profile details + CTA */}
          <div className="col-span-2 flex flex-col gap-5">

            {/* Name + pronouns + location */}
            <div>
              <h2 className="text-3xl font-bold text-gray-900">
                {profile.first_name} {lastInitial}.
                {profile.pronouns && (
                  <span className="ml-2 text-base font-normal text-gray-400">({profile.pronouns})</span>
                )}
              </h2>
              <div className="flex flex-wrap gap-3 mt-1">
                {profile.city && (
                  <p className="text-sm text-gray-500">📍 {profile.city}</p>
                )}
                <p className="text-sm text-gray-400">{Math.round(distanceKm)} km away</p>
              </div>
            </div>

            {/* Audience category pills */}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <span
                    key={cat}
                    className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}

            {/* Bio */}
            {profile.bio && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">About</h3>
                <p className="text-gray-700 leading-relaxed">{profile.bio}</p>
              </div>
            )}

            {/* Location of visits */}
            {profile.physical_address && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Location of Visits</h3>
                <p className="text-gray-700 leading-relaxed">{profile.physical_address}</p>
              </div>
            )}

            {/* Visiting on behalf of */}
            {isVisitingOther && (
              <>
                <hr className="border-gray-100" />
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-800">Arranging visits for someone else</p>
                  <p className="text-sm text-blue-700 mt-1">
                    {profile.relationship_to_recipient
                      ? `${profile.first_name} is the ${profile.relationship_to_recipient} of ${visitSubject}.`
                      : `Requesting visits for ${visitSubject}.`}
                  </p>
                </div>
              </>
            )}

            {/* Other pets */}
            {profile.other_pets_on_site && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm font-medium text-yellow-800">⚠️ Other pets on site</p>
                {profile.other_pets_description && (
                  <p className="text-sm text-yellow-700 mt-1">{profile.other_pets_description}</p>
                )}
              </div>
            )}

            {/* Additional notes */}
            {profile.additional_information && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Additional Notes</h3>
                <p className="text-gray-700 leading-relaxed text-sm">{profile.additional_information}</p>
              </div>
            )}

            {/* Chat CTA */}
            {dogId && (
              <div className="mt-auto pt-2">
                <ChatRequestButton
                  recipientId={individualId}
                  dogId={dogId}
                  onGoToChat={onGoToChat}
                />
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
