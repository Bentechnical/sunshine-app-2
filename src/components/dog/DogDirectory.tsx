'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useSupabaseClient } from '@/utils/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { optimizeSupabaseImage, getImageSizes } from '@/utils/imageOptimization';

interface DogResult {
  dog_id: number;
  dog_name: string;
  dog_breed: string;
  dog_age: number | null;
  dog_bio: string;
  dog_picture_url: string;
  volunteer_id: string;
  volunteer_first_name: string;
  volunteer_last_initial: string;
  volunteer_city: string;
  general_availability: string | null;
  distance_km: number;
  matching_categories: string[];
}

interface DogDirectoryProps {
  onSelectDog: (dogId: string) => void;
}

export default function DogDirectory({ onSelectDog }: DogDirectoryProps) {
  const supabase = useSupabaseClient();
  const { user } = useUser();

  const [dogs, setDogs] = useState<DogResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDogs = async () => {
      if (!user?.id) return;

      const [dogsRes, snoozeRes] = await Promise.all([
        supabase.rpc('get_dogs_for_individual', { individual_user_id: user.id }),
        supabase
          .from('chat_requests')
          .select('requester_id, recipient_id')
          .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .gt('snoozed_until', new Date().toISOString()),
      ]);

      if (dogsRes.error) {
        console.error('Error fetching dogs:', dogsRes.error.message);
        setLoading(false);
        return;
      }

      // Build a set of snoozed volunteer IDs (the other party in each snooze record)
      const snoozedIds = new Set(
        (snoozeRes.data ?? []).map(r =>
          r.requester_id === user.id ? r.recipient_id : r.requester_id
        )
      );

      const filtered = (dogsRes.data ?? []).filter(
        (d: DogResult) => !snoozedIds.has(d.volunteer_id)
      );

      setDogs(filtered);
      setLoading(false);
    };

    fetchDogs();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-center text-gray-500">Loading nearby therapy dogs...</p>
      </div>
    );
  }

  if (dogs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center px-4 py-8 space-y-4 bg-white rounded-lg shadow-inner">
        <div className="relative w-32 h-32">
          <Image
            src="/images/missing_dog.png"
            alt="No therapy dogs found"
            fill
            sizes="128px"
            className="object-contain opacity-80"
          />
        </div>
        <h3 className="text-lg font-semibold text-gray-800">No Therapy Dogs Nearby</h3>
        <p className="text-sm text-gray-600 max-w-sm">
          There are no therapy dogs matching your profile in your area right now. Check back soon!
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Meet Our Therapy Dogs</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dogs.map((dog) => (
          <div
            key={dog.dog_id}
            className="bg-white shadow-lg rounded-xl overflow-hidden flex flex-col"
          >
            {/* Square image — full bleed at top */}
            <div className="relative aspect-square w-full bg-gray-100">
              <Image
                src={optimizeSupabaseImage(dog.dog_picture_url, { width: 600, quality: 80 })}
                alt={dog.dog_name}
                fill
                sizes={getImageSizes('card')}
                className="object-cover"
                priority={false}
              />
            </div>

            {/* Card content */}
            <div className="p-4 flex flex-col gap-3 flex-1">

              {/* Name + breed/age pills */}
              <div>
                <h3 className="text-lg font-bold text-gray-900">{dog.dog_name}</h3>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                    {dog.dog_breed}
                  </span>
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                    {dog.dog_age != null ? `${dog.dog_age} yr${dog.dog_age === 1 ? '' : 's'} old` : 'Age unknown'}
                  </span>
                </div>
              </div>

              {/* Bio excerpt */}
              {dog.dog_bio && (
                <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
                  {dog.dog_bio}
                </p>
              )}

              {/* Handler info */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {dog.volunteer_first_name} {dog.volunteer_last_initial}.
                  </p>
                  <p className="text-xs text-gray-500">📍 {dog.volunteer_city}</p>
                </div>
                <span className="text-xs text-gray-400">{Math.round(dog.distance_km)} km away</span>
              </div>

              {/* CTA */}
              <div className="mt-auto pt-1">
                <Button
                  onClick={() => onSelectDog(String(dog.dog_id))}
                  className="w-full"
                >
                  View Profile
                </Button>
              </div>

            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
