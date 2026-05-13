'use client';

import AvatarUpload from '@/components/profile/AvatarUpload';
import { UserResource } from '@clerk/types';

interface IndividualVisitDetailsProps {
  visitRecipientType: string;
  bio: string;
  setBio: (v: string) => void;
  pronouns: string;
  setPronouns: (v: string) => void;
  birthday: string;
  setBirthday: (v: string) => void;
  physicalAddress: string;
  setPhysicalAddress: (v: string) => void;
  otherPetsOnSite: boolean;
  setOtherPetsOnSite: (v: boolean) => void;
  otherPetsDescription: string;
  setOtherPetsDescription: (v: string) => void;
  thirdPartyAvailable: string;
  setThirdPartyAvailable: (v: string) => void;
  additionalInformation: string;
  setAdditionalInformation: (v: string) => void;
  profilePictureUrl: string;
  setProfilePictureUrl: (v: string) => void;
  user: UserResource;
  isLoading: boolean;
}

export default function IndividualVisitDetails({
  visitRecipientType,
  bio,
  setBio,
  pronouns,
  setPronouns,
  birthday,
  setBirthday,
  physicalAddress,
  setPhysicalAddress,
  otherPetsOnSite,
  setOtherPetsOnSite,
  otherPetsDescription,
  setOtherPetsDescription,
  thirdPartyAvailable,
  setThirdPartyAvailable,
  additionalInformation,
  setAdditionalInformation,
  profilePictureUrl,
  setProfilePictureUrl,
  user,
  isLoading,
}: IndividualVisitDetailsProps) {
  const isForOther = visitRecipientType === 'other';

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="bio" className="block text-sm font-semibold text-gray-700 mb-2">
          Why are you interested in meeting with a therapy dog? <span className="text-red-500">*</span>
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="Tell us about your interest in therapy dog visits..."
          rows={4}
        />
      </div>

      <div>
        <label htmlFor="pronouns" className="block text-sm font-semibold text-gray-700 mb-2">
          {isForOther ? 'Pronouns of person receiving visits' : 'Pronouns'}
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
        <label htmlFor="birthday" className="block text-sm font-semibold text-gray-700 mb-2">
          {isForOther ? 'Birth year of person receiving visits' : 'Birth year'} <span className="text-red-500">*</span>
        </label>
        <input
          id="birthday"
          type="number"
          min="1900"
          max={new Date().getFullYear()}
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="e.g., 1990"
        />
      </div>

      <div>
        <label htmlFor="physicalAddress" className="block text-sm font-semibold text-gray-700 mb-2">
          Where would you like to meet with a therapy dog? <span className="text-red-500">*</span>
        </label>
        <textarea
          id="physicalAddress"
          value={physicalAddress}
          onChange={(e) => setPhysicalAddress(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="We prefer public places like parks, libraries, or community centers. Please describe your preferred location(s)."
          rows={3}
        />
      </div>

      <div>
        <div className="flex items-center mb-2">
          <input
            id="otherPetsOnSite"
            type="checkbox"
            checked={otherPetsOnSite}
            onChange={(e) => setOtherPetsOnSite(e.target.checked)}
            className="mr-2"
            disabled={isLoading}
          />
          <label htmlFor="otherPetsOnSite" className="text-sm font-semibold text-gray-700">
            Are there other animals in your home?
          </label>
        </div>
        {otherPetsOnSite && (
          <textarea
            value={otherPetsDescription}
            onChange={(e) => setOtherPetsDescription(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg mt-2"
            disabled={isLoading}
            placeholder="Please describe any other animals. We require them to be secured during visits."
            rows={3}
          />
        )}
      </div>

      <div>
        <label htmlFor="thirdPartyAvailable" className="block text-sm font-semibold text-gray-700 mb-2">
          Is there someone else who can be present during visits?
        </label>
        <textarea
          id="thirdPartyAvailable"
          value={thirdPartyAvailable}
          onChange={(e) => setThirdPartyAvailable(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="Name and relationship (e.g., parent, caregiver, friend)"
          rows={2}
        />
      </div>

      <div>
        <label htmlFor="additionalInformation" className="block text-sm font-semibold text-gray-700 mb-2">
          Any other important information?
        </label>
        <textarea
          id="additionalInformation"
          value={additionalInformation}
          onChange={(e) => setAdditionalInformation(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="Anything else that would be helpful for us to know"
          rows={3}
        />
      </div>

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
    </div>
  );
}
