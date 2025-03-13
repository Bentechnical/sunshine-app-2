'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/utils/supabase/client';

interface EditDogProfileProps {
  userId: string;
}

export default function EditDogProfile({ userId }: EditDogProfileProps) {
  const [dog, setDog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    dog_name: '',
    dog_breed: '',
    dog_age: '',
    dog_bio: '',
    dog_picture_url: '',
  });
  const [message, setMessage] = useState('');
  
  // Use a ref flag to prevent duplicate fetch/insert calls in development (StrictMode)
  const hasFetchedDog = useRef(false);

  useEffect(() => {
    // Only run this effect once per userId
    if (hasFetchedDog.current) return;
    hasFetchedDog.current = true;

    const fetchOrCreateDog = async () => {
      // Try to fetch the dog record for this volunteer
      const { data, error } = await supabase
        .from('dogs')
        .select('*')
        .eq('volunteer_id', userId)
        .maybeSingle();

      if (!data) {
        // No dog record found, so create a new one with empty/default values
        const { data: newDog, error: insertError } = await supabase
          .from('dogs')
          .insert({
            volunteer_id: userId,
            dog_name: '',
            dog_breed: '',
            dog_age: null,
            dog_bio: '',
            dog_picture_url: '',
          })
          .select()
          .maybeSingle();

        if (insertError) {
          console.error('Error creating dog profile:', insertError);
        } else {
          setDog(newDog);
          setForm({
            dog_name: newDog.dog_name || '',
            dog_breed: newDog.dog_breed || '',
            dog_age: newDog.dog_age ? newDog.dog_age.toString() : '',
            dog_bio: newDog.dog_bio || '',
            dog_picture_url: newDog.dog_picture_url || '',
          });
        }
      } else {
        // Dog record found—populate state with existing data
        setDog(data);
        setForm({
          dog_name: data.dog_name || '',
          dog_breed: data.dog_breed || '',
          dog_age: data.dog_age ? data.dog_age.toString() : '',
          dog_bio: data.dog_bio || '',
          dog_picture_url: data.dog_picture_url || '',
        });
      }
      setLoading(false);
    };

    fetchOrCreateDog();
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (dog) {
      // Update existing dog profile
      const { error } = await supabase
        .from('dogs')
        .update({
          dog_name: form.dog_name,
          dog_breed: form.dog_breed,
          dog_age: parseInt(form.dog_age),
          dog_bio: form.dog_bio,
          dog_picture_url: form.dog_picture_url,
        })
        .eq('volunteer_id', userId);

      if (error) {
        console.error('Error updating dog profile:', error);
        setMessage('Error updating dog profile.');
      } else {
        setMessage('Dog profile updated successfully!');
      }
    } else {
      // This branch should rarely occur since we auto-create a record on load
      const { error } = await supabase
        .from('dogs')
        .insert({
          volunteer_id: userId,
          dog_name: form.dog_name,
          dog_breed: form.dog_breed,
          dog_age: parseInt(form.dog_age),
          dog_bio: form.dog_bio,
          dog_picture_url: form.dog_picture_url,
        });
      if (error) {
        console.error('Error creating dog profile:', error);
        setMessage('Error creating dog profile.');
      } else {
        setMessage('Dog profile created successfully!');
      }
    }
  };

  if (loading) return <p>Loading dog profile...</p>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">My Dog Profile</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Dog Name</label>
          <input
            type="text"
            value={form.dog_name}
            onChange={(e) => setForm({ ...form, dog_name: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Dog Breed</label>
          <input
            type="text"
            value={form.dog_breed}
            onChange={(e) => setForm({ ...form, dog_breed: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Dog Age</label>
          <input
            type="number"
            value={form.dog_age}
            onChange={(e) => setForm({ ...form, dog_age: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Dog Bio</label>
          <textarea
            value={form.dog_bio}
            onChange={(e) => setForm({ ...form, dog_bio: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Dog Picture URL</label>
          <input
            type="text"
            value={form.dog_picture_url}
            onChange={(e) => setForm({ ...form, dog_picture_url: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
          Save Dog Profile
        </button>
      </form>
      {message && <p className="mt-4 text-green-600">{message}</p>}
    </div>
  );
}
