//src/components/dog/EditDogProfile.tsx

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useSupabaseClient } from '@/utils/supabase/client'; // ✅ new import

export default function EditDogProfile() {
  const { user } = useUser();
  const supabase = useSupabaseClient(); // ✅ new client
  const userId = user?.id;


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
  const hasFetchedDog = useRef(false);

  useEffect(() => {
    if (!userId || hasFetchedDog.current) return;
    hasFetchedDog.current = true;

    const fetchOrCreateDog = async () => {
      console.log('Fetching dog for userId:', userId);

      const { data, error } = await supabase
        .from('dogs')
        .select('*')
        .eq('volunteer_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching dog profile:', error);
        setMessage('Error loading dog profile.');
        setLoading(false);
        return;
      }

      if (!data) {
        // No dog record found, optionally create a blank one
        console.log('No dog profile found. Creating a new one.');

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
          setMessage('Error creating dog profile.');
        } else {
          setDog(newDog);
          setForm({
            dog_name: '',
            dog_breed: '',
            dog_age: '',
            dog_bio: '',
            dog_picture_url: '',
          });
        }
      } else {
        // Dog profile exists
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

    if (!userId || !dog) return;

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
  };

  if (!userId) return <p>Loading user...</p>;
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
