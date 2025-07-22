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

    if (selectedRole === 'volunteer') {
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
      const { error: updateError } = await supabase.from('users').update({
        role: selectedRole,
        bio,
        phone_number: phone,
        postal_code: normalizePostalCode(postalCode),
        profile_image: profilePictureUrl,
        travel_distance_km: selectedRole === 'volunteer' ? Number(travelDistance) : null,
        profile_complete: true, // ✅ NEW
      }).eq('id', user.id);

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
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Bio */}
          <div className="mb-4">
            <label htmlFor="bio" className="block text-sm font-semibold text-gray-700 mb-2">
              Personal Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
              disabled={isLoading}
            />
          </div>

          {/* Phone */}
          <div className="mb-4">
            <label htmlFor="phoneNumber" className="block text-sm font-semibold text-gray-700 mb-2">
              Phone Number
            </label>
            <input
              id="phoneNumber"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
              disabled={isLoading}
            />
          </div>

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
