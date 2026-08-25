'use client';

import { useState, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { X } from 'lucide-react';
import AvatarUpload, { AvatarUploadHandle } from '@/components/profile/AvatarUpload';

interface InitialDog {
  dog_name: string;
  dog_breed: string;
  dog_bio: string;
  dog_age: number | null;
  dog_picture_url: string | null;
}

interface Props {
  initialDog: InitialDog;
  onClose: () => void;
  onSaved: () => void;
}

export default function DogEditModal({ initialDog, onClose, onSaved }: Props) {
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const dogAvatarRef = useRef<AvatarUploadHandle>(null);

  // Dog info form state
  const [dogName, setDogName] = useState(initialDog.dog_name);
  const [dogBreed, setDogBreed] = useState(initialDog.dog_breed);
  const [dogAge, setDogAge] = useState(initialDog.dog_age?.toString() ?? '');
  const [dogBio, setDogBio] = useState(initialDog.dog_bio);
  const dogPictureRef = useRef(initialDog.dog_picture_url ?? '');
  const [saving, setSaving] = useState(false);
  const [dogError, setDogError] = useState<string | null>(null);

  const handleSaveDog = async () => {
    if (!user?.id) return;
    if (!dogName.trim()) { setDogError("Dog's name is required."); return; }

    setSaving(true);
    setDogError(null);

    const { error } = await supabase
      .from('dogs')
      .update({
        dog_name: dogName.trim(),
        dog_breed: dogBreed.trim(),
        dog_age: dogAge ? parseInt(dogAge) : null,
        dog_bio: dogBio.trim(),
        dog_picture_url: dogPictureRef.current || null,
      })
      .eq('volunteer_id', user.id);

    setSaving(false);

    if (error) {
      setDogError('Failed to save. Please try again.');
      return;
    }

    onSaved();
    onClose();
  };

  const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const lc = 'block text-sm font-semibold text-gray-700 mb-1.5';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Edit Dog Profile</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          <div className="space-y-5">

            {/* Dog photo */}
            <div className="flex items-center gap-4">
              <AvatarUpload
                ref={dogAvatarRef}
                initialUrl={dogPictureRef.current}
                fallbackUrl="/images/default_dog.png"
                onUpload={url => { dogPictureRef.current = url; }}
                size={72}
                altText="Dog photo"
              />
              <button
                type="button"
                onClick={() => dogAvatarRef.current?.triggerClick()}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Change photo
              </button>
            </div>

            {/* Name */}
            <div>
              <label className={lc}>Dog&apos;s Name</label>
              <input
                type="text"
                value={dogName}
                onChange={e => setDogName(e.target.value)}
                placeholder="e.g., Buddy"
                className={ic}
              />
            </div>

            {/* Breed */}
            <div>
              <label className={lc}>Breed</label>
              <input
                type="text"
                value={dogBreed}
                onChange={e => setDogBreed(e.target.value)}
                placeholder="e.g., Golden Retriever"
                className={ic}
              />
            </div>

            {/* Age */}
            <div>
              <label className={lc}>Age (years)</label>
              <input
                type="number"
                min={0}
                max={30}
                value={dogAge}
                onChange={e => setDogAge(e.target.value)}
                placeholder="e.g., 3"
                className={ic}
              />
            </div>

            {/* Bio */}
            <div>
              <label className={lc}>About</label>
              <textarea
                value={dogBio}
                onChange={e => setDogBio(e.target.value)}
                rows={4}
                placeholder="Tell us about your dog's personality..."
                className={ic}
              />
            </div>

            {dogError && <p className="text-sm text-red-600">{dogError}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={handleSaveDog}
            disabled={saving}
            className="w-full py-2.5 px-4 bg-[#0e62ae] text-white text-sm font-semibold rounded-xl hover:bg-[#094e8b] transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

      </div>
    </div>
  );
}
