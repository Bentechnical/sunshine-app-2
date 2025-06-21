// src/components/dashboard/fragments/SuggestedDogsPreview.tsx

'use client';

import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

interface Dog {
  id: number;
  dog_name: string;
  dog_picture_url: string;
}

interface Props {
  setActiveTab: (
    tab: 'dashboard-home' | 'my-visits' | 'meet-with-dog' | 'messaging' | 'my-therapy-dog'
  ) => void;
}

export default function SuggestedDogsPreview({ setActiveTab }: Props) {
  const supabase = useSupabaseClient();
  const [dogs, setDogs] = useState<Dog[]>([]);

  useEffect(() => {
    const fetchDogs = async () => {
      const { data, error } = await supabase.rpc('get_dogs_with_next_availability');
      if (error) {
        console.error('Error fetching suggested dogs:', error);
        return;
      }
      if (Array.isArray(data)) {
        setDogs(data.slice(0, 3)); // Limit to 3 dogs
      }
    };
    fetchDogs();
  }, [supabase]);

  return (
    <div className="rounded-lg p-3 flex flex-col min-h-[240px]">
      <p className="text-gray-800 mb-2 ml-1 text-sm">
        Not sure who to book with? Here are some great dogs available this week:
      </p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {dogs.map((dog) => (
          <div key={dog.id} className="flex flex-col items-center">
            <div className="relative w-full aspect-square rounded-md overflow-hidden">
              <Image
                src={dog.dog_picture_url || '/images/default_dog.png'}
                alt={dog.dog_name}
                fill
                className="object-cover"
              />
            </div>
            <p className="mt-1 text-sm font-medium text-center">{dog.dog_name}</p>
          </div>
        ))}
      </div>

      <Button
        className="w-full mt-auto"
        onClick={() => setActiveTab('meet-with-dog')}
      >
        Explore Dogs
      </Button>
    </div>
  );
}
