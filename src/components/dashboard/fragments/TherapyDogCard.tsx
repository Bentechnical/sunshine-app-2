// src/components/dashboard/fragments/TherapyDogCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EditDogProfile from '@/components/dog/EditDogProfile';

interface Dog {
  dog_name: string;
  dog_breed: string;
  dog_bio: string;
  dog_age: number | null;
  dog_picture_url: string | null;
}

export default function TherapyDogCard() {
  const { user } = useUser();
  const supabase = useSupabaseClient();

  const [dog, setDog] = useState<Dog | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [refreshFlag, setRefreshFlag] = useState(0);

  useEffect(() => {
    if (!user?.id) return;

    const fetchDog = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('dogs')
          .select('dog_name, dog_breed, dog_bio, dog_age, dog_picture_url')
          .eq('volunteer_id', user.id)
          .single();

        if (error) console.error('[TherapyDogCard] Fetch error:', error);
        setDog(data ?? null);
      } catch (err) {
        console.error('[TherapyDogCard] Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDog();
  }, [user?.id, refreshFlag]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[150px]">
        <Loader2 className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (editing) {
    return (
      <EditDogProfile
        key={refreshFlag}
        onSaveComplete={() => {
          setEditing(false);
          setRefreshFlag((prev) => prev + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-4 pt-1 px-2 flex flex-col lg:flex-1 pb-3">
      <h2 className="text-xl font-bold">My Therapy Dog</h2>
      <div className="flex flex-col bg-white rounded-lg">
        <div className="rounded-lg overflow-hidden shadow-md aspect-[4/3] md:aspect-video lg:aspect-square">
          <img
            src={dog?.dog_picture_url || '/images/default_dog.png'}
            alt={dog?.dog_name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="pt-3 px-4">
          <h3 className="text-lg font-bold">{dog?.dog_name}</h3>
          <p className="text-gray-700">
            {dog?.dog_breed || 'Unknown breed'}
            {typeof dog?.dog_age === 'number' ? ` | Age: ${dog.dog_age}` : ''}
          </p>
          <p className="text-gray-600 text-sm mt-2">{dog?.dog_bio}</p>
        </div>
        <div className="pt-3 px-4 pb-4 mt-auto">
          <Button className="w-full" onClick={() => setEditing(true)}>
            Edit Dog Profile
          </Button>
        </div>
      </div>
    </div>
  );
}
