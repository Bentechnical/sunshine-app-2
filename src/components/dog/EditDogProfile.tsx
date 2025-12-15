// src/components/dog/EditDogProfile.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useSupabaseClient } from '@/utils/supabase/client';
import AvatarUpload, { AvatarUploadHandle } from '@/components/profile/AvatarUpload';

interface EditDogProfileProps {
  onSaveComplete?: () => void;
}

export default function EditDogProfile({ onSaveComplete }: EditDogProfileProps) {
  const { user } = useUser();
  const supabase = useSupabaseClient();
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
  const [isUploading, setIsUploading] = useState(false);
  const hasFetchedDog = useRef(false);
  const avatarUploadRef = useRef<AvatarUploadHandle>(null);

  useEffect(() => {
    if (!userId || hasFetchedDog.current) return;
    hasFetchedDog.current = true;

    const fetchOrCreateDog = async () => {
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
        const { data: newDog, error: insertError } = await supabase
          .from('dogs')
          .insert({
            volunteer_id: userId,
            dog_name: '',
            dog_breed: '',
            dog_age: null,
            dog_bio: '',
            dog_picture_url: null,
          })
          .select()
          .maybeSingle();

        if (insertError) {
          console.error('Error creating dog profile:', insertError);
          setMessage('Error creating dog profile.');
        } else {
          setDog(newDog);
        }
      } else {
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

    if (isUploading) {
      alert('Please wait for the image to finish uploading.');
      return;
    }

    const { error } = await supabase
      .from('dogs')
      .update({
        dog_name: form.dog_name,
        dog_breed: form.dog_breed,
        dog_age: parseInt(form.dog_age),
        dog_bio: form.dog_bio,
        dog_picture_url: form.dog_picture_url?.trim() || null,
      })
      .eq('volunteer_id', userId);

    if (error) {
      console.error('Error updating dog profile:', error);
      setMessage('Error updating dog profile.');
    } else {
      setMessage('Dog profile updated successfully!');
      if (onSaveComplete) onSaveComplete();
    }
  };

  if (!userId) return <p>Loading user...</p>;
  if (loading) return <p>Loading dog profile...</p>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">My Dog Profile</h2>
      <form onSubmit={handleSubmit} className="space-y-4">

        <div className="flex items-center gap-4">
          <div className="relative w-24 aspect-square rounded-lg overflow-hidden shadow-md border border-gray-300">
            <AvatarUpload
              ref={avatarUploadRef}
              initialUrl={form.dog_picture_url}
              fallbackUrl="/images/default_dog.png"
              altText="Dog Profile Picture"
              onUpload={(url) => {
                setIsUploading(false);
                setForm((prev) => ({ ...prev, dog_picture_url: url }));
              }}
            />
          </div>
          <span
          className="font-medium text-blue-600 cursor-pointer hover:text-blue-700 hover:underline"
          onClick={() => avatarUploadRef.current?.triggerClick()}
        >
          Change Dog Picture
        </span>
        </div>

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

        <button
          type="submit"
          className="w-full py-3 px-4 bg-[#0e62ae] text-white rounded-md hover:bg-[#094e8b] transition font-semibold"

          disabled={isUploading}
        >
          {isUploading ? 'Uploading...' : 'Save Dog Profile'}
        </button>

        {message && <p className="mt-4 text-green-600">{message}</p>}
      </form>
    </div>
  );
}
