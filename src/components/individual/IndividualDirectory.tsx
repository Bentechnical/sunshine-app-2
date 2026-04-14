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
  bio: string | null;
  profile_picture_url: string | null;
  distance_km: number;
  matching_categories: string[] | null;
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
            className="bg-white shadow-lg rounded-xl overflow-hidden flex flex-col"
          >
            {/* Square image */}
            <div className="relative aspect-square w-full bg-gray-100">
              {person.profile_picture_url ? (
                <Image
                  src={optimizeSupabaseImage(person.profile_picture_url, { width: 600, quality: 80 })}
                  alt={person.first_name}
                  fill
                  sizes={getImageSizes('card')}
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl text-gray-400">
                  {person.first_name[0]}
                </div>
              )}
            </div>

            {/* Card content */}
            <div className="p-4 flex flex-col gap-3 flex-1">

              {/* Name + pronouns */}
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {person.first_name} {person.last_initial}.
                  {person.pronouns && (
                    <span className="ml-1.5 text-sm font-normal text-gray-400">({person.pronouns})</span>
                  )}
                </h3>
                <div className="flex items-center gap-3 mt-0.5">
                  {person.city && (
                    <p className="text-gray-500 text-sm">📍 {person.city}</p>
                  )}
                  <p className="text-gray-400 text-xs">{Math.round(person.distance_km)} km away</p>
                </div>
              </div>

              {/* Audience category pills */}
              {person.matching_categories && person.matching_categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {person.matching_categories.map((cat) => (
                    <span
                      key={cat}
                      className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}

              {/* Bio excerpt */}
              {person.bio && (
                <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
                  {person.bio}
                </p>
              )}

              {/* CTA */}
              <div className="mt-auto pt-1">
                <Button
                  className="w-full"
                  onClick={() => handleSelectProfile(person.id, person.distance_km)}
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
