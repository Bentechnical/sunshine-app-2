// src/components/dog/DogDirectory.tsx

'use client';

import React, { useEffect, useState } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';

interface DogWithAvailability {
  id: number;
  dog_name: string;
  dog_breed: string;
  dog_age: number | null;
  dog_bio: string;
  dog_picture_url: string;
  volunteer_id: string;
  next_available: string | null;
  volunteer_name: string | null;
}

interface DogDirectoryProps {
  onSelectDog: (dogId: string) => void;
}

export default function DogDirectory({ onSelectDog }: DogDirectoryProps) {
  const supabase = useSupabaseClient();
  const { user } = useUser();

  const [dogs, setDogs] = useState<DogWithAvailability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNearbyDogs = async () => {
      if (!user?.id) return;

      // Step 1: Fetch user’s location
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('location_lat, location_lng')
        .eq('id', user.id)
        .single();

      if (userError || !userData) {
        console.error('Failed to fetch user location:', userError);
        return;
      }

      const { location_lat, location_lng } = userData;

      if (!location_lat || !location_lng) {
        console.warn('User does not have a saved location.');
        return;
      }

      // Step 2: Fetch dogs near that location
      const { data, error } = await supabase.rpc('get_nearby_dogs_with_availability', {
        user_lat: location_lat,
        user_lng: location_lng,
      });

      if (error || !data) {
        console.error('Error fetching dogs:', error?.message || error);
        return;
      }

      setDogs(data as DogWithAvailability[]);
      setLoading(false);
    };

    fetchNearbyDogs();
  }, [user?.id]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  };

  if (loading) {
  return (
    <div className="p-4">
      <p className="text-center text-gray-500">Loading nearby therapy dogs...</p>
    </div>
  );
}

if (dogs.length === 0) {
  return (
    <div className="p-6 text-center text-gray-600 flex flex-col items-center justify-center min-h-[60vh]">
      <img
        src="/images/no_dogs_found.png"
        alt="No dogs found"
        className="mb-6 max-w-xs sm:max-w-sm md:max-w-md w-full h-auto object-contain opacity-90"
      />
      <h2 className="text-2xl font-semibold mb-2 text-gray-800">No therapy dogs nearby</h2>
      <p className="text-base text-gray-600 max-w-md">
        We couldn't find any dogs currently available in your area. Please check back later.
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
            key={dog.id}
            className="bg-white shadow-lg rounded-lg p-4 flex flex-col justify-between min-h-[500px]"
          >
            <div>
              <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                <img
                  src={dog.dog_picture_url || '/images/default_dog.png'}
                  alt={dog.dog_name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>

              <h3 className="text-xl font-bold mt-3">{dog.dog_name}</h3>
              <p className="text-gray-700">
                {dog.dog_breed} | Age: {dog.dog_age ?? 'Unknown'}
              </p>
              <p className="text-gray-600 mt-2">{dog.dog_bio}</p>
              <p className="text-gray-800 mt-2">
                <strong>Next Available:</strong>{' '}
                {dog.next_available ? formatDate(dog.next_available) : 'No availability'}
              </p>
              <p className="text-gray-600">
                <strong>Volunteer:</strong> {dog.volunteer_name ?? 'Unknown'}
              </p>
            </div>
            <Button
              onClick={() => onSelectDog(String(dog.id))}
              className="w-full mt-4"
            >
              View Availability
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
