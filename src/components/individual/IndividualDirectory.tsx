'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useSupabaseClient } from '@/utils/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { optimizeSupabaseImage, getImageSizes } from '@/utils/imageOptimization';
import IndividualProfile from './IndividualProfile';

interface IndividualResult {
  id: string;
  first_name: string;
  last_initial: string;
  city: string | null;
  pronouns: string | null;
  profile_picture_url: string | null;
  distance_km: number;
}

interface IndividualDirectoryProps {
  onGoToChat: () => void;
}

export default function IndividualDirectory({ onGoToChat }: IndividualDirectoryProps) {
  const supabase = useSupabaseClient();
  const { user } = useUser();

  const [individuals, setIndividuals] = useState<IndividualResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [myDogId, setMyDogId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDistance, setSelectedDistance] = useState<number>(0);

  useEffect(() => {
    if (!user?.id) return;

    const fetchData = async () => {
      const [individualsRes, dogRes] = await Promise.all([
        supabase.rpc('get_individuals_for_volunteer', { volunteer_user_id: user.id }),
        supabase
          .from('dogs')
          .select('id')
          .eq('volunteer_id', user.id)
          .eq('status', 'approved')
          .maybeSingle(),
      ]);

      if (individualsRes.error) {
        console.error('Error fetching individuals:', individualsRes.error.message);
      } else {
        setIndividuals(individualsRes.data ?? []);
      }

      if (dogRes.data) setMyDogId(dogRes.data.id);

      setLoading(false);
    };

    fetchData();
  }, [user?.id]);

  const handleSelectProfile = (id: string, distanceKm: number) => {
    setSelectedId(id);
    setSelectedDistance(distanceKm);
  };

  if (selectedId) {
    return (
      <IndividualProfile
        individualId={selectedId}
        dogId={myDogId}
        distanceKm={selectedDistance}
        onBack={() => setSelectedId(null)}
        onGoToChat={onGoToChat}
      />
    );
  }

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-center text-gray-500">Finding people near you...</p>
      </div>
    );
  }

  if (individuals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center px-4 py-8 space-y-4 bg-white rounded-lg shadow-inner">
        <h3 className="text-lg font-semibold text-gray-800">No Matches Yet</h3>
        <p className="text-sm text-gray-600 max-w-sm">
          There are no individuals matching your preferences in your area right now. Check back soon!
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Connect with People</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {individuals.map((person) => (
          <div
            key={person.id}
            className="bg-white shadow-lg rounded-lg p-4 flex flex-col justify-between"
          >
            <div className="flex flex-col items-center text-center">
              {/* Profile picture */}
              <div className="relative w-20 h-20 overflow-hidden rounded-full bg-gray-100 mb-3">
                {person.profile_picture_url ? (
                  <Image
                    src={optimizeSupabaseImage(person.profile_picture_url, { width: 200, quality: 80 })}
                    alt={person.first_name}
                    fill
                    sizes={getImageSizes('thumbnail')}
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl text-gray-400">
                    {person.first_name[0]}
                  </div>
                )}
              </div>

              <h3 className="text-lg font-bold">
                {person.first_name} {person.last_initial}.
              </h3>

              {person.pronouns && (
                <p className="text-gray-500 text-sm">{person.pronouns}</p>
              )}

              {person.city && (
                <p className="text-gray-500 text-sm mt-0.5">📍 {person.city}</p>
              )}

              <p className="text-gray-400 text-xs mt-1">
                {Math.round(person.distance_km)} km away
              </p>
            </div>

            <Button
              className="w-full mt-4"
              onClick={() => handleSelectProfile(person.id, person.distance_km)}
            >
              View Profile
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
