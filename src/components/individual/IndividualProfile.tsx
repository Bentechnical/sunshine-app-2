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
            'first_name, last_name, pronouns, bio, city, profile_image, visit_recipient_type, relationship_to_recipient, dependant_name, additional_information, other_pets_on_site, other_pets_description'
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
    <div className="flex flex-col gap-4 h-auto lg:h-[90vh] px-4 pb-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-y-6 lg:gap-6 flex-1">

        {/* Left Column */}
        <div className="col-span-1 bg-white shadow-lg rounded-lg p-4 flex flex-col">
          <div className="mb-4">
            <button
              className="text-lg text-[#0e62ae] font-semibold hover:underline"
              onClick={onBack}
            >
              ← Back to Browse
            </button>
          </div>

          {/* Profile image */}
          <div className="relative w-40 h-40 mx-auto overflow-hidden rounded-full bg-gray-100">
            {profile.profile_image ? (
              <Image
                src={optimizeSupabaseImage(profile.profile_image, { width: 400, quality: 80 })}
                alt={profile.first_name}
                fill
                sizes={getImageSizes('thumbnail')}
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl text-gray-400">
                {profile.first_name[0]}
              </div>
            )}
          </div>

          <h3 className="text-xl font-bold mt-4 text-center">
            {profile.first_name} {lastInitial}.
          </h3>

          {profile.pronouns && (
            <p className="text-gray-500 text-sm text-center mt-1">{profile.pronouns}</p>
          )}

          {profile.city && (
            <p className="text-gray-500 text-sm text-center mt-1">📍 {profile.city}</p>
          )}

          <p className="text-gray-400 text-xs text-center mt-1">
            {Math.round(distanceKm)} km away
          </p>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-4 justify-center">
              {categories.map((cat) => (
                <span
                  key={cat}
                  className="text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}

          {dogId && (
            <div className="mt-auto pt-4">
              <ChatRequestButton
                recipientId={individualId}
                dogId={dogId}
                onGoToChat={onGoToChat}
              />
            </div>
          )}
        </div>

        {/* Right Column — Details */}
        <div className="col-span-2 bg-white shadow-lg rounded-lg p-4 flex flex-col gap-4">

          {/* Visiting on behalf of */}
          {isVisitingOther && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-800">Arranging visits for someone else</p>
              <p className="text-sm text-blue-700 mt-1">
                {profile.relationship_to_recipient
                  ? `${profile.first_name} is the ${profile.relationship_to_recipient} of ${visitSubject}.`
                  : `Requesting visits for ${visitSubject}.`}
              </p>
            </div>
          )}

          {/* Bio */}
          {profile.bio && (
            <div>
              <h4 className="font-semibold text-gray-800 mb-1">About</h4>
              <p className="text-gray-600 text-sm">{profile.bio}</p>
            </div>
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

          {/* Additional information */}
          {profile.additional_information && (
            <div>
              <h4 className="font-semibold text-gray-800 mb-1">Additional Notes</h4>
              <p className="text-gray-600 text-sm">{profile.additional_information}</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
