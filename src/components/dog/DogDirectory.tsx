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
            className="bg-white shadow-lg rounded-lg p-4 flex flex-col justify-between"
          >
            <div>
              <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                <Image
                  src={optimizeSupabaseImage(dog.dog_picture_url, { width: 600, quality: 80 })}
                  alt={dog.dog_name}
                  fill
                  sizes={getImageSizes('card')}
                  className="object-cover"
                  priority={false}
                />
              </div>

              <h3 className="text-xl font-bold mt-3">{dog.dog_name}</h3>
              <p className="text-gray-600 text-sm">
                {dog.dog_breed} · Age {dog.dog_age ?? '?'}
              </p>

              <p className="text-gray-600 text-sm mt-2">
                With {dog.volunteer_first_name} {dog.volunteer_last_initial}. · 📍 {dog.volunteer_city}
              </p>

              <p className="text-gray-400 text-xs mt-1">{Math.round(dog.distance_km)} km away</p>
            </div>

            <Button
              onClick={() => onSelectDog(String(dog.dog_id))}
              className="w-full mt-4"
            >
              View Profile
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
