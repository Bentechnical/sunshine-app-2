'use client';

import React, { useEffect, useState } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';

interface Dog {
  id: number;
  volunteer_id: string;
  dog_name: string;
  dog_breed: string;
  dog_age: number | null;
  dog_bio: string;
  dog_picture_url: string;
}

interface DogDirectoryProps {
  onSelectDog: (id: string) => void;
}

function DogCard({
  dog,
  onSelectDog,
}: {
  dog: Dog;
  onSelectDog: (id: string) => void;
}) {
  const supabase = useSupabaseClient();
  const [nextAvailable, setNextAvailable] = useState<string>('Loading...');

  useEffect(() => {
    if (!supabase) return;

    async function fetchNextAvailability() {
      const { data, error } = await supabase
        .from('appointment_availability')
        .select('start_time')
        .eq('volunteer_id', dog.volunteer_id)
        .gt('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching next availability:', error);
        setNextAvailable('Error');
      } else if (data) {
        setNextAvailable(new Date(data.start_time).toLocaleString());
      } else {
        setNextAvailable('No availability');
      }
    }

    fetchNextAvailability();
  }, [dog.volunteer_id, supabase]);

  return (
    <div className="bg-white shadow-lg rounded-lg p-4">
      <img
        src={dog.dog_picture_url || 'images/default-dog.png'}
        alt={dog.dog_name}
        className="w-full h-40 object-cover rounded-md"
      />
      <h3 className="text-xl font-bold mt-3">{dog.dog_name}</h3>
      <p>
        {dog.dog_breed} | Age: {dog.dog_age ?? 'Unknown'}
      </p>
      <p className="text-gray-600 mt-2">{dog.dog_bio}</p>
      <p className="text-gray-800 mt-2">
        <strong>Next Available:</strong> {nextAvailable}
      </p>
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded mt-4"
        onClick={() => onSelectDog(dog.id.toString())}
      >
        View Availability
      </button>
    </div>
  );
}

export default function DogDirectory({ onSelectDog }: DogDirectoryProps) {
  const supabase = useSupabaseClient();
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!supabase) return;

    async function fetchDogs() {
      const { data, error } = await supabase.from('dogs').select('*');
      if (error) {
        console.error('Error fetching dogs:', error);
        setDogs([]);
      } else {
        +   setDogs(data as Dog[]);     // cast here if you need strict Dog[]
      }
      setLoading(false);
    }

    fetchDogs();
  }, [supabase]);

  if (loading) {
    return <p>Loading dogs…</p>;
  }

  if (dogs.length === 0) {
    return <p>No dogs found.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {dogs.map((dog) => (
        <DogCard key={dog.id} dog={dog} onSelectDog={onSelectDog} />
      ))}
    </div>
  );
}
