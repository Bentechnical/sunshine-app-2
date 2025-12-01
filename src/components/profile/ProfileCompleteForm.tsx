// src/components/forms/ProfileCompleteForm.tsx

'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
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
  const [showRoleSelection, setShowRoleSelection] = useState(true);
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

  // Audience categories for volunteers only
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

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

  // Handle role selection with fade transition
  const handleRoleSelect = (role: string) => {
    setSelectedRole(role);
    // Trigger fade transition
    setShowRoleSelection(false);
  };

  // Fetch available audience categories
  const fetchAudienceCategories = async () => {
    try {
      const response = await fetch('/api/audience-categories');
      if (response.ok) {
        const data = await response.json();
        setAvailableCategories(data.categories.map((cat: any) => cat.name));
      }
    } catch (error) {
      console.error('Failed to fetch audience categories:', error);
    }
  };

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
        
        // Set individual user specific fields
        setPronouns(userData.pronouns || '');
        setBirthday(userData.birthday ? userData.birthday.toString() : '');
        setPhysicalAddress(userData.physical_address || '');
        setOtherPetsOnSite(userData.other_pets_on_site || false);
        setOtherPetsDescription(userData.other_pets_description || '');
        setThirdPartyAvailable(userData.third_party_available || '');
        setAdditionalInformation(userData.additional_information || '');
        setLiabilityWaiverAccepted(userData.liability_waiver_accepted || false);

        // Fetch existing audience categories for volunteers only
        if (userData.role === 'volunteer') {
          const { data: audienceData } = await supabase
            .from('volunteer_audience_preferences')
            .select(`
              category_id,
              audience_categories (name)
            `)
            .eq('volunteer_id', user.id);
          
          if (audienceData) {
            setSelectedCategories(audienceData.map((item: any) => item.audience_categories?.name).filter(Boolean));
          }
        }

        // Fetch dog data for volunteers
        if (userData.role === 'volunteer') {
          const { data: dogData } = await supabase
            .from('dogs')
            .select('*')
            .eq('volunteer_id', user.id)
            .single();

          if (dogData) {
            setDogName(dogData.dog_name || '');
            setDogAge(dogData.dog_age ? dogData.dog_age.toString() : '');
            setDogBreed(dogData.dog_breed || '');
            setDogBio(dogData.dog_bio || '');
            setDogPhotoUrl(dogData.dog_picture_url || '');
          }
        }

        setHasPrefilled(true);
      }
    };

    fetchUserProfile();
    fetchAudienceCategories();
  }, [user, isLoaded, hasPrefilled]);

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
      // Fetch current role to track if it's changing
      const { data: currentUser } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      const oldRole = currentUser?.role || null;

      const updatePayload: any = {
        role: selectedRole,
        bio,
        phone_number: phone,
        postal_code: normalizePostalCode(postalCode),
        profile_image: profilePictureUrl,
        travel_distance_km: selectedRole === 'volunteer' ? Number(travelDistance) : null,
        profile_complete: true,
        pronouns: pronouns, // Add pronouns for both individuals and volunteers
      };

      // Add individual-specific fields
      if (selectedRole === 'individual') {
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

      // Log role change to audit table (only if role actually changed)
      if (oldRole !== selectedRole) {
        await supabase.from('role_change_audit').insert({
          user_id: user.id,
          old_role: oldRole,
          new_role: selectedRole,
          source: 'profile_complete_form',
          metadata: {
            email: user.primaryEmailAddress?.emailAddress,
            first_name: user.firstName,
            last_name: user.lastName
          }
        });
      }

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
          status: 'pending', // Explicitly set status so it can be updated by admin
        };

        if (existingDog) {
          await supabase.from('dogs').update(dogPayload).eq('volunteer_id', user.id);
        } else {
          await supabase.from('dogs').insert(dogPayload);
        }

        // Update volunteer audience preferences
        if (selectedRole === 'volunteer' && selectedCategories.length > 0) {
          // First, clear existing preferences
          await supabase
            .from('volunteer_audience_preferences')
            .delete()
            .eq('volunteer_id', user.id);

          // Then insert new preferences
          const { data: categories } = await supabase
            .from('audience_categories')
            .select('id, name')
            .in('name', selectedCategories);

          if (categories && categories.length > 0) {
            const preferencePayload = categories.map(cat => ({
              volunteer_id: user.id,
              category_id: cat.id
            }));

            const { error: audienceError } = await supabase
              .from('volunteer_audience_preferences')
              .insert(preferencePayload);

            if (audienceError) throw new Error(audienceError.message);
          }
        }
      }

      await geocodePostalCode(normalizePostalCode(postalCode), user.id);

      // Send welcome email to user (profile under review)
      try {
        await fetch('/api/send-welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.primaryEmailAddress?.emailAddress,
            firstName: user.firstName,
          }),
        });
        console.log('[ProfileComplete] Welcome email sent');
      } catch (emailError) {
        // Log but don't block user flow if email fails
        console.error('[ProfileComplete] Failed to send welcome email:', emailError);
      }

      // Send admin notification about new user signup
      try {
        const notifyResponse = await fetch('/api/admin/notify-new-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userName: `${user.firstName} ${user.lastName}`,
            userType: selectedRole,
          }),
        });

        if (!notifyResponse.ok) {
          const errorData = await notifyResponse.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(`Admin notification failed: ${notifyResponse.status} - ${errorData.error || 'Unknown error'}`);
        }

        const notifyData = await notifyResponse.json();
        console.log('[ProfileComplete] Admin notification sent successfully:', notifyData);
      } catch (notifyError: any) {
        // Log but don't block user flow if notification fails
        console.error('[ProfileComplete] Failed to send admin notification:', notifyError.message || notifyError);
      }

      router.push('/dashboard');
    } catch (error: any) {
      setSubmitError(error.message || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };  

  if (!isLoaded || !user) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-gray-100">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-white p-4 overflow-y-auto flex justify-center">
      <div className={`w-full max-w-lg p-6 bg-white rounded-lg shadow-md transition-opacity duration-500 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
        <h2 className="text-2xl font-semibold text-center mb-4">
          Hi {user.firstName}, welcome to Sunshine!
        </h2>
        <p className="text-center mb-6">Please tell us more about yourself.</p>

        <form onSubmit={handleSubmit}>
          {/* Role Selection - Fade Transition */}
          <div className={`transition-all duration-500 ease-in-out ${showRoleSelection ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${!showRoleSelection ? 'hidden' : ''}`}>
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-4 text-center">
                Select your role
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Individual Button */}
                <button
                  type="button"
                  onClick={() => handleRoleSelect('individual')}
                  disabled={isLoading}
                  className="relative group p-6 rounded-lg border-2 border-gray-200 bg-white hover:border-gray-300 transition-all duration-300 hover:shadow-lg"
                >
                  <div className="flex flex-col items-center space-y-3">
                    <div className="relative w-24 h-40 md:w-32 md:h-32 overflow-hidden rounded-lg">
                      <Image
                        src="/images/book-a-visit-dog.png"
                        alt="Visit with a therapy dog"
                        fill
                        sizes="(max-width: 768px) 96px, 128px"
                        className="object-contain transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-gray-900 text-base md:text-base">
                        I would like to visit with a therapy dog
                      </p>
                    </div>
                  </div>
                </button>

                {/* Volunteer Button */}
                <button
                  type="button"
                  onClick={() => handleRoleSelect('volunteer')}
                  disabled={isLoading}
                  className="relative group p-6 rounded-lg border-2 border-gray-200 bg-white hover:border-gray-300 transition-all duration-300 hover:shadow-lg"
                >
                  <div className="flex flex-col items-center space-y-3">
                    <div className="relative w-24 h-40 md:w-32 md:h-32 overflow-hidden rounded-lg">
                      <Image
                        src="/images/Volunteer-btn.png"
                        alt="Volunteer with my dog"
                        fill
                        sizes="(max-width: 768px) 96px, 128px"
                        className="object-contain transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-gray-900 text-base md:text-base">
                        I would like to volunteer with my dog
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Form Fields - Fade In After Role Selection */}
          <div className={`transition-all duration-500 ease-in-out ${!showRoleSelection ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${showRoleSelection ? 'hidden' : ''}`}>
            {selectedRole && (
              <>
                {/* Back Button */}
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRoleSelection(true);
                      setSelectedRole('');
                    }}
                    className="flex items-center text-[#0e62ae] hover:text-blue-700 transition-colors duration-200"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to role selection
                  </button>
                </div>

                {/* Role Confirmation */}
                <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-center text-blue-900 font-medium">
                    {selectedRole === 'individual' 
                      ? 'I would like to visit with a therapy dog'
                      : 'I would like to volunteer with my dog'
                    }
                  </p>
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
                    In agreeing yes - the undersigned release Sunshine Therapy Dogs from any liability due to any accident, incident, injury or other adverse impact that may be incurred on a comfort visit. I understand the risks involved with this service and wish to proceed with these comfort visits. <span className="text-red-500">*</span>
                  </label>
                </div>
              </div>


            </>
          )}

          {/* Bio for Volunteers */}
          {selectedRole === 'volunteer' && (
            <>
              {/* Pronouns for Volunteers */}
              <div className="mb-4">
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
            </>
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

          {/* Audience Categories for Volunteers */}
          {selectedRole === 'volunteer' && (
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Preferred Audience Categories
              </label>
              <p className="text-sm text-gray-600 mb-3">
                Select the types of individuals you'd prefer to work with:
              </p>
              <div className="space-y-2">
                {availableCategories.map((category) => (
                  <label key={category} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCategories([...selectedCategories, category]);
                        } else {
                          setSelectedCategories(selectedCategories.filter(cat => cat !== category));
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled={isLoading}
                    />
                    <span className="text-sm text-gray-700">{category}</span>
                  </label>
                ))}
              </div>
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
              </>
            )}
          </div>
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
