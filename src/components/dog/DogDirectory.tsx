// src/components/dog/DogDirectory.tsx

'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useSupabaseClient } from '@/utils/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { optimizeSupabaseImage, getImageSizes } from '@/utils/imageOptimization';

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
  audience_categories?: string[];
  has_matching_categories?: boolean;
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

      // Step 1: Fetch user's location
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('location_lat, location_lng, role')
        .eq('id', user.id)
        .single();

      if (userError || !userData) {
        console.error('Failed to fetch user data:', userError);
        setLoading(false);
        return;
      }

      const { location_lat, location_lng, role } = userData;

      if (!location_lat || !location_lng) {
        console.warn('User does not have a saved location.');
        setLoading(false);
        return;
      }

      // Step 1.5: Fetch user's audience categories separately
      let userCategories: string[] = [];
      if (role === 'individual') {
        const { data: audienceData, error: audienceError } = await supabase
          .from('individual_audience_tags')
          .select(`
            category_id,
            audience_categories (name)
          `)
          .eq('individual_id', user.id);

        if (audienceError) {
          console.error('Failed to fetch audience categories:', audienceError);
        } else if (audienceData) {
          userCategories = audienceData
            .map((tag: any) => tag.audience_categories?.name)
            .filter(Boolean);
        }
      }

      // Step 2: Fetch dogs near that location with audience preferences
      const { data, error } = await supabase.rpc('get_nearby_dogs_with_availability', {
        user_lat: location_lat,
        user_lng: location_lng,
      });

      if (error || !data) {
        console.error('Error fetching dogs:', error?.message || error);
        setLoading(false);
        return;
      }



      // Step 3: Process audience categories (now included in view - no extra queries!)
      // The audience_categories column is now returned by the database view as JSONB
      const dogsWithAudience = (data as any[]).map((dog) => {
        // Extract category names from the JSONB array returned by the view
        const volunteerCategories: string[] =
          dog.audience_categories?.map((cat: any) => cat.name) || [];

        // Check for matching categories
        const hasMatchingCategories = userCategories.length > 0 &&
          volunteerCategories.length > 0 &&
          userCategories.some(cat => volunteerCategories.includes(cat));

        return {
          ...dog,
          audience_categories: volunteerCategories,
          has_matching_categories: hasMatchingCategories
        };
      });

      // Filter to only show matching dogs
      const matchingDogs = dogsWithAudience.filter(dog => dog.has_matching_categories);

      setDogs(matchingDogs);
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
      <div className="flex flex-col items-center justify-center text-center px-4 py-8 space-y-4 bg-white rounded-lg shadow-inner">
        <div className="relative w-32 h-32">
          <Image
            src="/images/missing_dog.png"
            alt="No available therapy dogs"
            fill
            sizes="128px"
            className="object-contain opacity-80"
          />
        </div>
        <h3 className="text-lg font-semibold text-gray-800">
          No Therapy Dogs Available
        </h3>
        <p className="text-sm text-gray-600 max-w-sm">
          It looks like there are no therapy dogs currently available in your area. New dogs are added regularly — please check back again soon!
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
              <p className="text-gray-700">
                {dog.dog_breed} | Age: {dog.dog_age ?? 'Unknown'}
              </p>
              <p className="text-gray-600 mt-2">{dog.dog_bio}</p>
              
              
              
              <p className="text-gray-800 mt-2">
                <strong>Next Available:</strong>{' '}
                {dog.next_available ? formatDate(dog.next_available) : 'No availability'}
              </p>
              <p className="text-gray-600">
                <strong>Volunteer:</strong> {dog.volunteer_name ? dog.volunteer_name.split(' ')[0] : 'Unknown'}
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
