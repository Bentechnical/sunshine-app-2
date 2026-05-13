'use client';

import AvatarUpload from '@/components/profile/AvatarUpload';

const DEFAULT_DOG_IMAGE = '/images/default_dog.png';

interface VolunteerDogProfileProps {
  dogName: string;
  setDogName: (v: string) => void;
  dogBreed: string;
  setDogBreed: (v: string) => void;
  dogAge: string;
  setDogAge: (v: string) => void;
  dogBio: string;
  setDogBio: (v: string) => void;
  dogPhotoUrl: string;
  setDogPhotoUrl: (v: string) => void;
  isLoading: boolean;
}

export default function VolunteerDogProfile({
  dogName,
  setDogName,
  dogBreed,
  setDogBreed,
  dogAge,
  setDogAge,
  dogBio,
  setDogBio,
  dogPhotoUrl,
  setDogPhotoUrl,
  isLoading,
}: VolunteerDogProfileProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Tell us about the dog you'll be bringing on visits.
      </p>

      <div>
        <label htmlFor="dogName" className="block text-sm font-semibold text-gray-700 mb-2">
          Dog Name <span className="text-red-500">*</span>
        </label>
        <input
          id="dogName"
          type="text"
          value={dogName}
          onChange={(e) => setDogName(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="Your dog's name"
        />
      </div>

      <div>
        <label htmlFor="dogBreed" className="block text-sm font-semibold text-gray-700 mb-2">
          Breed <span className="text-red-500">*</span>
        </label>
        <input
          id="dogBreed"
          type="text"
          value={dogBreed}
          onChange={(e) => setDogBreed(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="e.g., Golden Retriever"
        />
      </div>

      <div>
        <label htmlFor="dogAge" className="block text-sm font-semibold text-gray-700 mb-2">
          Age <span className="text-red-500">*</span>
        </label>
        <input
          id="dogAge"
          type="text"
          value={dogAge}
          onChange={(e) => setDogAge(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="e.g., 3 years"
        />
      </div>

      <div>
        <label htmlFor="dogBio" className="block text-sm font-semibold text-gray-700 mb-2">
          About your dog <span className="text-red-500">*</span>
        </label>
        <textarea
          id="dogBio"
          value={dogBio}
          onChange={(e) => setDogBio(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="Tell us about your dog's personality, temperament, and any training they've had..."
          rows={4}
        />
      </div>

      <div>
        <p className="block text-sm font-semibold text-gray-700 mb-2">Dog Photo</p>
        <AvatarUpload
          initialUrl={dogPhotoUrl}
          fallbackUrl={DEFAULT_DOG_IMAGE}
          onUpload={(url) => setDogPhotoUrl(url)}
          size={100}
          altText="Dog Profile Picture"
        />
      </div>
    </div>
  );
}
