// src/components/profile/EditProfileForm.tsx

'use client';

import React, { FormEvent, useRef, useState } from 'react';
import AvatarUpload, { AvatarUploadHandle } from '@/components/profile/AvatarUpload';

interface EditProfileFormProps {
  initialBio?: string | null;
  initialPhone?: string | null;
  initialAvatarUrl?: string | null;
  initialPostalCode?: string | null;
  initialTravelDistance?: number | null;
  // New individual user fields
  initialPronouns?: string | null;
  initialBirthday?: string | null;
  initialPhysicalAddress?: string | null;
  initialOtherPetsOnSite?: boolean | null;
  initialOtherPetsDescription?: string | null;
  initialThirdPartyAvailable?: string | null;
  initialAdditionalInformation?: string | null;
  // Visit recipient fields
  initialVisitRecipientType?: string | null;
  initialRelationshipToRecipient?: string | null;
  initialDependantName?: string | null;
  userId: string;
  role: 'individual' | 'volunteer' | 'admin';
  onSubmit: (
    bio: string,
    phone: string,
    avatarUrl?: string,
    postalCode?: string,
    travelDistanceKm?: number,
    // New individual user fields
    pronouns?: string,
    birthday?: string,
    physicalAddress?: string,
    otherPetsOnSite?: boolean,
    otherPetsDescription?: string,
    thirdPartyAvailable?: string,
    additionalInformation?: string,
    // Visit recipient fields
    visitRecipientType?: string,
    relationshipToRecipient?: string,
    dependantName?: string
  ) => Promise<void>;
  error?: string | null;
}

export default function EditProfileForm({
  initialBio = '',
  initialPhone = '',
  initialAvatarUrl = '',
  initialPostalCode = '',
  initialTravelDistance = 10,
  initialPronouns = '',
  initialBirthday = '',
  initialPhysicalAddress = '',
  initialOtherPetsOnSite = false,
  initialOtherPetsDescription = '',
  initialThirdPartyAvailable = '',
  initialAdditionalInformation = '',
  initialVisitRecipientType = '',
  initialRelationshipToRecipient = '',
  initialDependantName = '',
  userId,
  role,
  onSubmit,
  error,
}: EditProfileFormProps) {
  const [bio, setBio] = useState(initialBio ?? '');
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [postalCode, setPostalCode] = useState(initialPostalCode ?? '');
  const [travelDistance, setTravelDistance] = useState(initialTravelDistance || 10);
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState(initialAvatarUrl ?? '');
  const avatarUrlRef = useRef(initialAvatarUrl ?? '');
  const [isUploading, setIsUploading] = useState(false);
  
  // New individual user fields
  const [pronouns, setPronouns] = useState(initialPronouns ?? '');
  const [birthday, setBirthday] = useState(initialBirthday ?? '');
  const [physicalAddress, setPhysicalAddress] = useState(initialPhysicalAddress ?? '');
  const [otherPetsOnSite, setOtherPetsOnSite] = useState(initialOtherPetsOnSite ?? false);
  const [otherPetsDescription, setOtherPetsDescription] = useState(initialOtherPetsDescription ?? '');
  const [thirdPartyAvailable, setThirdPartyAvailable] = useState(initialThirdPartyAvailable ?? '');
  const [additionalInformation, setAdditionalInformation] = useState(initialAdditionalInformation ?? '');
  
  // Visit recipient fields
  const [visitRecipientType, setVisitRecipientType] = useState(initialVisitRecipientType ?? '');
  const [relationshipToRecipient, setRelationshipToRecipient] = useState(initialRelationshipToRecipient ?? '');
  const [dependantName, setDependantName] = useState(initialDependantName ?? '');

  // Phone formatting function (matching ProfileCompleteForm)
  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    // Limit to 10 digits (North American phone number)
    const limited = cleaned.slice(0, 10);
    const match = limited.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
    if (match) {
      const parts = [match[1], match[2], match[3]].filter(Boolean);
      if (parts.length === 0) return '';
      if (parts.length === 1) return `(${parts[0]}`;
      if (parts.length === 2) return `(${parts[0]}) ${parts[1]}`;
      return `(${parts[0]}) ${parts[1]}-${parts[2]}`;
    }
    return value;
  };

  const normalizePostalCode = (code: string): string => {
    const upper = code.toUpperCase().replace(/\s+/g, '');
    return upper.length === 6 ? `${upper.slice(0, 3)} ${upper.slice(3)}` : upper;
  };

  const isValidPostalCode = (code: string): boolean => {
    const cleaned = code.toUpperCase().replace(/\s+/g, '');
    const regex = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;
    return regex.test(cleaned);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isUploading) {
      alert('Please wait for the profile picture to finish uploading.');
      return;
    }

    if (!postalCode.trim()) {
      alert('Postal code is required.');
      return;
    }

    const cleanedCode = postalCode.toUpperCase().replace(/\s+/g, '');
    if (!isValidPostalCode(cleanedCode)) {
      alert('Postal code must be in the format A1A1A1, alternating letters and numbers.');
      return;
    }

    const normalizedPostalCode = normalizePostalCode(cleanedCode);
    const finalAvatarUrl = avatarUrlRef.current;

    await onSubmit(
      bio, 
      phone, 
      finalAvatarUrl, 
      normalizedPostalCode, 
      travelDistance,
      pronouns,
      birthday,
      physicalAddress,
      otherPetsOnSite,
      otherPetsDescription,
      thirdPartyAvailable,
      additionalInformation,
      visitRecipientType,
      relationshipToRecipient,
      dependantName
    );
  };

  const avatarUploadRef = useRef<AvatarUploadHandle>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  // Scroll to top of form when component mounts
  React.useEffect(() => {
    const scrollToTop = () => {
      const formElement = formTopRef.current;
      if (formElement) {
        // Scroll just the form into view at the top of its container
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      }
    };

    // Small delay to ensure DOM is ready
    setTimeout(scrollToTop, 100);
  }, []);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-24 lg:pb-4">
      {/* Scroll anchor */}
      <div ref={formTopRef} className="h-0" />
      <div className="flex items-center gap-4">
        <div className="relative w-24 aspect-square rounded-lg overflow-hidden shadow-md border border-gray-300">
          <AvatarUpload
            ref={avatarUploadRef}
            initialUrl={previewAvatarUrl}
            fallbackUrl="https://via.placeholder.com/100"
            onUpload={(url: string) => {
              setPreviewAvatarUrl(url);
              avatarUrlRef.current = url;
              setIsUploading(false);
            }}
            altText="Profile Picture"
          />
        </div>
        <span
          className="font-medium text-blue-600 cursor-pointer hover:text-blue-700 hover:underline"
          onClick={() => avatarUploadRef.current?.triggerClick()}
        >
          Change Profile Picture
        </span>
      </div>

      <div>
        <label htmlFor="phone_number" className="block text-sm font-semibold text-gray-700 mb-2">
          Phone Number <span className="text-red-500">*</span>
        </label>
        <input
          type="tel"
          id="phone_number"
          value={phone}
          onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
          className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
          placeholder="(123) 456-7890"
        />
      </div>

      {/* Visit Recipient Type - Only show for individuals, moved after phone */}
      {role === 'individual' && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            I'm interested in setting up a visit for: <span className="text-red-500">*</span>
          </label>
          <div className="flex space-x-6">
            <label className="flex items-center">
              <input
                type="radio"
                name="visitRecipientType"
                value="self"
                checked={visitRecipientType === 'self'}
                onChange={(e) => setVisitRecipientType(e.target.value)}
                className="mr-2"
              />
              Myself
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="visitRecipientType"
                value="other"
                checked={visitRecipientType === 'other'}
                onChange={(e) => setVisitRecipientType(e.target.value)}
                className="mr-2"
              />
              Someone else
            </label>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="postal_code" className="block text-sm font-semibold text-gray-700 mb-2">
          Postal Code <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="postal_code"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value.toUpperCase())}
          className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300 uppercase"
          placeholder="e.g., M5V 2T6"
        />
      </div>

      {role === 'volunteer' && (
        <div>
          <label htmlFor="travel_distance" className="block text-sm font-semibold text-gray-700 mb-2">
            Travel Distance
          </label>
          <select
            id="travel_distance"
            value={travelDistance}
            onChange={(e) => setTravelDistance(Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
          >
            <option value={5}>5 km</option>
            <option value={10}>10 km</option>
            <option value={25}>25 km</option>
            <option value={50}>50 km</option>
          </select>
        </div>
      )}

      {/* Dependant Information - Only show for individuals selecting "someone else" */}
      {role === 'individual' && visitRecipientType === 'other' && (
        <>
          <div>
            <label htmlFor="dependantName" className="block text-sm font-semibold text-gray-700 mb-2">
              Name of person receiving visits <span className="text-red-500">*</span>
            </label>
            <input
              id="dependantName"
              type="text"
              value={dependantName}
              onChange={(e) => setDependantName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
              placeholder="Enter the name of the person who will receive therapy dog visits"
            />
          </div>

          <div>
            <label htmlFor="relationshipToRecipient" className="block text-sm font-semibold text-gray-700 mb-2">
              Your relationship to this person <span className="text-red-500">*</span>
            </label>
            <input
              id="relationshipToRecipient"
              type="text"
              value={relationshipToRecipient}
              onChange={(e) => setRelationshipToRecipient(e.target.value)}
              className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
              placeholder="e.g., parent, guardian, caregiver, child, spouse"
            />
          </div>
        </>
      )}

      <div>
        <label htmlFor="bio" className="block text-sm font-semibold text-gray-700 mb-2">
          {role === 'individual' ? 'Why are you interested in meeting with a therapy dog?' : 'Tell us about yourself'} <span className="text-red-500">*</span>
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
          rows={4}
          placeholder={role === 'individual' ? 'Tell us about your interest in therapy dog visits...' : 'Tell us about yourself...'}
        />
      </div>

      {/* Pronouns for Volunteers */}
      {role === 'volunteer' && (
        <div>
          <label htmlFor="pronouns" className="block text-sm font-semibold text-gray-700 mb-2">
            Pronouns
          </label>
          <select
            id="pronouns"
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
          >
            <option value="">Select pronouns</option>
            <option value="he/him">He/Him</option>
            <option value="she/her">She/Her</option>
            <option value="they/them">They/Them</option>
          </select>
        </div>
      )}

      {/* Individual User Specific Fields */}
      {role === 'individual' && (
        <>
          <div>
            <label htmlFor="pronouns" className="block text-sm font-semibold text-gray-700 mb-2">
              {visitRecipientType === 'other' ? 'Pronouns of person receiving visits' : 'Pronouns'}
            </label>
            <select
              id="pronouns"
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value)}
              className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
            >
              <option value="">Select pronouns</option>
              <option value="he/him">He/Him</option>
              <option value="she/her">She/Her</option>
              <option value="they/them">They/Them</option>
            </select>
          </div>

          <div>
            <label htmlFor="birthday" className="block text-sm font-semibold text-gray-700 mb-2">
              {visitRecipientType === 'other' ? 'Birth year of person receiving visits' : 'Birth year'} <span className="text-red-500">*</span>
            </label>
            <input
              id="birthday"
              type="number"
              min="1900"
              max={new Date().getFullYear()}
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
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
              className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
              rows={4}
              placeholder="We prefer public places like parks, libraries, or community centers. Please describe your preferred location(s)."
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
              />
              <label htmlFor="otherPetsOnSite" className="text-sm font-semibold text-gray-700">
                Are there other animals in your home?
              </label>
            </div>
            {otherPetsOnSite && (
              <textarea
                value={otherPetsDescription}
                onChange={(e) => setOtherPetsDescription(e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300 mt-2"
                rows={3}
                placeholder="Please describe any other animals. We require them to be secured during visits."
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
              className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
              rows={2}
              placeholder="Name and relationship (e.g., parent, caregiver, friend)"
            />
          </div>

          <div>
            <label htmlFor="additionalInformation" className="block text-sm font-semibold text-gray-700 mb-2">
              Please let us know any other important information
            </label>
            <textarea
              id="additionalInformation"
              value={additionalInformation}
              onChange={(e) => setAdditionalInformation(e.target.value)}
              className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
              rows={3}
              placeholder="Any additional information that would be helpful for us to know"
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Please contact us to update your email address.
        </label>
      </div>

      {error && <p className="text-red-600 mt-2">{error}</p>}

      {/* Sticky Submit Button - Fixed at bottom on mobile, sticky within container on desktop */}
      <div className="fixed lg:sticky bottom-[72px] lg:bottom-0 left-0 right-0 bg-white border-t shadow-2xl lg:shadow-md p-4 z-30">
        <button
          type="submit"
          className="w-full py-3 px-4 bg-[#0e62ae] text-white rounded-md hover:bg-[#094e8b] transition font-semibold"
        >
          Save Changes
        </button>
      </div>
    </form>
  );
}
