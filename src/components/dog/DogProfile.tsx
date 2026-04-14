// src/components/dog/DogProfile.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useSupabaseClient } from '@/utils/supabase/client';
import { optimizeSupabaseImage, getImageSizes } from '@/utils/imageOptimization';
import ChatRequestButton from '@/components/chat/ChatRequestButton';

interface Dog {
  id: number;
  volunteer_id: string;
  dog_name: string;
  dog_breed: string;
  dog_age: number | null;
  dog_bio: string;
  dog_picture_url: string;
}

interface Volunteer {
  first_name: string;
  city: string | null;
  general_availability: string | null;
  profile_image: string | null;
  bio: string | null;
  pronouns: string | null;
}

interface DogProfileProps {
  dogId: string;
  onBack: () => void;
  onGoToChat: () => void;
}

export default function DogProfile({ dogId, onBack, onGoToChat }: DogProfileProps) {
  const supabase = useSupabaseClient();

  const [dog, setDog] = useState<Dog | null>(null);
  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDogData() {
      const { data: dogData } = await supabase.from('dogs').select('*').eq('id', dogId).single();
      if (!dogData) return setLoading(false);
      setDog(dogData);

      const { data: volunteerData } = await supabase
        .from('users')
        .select('first_name, city, general_availability, profile_image, bio, pronouns')
        .eq('id', dogData.volunteer_id)
        .single();
      if (volunteerData) setVolunteer(volunteerData);

      setLoading(false);
    }

    fetchDogData();
  }, [dogId]);

  if (loading) return <p>Loading...</p>;
  if (!dog) return <p>Dog not found.</p>;

  return (
    <div className="px-4 pb-4">
      <div className="bg-white shadow-lg rounded-xl p-5 flex flex-col gap-5">

        {/* Back button */}
        <button
          className="text-sm text-[#0e62ae] font-semibold hover:underline self-start"
          onClick={onBack}
        >
          ← Back to Dogs
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column - Image only */}
          <div className="col-span-1">
            <div className="relative aspect-square w-full overflow-hidden rounded-xl">
              <Image
                src={optimizeSupabaseImage(dog.dog_picture_url, { width: 600, quality: 80 })}
                alt={dog.dog_name}
                fill
                sizes={getImageSizes('profile')}
                className="object-cover"
                priority={false}
              />
            </div>
          </div>

          {/* Right Column - All profile details + CTA */}
          <div className="col-span-2 flex flex-col gap-5">

            {/* Name + badges */}
            <div>
              <h2 className="text-3xl font-bold text-gray-900">{dog.dog_name}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                  {dog.dog_breed}
                </span>
                <span className="px-3 py-1 bg-amber-100 text-amber-800 text-sm font-medium rounded-full">
                  {dog.dog_age != null ? `${dog.dog_age} yr${dog.dog_age === 1 ? '' : 's'} old` : 'Age unknown'}
                </span>
              </div>
            </div>

            {/* Dog bio */}
            {dog.dog_bio && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">About</h3>
                <p className="text-gray-700 leading-relaxed">{dog.dog_bio}</p>
              </div>
            )}

            <hr className="border-gray-100" />

            {/* Volunteer info */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Handler</h3>
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="relative w-1/4 aspect-square rounded-xl overflow-hidden shrink-0 bg-blue-100">
                  {volunteer?.profile_image ? (
                    <Image
                      src={optimizeSupabaseImage(volunteer.profile_image, { width: 300, quality: 80 })}
                      alt={volunteer.first_name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-blue-700 font-bold text-3xl">
                      {volunteer?.first_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>

                {/* Name, pronouns, city */}
                <div className="flex flex-col gap-0.5">
                  <p className="font-semibold text-gray-900 text-lg leading-tight">
                    {volunteer?.first_name || 'Unknown'}
                    {volunteer?.pronouns && (
                      <span className="ml-2 text-sm font-normal text-gray-400">({volunteer.pronouns})</span>
                    )}
                  </p>
                  {volunteer?.city && (
                    <p className="text-sm text-gray-500">📍 {volunteer.city}</p>
                  )}
                  {volunteer?.bio && (
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">{volunteer.bio}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Availability */}
            {volunteer?.general_availability && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  🕐 <strong>Usually available:</strong> {volunteer.general_availability}
                </p>
              </div>
            )}

            {/* Chat CTA */}
            <div className="mt-auto pt-2">
              {dog && (
                <ChatRequestButton
                  recipientId={dog.volunteer_id}
                  dogId={dog.id}
                  onGoToChat={onGoToChat}
                />
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
