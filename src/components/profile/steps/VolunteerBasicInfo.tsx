'use client';

import AvatarUpload from '@/components/profile/AvatarUpload';
import { UserResource } from '@clerk/types';

const formatPhoneNumber = (value: string) => {
  const cleaned = value.replace(/\D/g, '').slice(0, 10);
  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
  if (match) {
    const parts = [match[1], match[2], match[3]].filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return `(${parts[0]}`;
    if (parts.length === 2) return `(${parts[0]}) ${parts[1]}`;
    return `(${parts[0]}) ${parts[1]}-${parts[2]}`;
  }
  return value;
};

interface VolunteerBasicInfoProps {
  phone: string;
  setPhone: (v: string) => void;
  postalCode: string;
  setPostalCode: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
  pronouns: string;
  setPronouns: (v: string) => void;
  travelDistance: string;
  setTravelDistance: (v: string) => void;
  profilePictureUrl: string;
  setProfilePictureUrl: (v: string) => void;
  user: UserResource;
  isLoading: boolean;
}

export default function VolunteerBasicInfo({
  phone,
  setPhone,
  postalCode,
  setPostalCode,
  bio,
  setBio,
  pronouns,
  setPronouns,
  travelDistance,
  setTravelDistance,
  profilePictureUrl,
  setProfilePictureUrl,
  user,
  isLoading,
}: VolunteerBasicInfoProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="block text-sm font-semibold text-gray-700 mb-2">Profile Picture</p>
        <AvatarUpload
          initialUrl={profilePictureUrl}
          fallbackUrl={user.imageUrl}
          onUpload={(url) => setProfilePictureUrl(url)}
          size={100}
          altText="User Profile Picture"
        />
      </div>

      <div>
        <label htmlFor="phoneNumber" className="block text-sm font-semibold text-gray-700 mb-2">
          Phone Number <span className="text-red-500">*</span>
        </label>
        <input
          id="phoneNumber"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="(123) 456-7890"
        />
      </div>

      <div>
        <label htmlFor="pronouns" className="block text-sm font-semibold text-gray-700 mb-2">
          Pronouns
        </label>
        <select
          id="pronouns"
          value={pronouns}
          onChange={(e) => setPronouns(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
        >
          <option value="">Select pronouns</option>
          <option value="he/him">He/Him</option>
          <option value="she/her">She/Her</option>
          <option value="they/them">They/Them</option>
        </select>
      </div>

      <div>
        <label htmlFor="postalCode" className="block text-sm font-semibold text-gray-700 mb-2">
          Postal Code <span className="text-red-500">*</span>
        </label>
        <input
          id="postalCode"
          type="text"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg uppercase"
          disabled={isLoading}
          placeholder="A1A 1A1"
        />
      </div>

      <div>
        <label htmlFor="bio" className="block text-sm font-semibold text-gray-700 mb-2">
          Tell us about yourself <span className="text-red-500">*</span>
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="Tell us about yourself and why you're interested in volunteering..."
          rows={4}
        />
      </div>

      <div>
        <label htmlFor="travelDistance" className="block text-sm font-semibold text-gray-700 mb-2">
          How far are you willing to travel?
        </label>
        <select
          id="travelDistance"
          value={travelDistance}
          onChange={(e) => setTravelDistance(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
        >
          <option value="5">5 km</option>
          <option value="10">10 km</option>
          <option value="25">25 km</option>
          <option value="50">50 km</option>
        </select>
      </div>
    </div>
  );
}
