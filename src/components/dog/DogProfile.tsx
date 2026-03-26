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
        .select('first_name, city, general_availability')
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
    <div className="flex flex-col gap-4 h-auto lg:h-[90vh] px-4 pb-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-y-6 lg:gap-6 flex-1">

        {/* Left Column - Dog Info */}
        <div className="col-span-1 bg-white shadow-lg rounded-lg p-4 flex flex-col">
          <div className="mb-4">
            <button
              className="text-lg text-[#0e62ae] font-semibold hover:underline"
              onClick={onBack}
            >
              ← Back to Dogs
            </button>
          </div>
          <div className="relative aspect-square w-full overflow-hidden rounded-lg">
            <Image
              src={optimizeSupabaseImage(dog.dog_picture_url, { width: 600, quality: 80 })}
              alt={dog.dog_name}
              fill
              sizes={getImageSizes('profile')}
              className="object-cover"
              priority={false}
            />
          </div>
          <h3 className="text-xl font-bold mt-3">{dog.dog_name}</h3>
          <p className="text-gray-700">
            {dog.dog_breed} | Age: {dog.dog_age ?? 'Unknown'}
          </p>
          <p className="text-gray-600 mt-2">{dog.dog_bio}</p>
          <p className="text-gray-800 mt-2">
            <strong>Volunteer:</strong> {volunteer?.first_name || 'Unknown'}
          </p>
          {volunteer?.city && (
            <p className="text-gray-600 text-sm mt-1">📍 {volunteer.city}</p>
          )}
        </div>

        {/* Right Column - Connect (Phase 3: chat request button goes here) */}
        <div className="col-span-2 bg-white shadow-lg rounded-lg p-4">
          {volunteer?.general_availability && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600">
                🕐 <strong>Usually available:</strong> {volunteer.general_availability}
              </p>
            </div>
          )}
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
  );
}
