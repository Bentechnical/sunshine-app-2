'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';

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

// This component represents an individual dog card with next available appointment
function DogCard({ dog, onSelectDog }: { dog: Dog; onSelectDog: (id: string) => void }) {
  const [nextAvailable, setNextAvailable] = useState<string>('Loading...');
  
  useEffect(() => {
    const fetchNextAvailable = async () => {
      const { data, error } = await supabase
        .from('appointment_availability')
        .select('*')
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
    };
    fetchNextAvailable();
  }, [dog]);
  
  return (
    <div className="bg-white shadow-lg rounded-lg p-4">
      <img
        src={dog.dog_picture_url || '/default-dog.png'}
        alt={dog.dog_name}
        className="w-full h-40 object-cover rounded-md"
      />
      <h3 className="text-xl font-bold mt-3">{dog.dog_name}</h3>
      <p>{dog.dog_breed} | Age: {dog.dog_age || 'Unknown'}</p>
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
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDogs = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('dogs').select('*');
      if (error) console.error('Error fetching dogs:', error);
      else setDogs(data);
      setLoading(false);
    };
    fetchDogs();
  }, []);

  return (
    <div>
      {loading ? (
        <p>Loading dogs...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dogs.map((dog) => (
            <DogCard key={dog.id} dog={dog} onSelectDog={onSelectDog} />
          ))}
        </div>
      )}
    </div>
  );
}
