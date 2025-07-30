// src/components/forms/ProfileCompleteForm.tsx

'use client';

import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useRouter } from 'next/navigation';
import AvatarUpload from '@/components/profile/AvatarUpload';
import { useSupabaseClient } from '@/utils/supabase/client';
import { geocodePostalCode } from '@/utils/geocode';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function ProfileCompleteForm() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [fadeIn, setFadeIn] = useState(false);
  const [hasPrefilled, setHasPrefilled] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [travelDistance, setTravelDistance] = useState('10');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');

  // Individual user specific fields
  const [pronouns, setPronouns] = useState('');
  const [birthday, setBirthday] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [otherPetsOnSite, setOtherPetsOnSite] = useState(false);
  const [otherPetsDescription, setOtherPetsDescription] = useState('');
  const [thirdPartyAvailable, setThirdPartyAvailable] = useState('');
  const [additionalInformation, setAdditionalInformation] = useState('');
  const [liabilityWaiverAccepted, setLiabilityWaiverAccepted] = useState(false);
  
  // Visit recipient fields
  const [visitRecipientType, setVisitRecipientType] = useState('');
  const [relationshipToRecipient, setRelationshipToRecipient] = useState('');
  const [dependantName, setDependantName] = useState('');

  // Phone formatting function
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

  const [dogName, setDogName] = useState('');
  const [dogAge, setDogAge] = useState('');
  const [dogBreed, setDogBreed] = useState('');
  const [dogBio, setDogBio] = useState('');
  const [dogPhotoUrl, setDogPhotoUrl] = useState('');

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showProfileWarning, setShowProfileWarning] = useState(false);
  const [bypassWarning, setBypassWarning] = useState(false);

  const DEFAULT_DOG_IMAGE = '/images/default_dog.png';

  useEffect(() => {
    if (!isLoaded || !user || hasPrefilled) return;
    setTimeout(() => setFadeIn(true), 100);
    setProfilePictureUrl(user.imageUrl || '');

    const fetchUserProfile = async () => {
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (userData) {
        setSelectedRole(userData.role || '');
        setBio(userData.bio || '');
        setPhone(userData.phone_number || '');
        setPostalCode(userData.postal_code || '');
        setProfilePictureUrl(userData.profile_image || '');
        if (userData.travel_distance_km) {
          setTravelDistance(userData.travel_distance_km.toString());
        }
        
        // Set visit recipient fields
        setVisitRecipientType(userData.visit_recipient_type || '');
        setRelationshipToRecipient(userData.relationship_to_recipient || '');
        setDependantName(userData.dependant_name || '');

        if (userData.role === 'volunteer') {
          const { data: dog } = await supabase
            .from('dogs')
            .select('*')
            .eq('volunteer_id', user.id)
            .single();

          if (dog) {
            setDogName(dog.dog_name || '');
            setDogAge(dog.dog_age?.toString() || '');
            setDogBreed(dog.dog_breed || '');
            setDogBio(dog.dog_bio || '');
            setDogPhotoUrl(dog.dog_picture_url || '');
          }
        }
      }

      setHasPrefilled(true);
    };

    fetchUserProfile();
  }, [isLoaded, user, hasPrefilled, supabase]);

  const normalizePostalCode = (code: string): string => {
    const cleaned = code.toUpperCase().replace(/\s+/g, '');
    return cleaned.length === 6 ? `${cleaned.slice(0, 3)} ${cleaned.slice(3)}` : cleaned;
  };

  const validatePostalCode = (code: string): boolean => {
    return /^[A-Za-z]\d[A-Za-z]\d[A-Za-z]\d$/.test(code.replace(/\s+/g, ''));
  };

  const validateForm = () => {
    if (!selectedRole) return setSubmitError('Please select your role.'), false;
    if (!validatePostalCode(postalCode)) return setSubmitError('Postal code must be in the format X1X1X1'), false;

    if (selectedRole === 'individual') {
      if (!phone.trim()) return setSubmitError('Please enter your phone number.'), false;
      if (!visitRecipientType) return setSubmitError('Please select who the visit is for.'), false;
      if (!birthday.trim()) return setSubmitError('Please enter your birth year.'), false;
      if (!physicalAddress.trim()) return setSubmitError('Please enter where you\'d like to meet with a therapy dog.'), false;
      if (!bio.trim()) return setSubmitError('Please tell us why you\'re interested in meeting with a therapy dog.'), false;
      if (!liabilityWaiverAccepted) {
        setSubmitError('You must accept the liability waiver to proceed.');
        return false;
      }
      
      if (visitRecipientType === 'other') {
        if (!dependantName.trim()) return setSubmitError('Please provide the name of the person receiving visits.'), false;
        if (!relationshipToRecipient.trim()) return setSubmitError('Please describe your relationship to the person receiving visits.'), false;
      }
    }

    if (selectedRole === 'volunteer') {
      if (!phone.trim()) return setSubmitError('Please enter your phone number.'), false;
      if (!bio.trim()) return setSubmitError('Please tell us about yourself.'), false;
      if (!dogName || !dogAge || !dogBreed || !dogBio) {
        setSubmitError("Please complete all fields for your dog's profile.");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm() || !user) return;

    if (!bypassWarning && (!bio || !profilePictureUrl)) {
      setShowProfileWarning(true);
      return;
    }

    setIsLoading(true);

    try {
      const updatePayload: any = {
        role: selectedRole,
        bio,
        phone_number: phone,
        postal_code: normalizePostalCode(postalCode),
        profile_image: profilePictureUrl,
        travel_distance_km: selectedRole === 'volunteer' ? Number(travelDistance) : null,
        profile_complete: true,
      };

      // Add individual-specific fields
      if (selectedRole === 'individual') {
        updatePayload.pronouns = pronouns;
        updatePayload.birthday = birthday;
        updatePayload.physical_address = physicalAddress;
        updatePayload.other_pets_on_site = otherPetsOnSite;
        updatePayload.other_pets_description = otherPetsDescription;
        updatePayload.third_party_available = thirdPartyAvailable;
        updatePayload.additional_information = additionalInformation;
        updatePayload.liability_waiver_accepted = liabilityWaiverAccepted;
        updatePayload.liability_waiver_accepted_at = liabilityWaiverAccepted ? new Date().toISOString() : null;
        
        // Add visit recipient fields
        updatePayload.visit_recipient_type = visitRecipientType;
        updatePayload.relationship_to_recipient = relationshipToRecipient;
        updatePayload.dependant_name = dependantName;
      }

      const { error: updateError } = await supabase.from('users').update(updatePayload).eq('id', user.id);

      if (updateError) throw new Error(updateError.message);

      if (selectedRole === 'volunteer') {
        const { data: existingDog } = await supabase
          .from('dogs')
          .select('*')
          .eq('volunteer_id', user.id)
          .single();

        const dogPayload = {
          volunteer_id: user.id,
          dog_name: dogName,
          dog_age: dogAge,
          dog_breed: dogBreed,
          dog_bio: dogBio,
          dog_picture_url: dogPhotoUrl || DEFAULT_DOG_IMAGE,
        };

        if (existingDog) {
          await supabase.from('dogs').update(dogPayload).eq('volunteer_id', user.id);
        } else {
          await supabase.from('dogs').insert(dogPayload);
        }
      }

      await geocodePostalCode(normalizePostalCode(postalCode), user.id);
      router.push('/dashboard');
    } catch (error: any) {
      setSubmitError(error.message || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };  

  if (!isLoaded || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-4 overflow-y-auto flex justify-center">
      <div className={`w-full max-w-lg p-6 bg-white rounded-lg shadow-md transition-opacity duration-500 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
        <h2 className="text-2xl font-semibold text-center mb-4">
          Hi {user.firstName}, welcome to Sunshine!
        </h2>
        <p className="text-center mb-6">Please tell us more about yourself.</p>

        <form onSubmit={handleSubmit}>
          {/* Role */}
          <div className="mb-4">
            <label htmlFor="role" className="block text-sm font-semibold text-gray-700 mb-2">
              Select your role
            </label>
            <select
              id="role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-gray-700"
              disabled={isLoading}
            >
              <option value="">Select Role</option>
              <option value="individual">Individual</option>
              <option value="volunteer">Volunteer</option>
            </select>
          </div>

          {/* Phone - Moved before visit recipient selection */}
          <div className="mb-4">
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

          {/* Visit Recipient Type - Only show for individuals */}
          {selectedRole === 'individual' && (
            <div className="mb-4">
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
                    disabled={isLoading}
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
                    disabled={isLoading}
                  />
                  Someone else
                </label>
              </div>
            </div>
          )}

          {/* Postal Code */}
          <div className="mb-4">
            <label htmlFor="postalCode" className="block text-sm font-semibold text-gray-700 mb-2">
              Postal Code
            </label>
            <input
              id="postalCode"
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg uppercase"
              disabled={isLoading}
              required
            />
          </div>

          {/* Dependant Information - Only show for individuals selecting "someone else" */}
          {selectedRole === 'individual' && visitRecipientType === 'other' && (
            <>
              <div className="mb-4">
                <label htmlFor="dependantName" className="block text-sm font-semibold text-gray-700 mb-2">
                  Name of person receiving visits <span className="text-red-500">*</span>
                </label>
                <input
                  id="dependantName"
                  type="text"
                  value={dependantName}
                  onChange={(e) => setDependantName(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                  disabled={isLoading}
                  placeholder="Enter the name of the person who will receive therapy dog visits"
                />
              </div>

              <div className="mb-4">
                <label htmlFor="relationshipToRecipient" className="block text-sm font-semibold text-gray-700 mb-2">
                  Your relationship to this person <span className="text-red-500">*</span>
                </label>
                <input
                  id="relationshipToRecipient"
                  type="text"
                  value={relationshipToRecipient}
                  onChange={(e) => setRelationshipToRecipient(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                  disabled={isLoading}
                  placeholder="e.g., parent, guardian, caregiver, child, spouse"
                />
              </div>
            </>
          )}

          {/* Bio - Moved here for better flow */}
          {selectedRole === 'individual' && (
            <div className="mb-4">
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
          )}

          {/* Individual User Specific Fields */}
          {selectedRole === 'individual' && (
            <>
              {/* Pronouns */}
              <div className="mb-4">
                <label htmlFor="pronouns" className="block text-sm font-semibold text-gray-700 mb-2">
                  {visitRecipientType === 'other' ? 'Pronouns of person receiving visits' : 'Pronouns'}
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
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Birthday */}
              <div className="mb-4">
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
                  className="w-full px-4 py-2 border rounded-lg"
                  disabled={isLoading}
                  placeholder="e.g., 1990"
                />
              </div>

              {/* Physical Address */}
              <div className="mb-4">
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
                  rows={4}
                />
              </div>

              {/* Other Pets */}
              <div className="mb-4">
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

              {/* Third Party */}
              <div className="mb-4">
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

              {/* Additional Information */}
              <div className="mb-4">
                <label htmlFor="additionalInformation" className="block text-sm font-semibold text-gray-700 mb-2">
                  Please let us know any other important information
                </label>
                <textarea
                  id="additionalInformation"
                  value={additionalInformation}
                  onChange={(e) => setAdditionalInformation(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                  disabled={isLoading}
                  placeholder="Any additional information that would be helpful for us to know"
                  rows={3}
                />
              </div>

              {/* Liability Waiver */}
              <div className="mb-4">
                <div className="flex items-start mb-2">
                  <input
                    id="liabilityWaiverAccepted"
                    type="checkbox"
                    checked={liabilityWaiverAccepted}
                    onChange={(e) => setLiabilityWaiverAccepted(e.target.checked)}
                    className="mr-2 mt-1"
                    disabled={isLoading}
                    required
                  />
                  <label htmlFor="liabilityWaiverAccepted" className="text-sm font-semibold text-gray-700">
                    I have read and agree to the{' '}
                    <a 
                      href="/liability-waiver.pdf" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      liability waiver
                    </a>
                    {' '}and understand the terms and conditions.
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Bio for Volunteers */}
          {selectedRole === 'volunteer' && (
            <div className="mb-4">
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
          )}

          {/* Travel Distance */}
          {selectedRole === 'volunteer' && (
            <div className="mb-4">
              <label htmlFor="travelDistance" className="block text-sm font-semibold text-gray-700 mb-2">
                Travel Distance
              </label>
              <select
                id="travelDistance"
                value={travelDistance}
                onChange={(e) => setTravelDistance(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="5">5 km</option>
                <option value="10">10 km</option>
                <option value="25">25 km</option>
                <option value="50">50 km</option>
              </select>
            </div>
          )}

          {/* Avatar */}
          <div className="mb-4">
            <p className="block text-sm font-semibold text-gray-700 mb-2">Profile Picture</p>
            <AvatarUpload
              initialUrl={profilePictureUrl}
              fallbackUrl={user.imageUrl}
              onUpload={(url) => setProfilePictureUrl(url)}
              size={100}
              altText="User Profile Picture"
            />
          </div>

          {/* Dog Profile */}
          {selectedRole === 'volunteer' && (
            <>
              <h3 className="text-lg font-bold mb-2">Dog Profile</h3>
              <div className="mb-4">
                <label htmlFor="dogName" className="block text-sm font-semibold text-gray-700 mb-2">
                  Dog Name
                </label>
                <input
                  id="dogName"
                  type="text"
                  value={dogName}
                  onChange={(e) => setDogName(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                  disabled={isLoading}
                />
              </div>

              <div className="mb-4">
                <label htmlFor="dogAge" className="block text-sm font-semibold text-gray-700 mb-2">
                  Dog Age
                </label>
                <input
                  id="dogAge"
                  type="text"
                  value={dogAge}
                  onChange={(e) => setDogAge(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                  disabled={isLoading}
                />
              </div>

              <div className="mb-4">
                <label htmlFor="dogBreed" className="block text-sm font-semibold text-gray-700 mb-2">
                  Dog Breed
                </label>
                <input
                  id="dogBreed"
                  type="text"
                  value={dogBreed}
                  onChange={(e) => setDogBreed(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                  disabled={isLoading}
                />
              </div>

              <div className="mb-4">
                <label htmlFor="dogBio" className="block text-sm font-semibold text-gray-700 mb-2">
                  Dog Bio
                </label>
                <textarea
                  id="dogBio"
                  value={dogBio}
                  onChange={(e) => setDogBio(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                  disabled={isLoading}
                />
              </div>

              <div className="mb-4">
                <p className="block text-sm font-semibold text-gray-700 mb-2">Dog Photo</p>
                <AvatarUpload
                  initialUrl={dogPhotoUrl}
                  fallbackUrl={DEFAULT_DOG_IMAGE}
                  onUpload={(url) => setDogPhotoUrl(url)}
                  size={100}
                  altText="Dog Profile Picture"
                />
              </div>
            </>
          )}

          {submitError && <p className="text-red-500 text-sm mt-2">{submitError}</p>}

          <button
            type="submit"
            className="w-full mt-4 px-6 py-2 bg-[#0f60ae] text-white rounded-lg"
            disabled={isLoading}
          >
            {isLoading ? 'Submitting...' : 'Submit Profile'}
          </button>
        </form>
      </div>

      <Dialog open={showProfileWarning} onOpenChange={setShowProfileWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Almost done!</DialogTitle>
            <DialogDescription>
              We recommend adding a profile picture and personal bio for the best experience. Want to do that now?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end gap-2">
            <button
              onClick={() => {
                setBypassWarning(true);
                setShowProfileWarning(false);
                handleSubmit(new Event('submit') as any);
              }}
              className="bg-[#0f60ae] text-white px-4 py-2 rounded"
            >
              Proceed for now
            </button>
            <button
              onClick={() => setShowProfileWarning(false)}
              className="border border-[#0f60ae] text-[#0f60ae] px-4 py-2 rounded"
            >
              Go back and edit
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
