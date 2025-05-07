// /src/app/profile-complete/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useRouter } from 'next/navigation';
import AvatarUpload from '@/components/profile/AvatarUpload';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function ProfileCompletePage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const [fadeIn, setFadeIn] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showProfileWarning, setShowProfileWarning] = useState(false);
  const [bypassWarning, setBypassWarning] = useState(false);

  const [bio, setBio] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [phone, setPhone] = useState('');


  const [dogName, setDogName] = useState('');
  const [dogAge, setDogAge] = useState('');
  const [dogBreed, setDogBreed] = useState('');
  const [dogBio, setDogBio] = useState('');
  const [dogPhotoUrl, setDogPhotoUrl] = useState('');

  // If we have a dog fallback, point to an image in public/images, e.g. /images/default_dog.png
  // We'll prepend NEXT_PUBLIC_BASE_URL if needed, in AvatarUpload.
  const DEFAULT_DOG_IMAGE = '/images/default_dog.png';

  useEffect(() => {
    if (isLoaded) {
      setTimeout(() => setFadeIn(true), 100);
      // If you already have the user's avatar stored somewhere else, 
      // or if user?.imageUrl is the "profile_picture" from DB:
      if (user && user.imageUrl) {
        setProfilePictureUrl(user.imageUrl);
      }
    }
  }, [isLoaded, user]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const validateForm = () => {
    if (!selectedRole) {
      setSubmitError('Please select your role.');
      return false;
    }
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

    if (!validateForm()) return;

    // Show a warning if user hasn't set a profile pic or bio yet
    if (!bypassWarning && (!bio || !profilePictureUrl)) {
      setShowProfileWarning(true);
      return;
    }

    setIsLoading(true);

    const payload: any = {
      id: user?.id,
      role: selectedRole,
      bio,
      phone_number: phone,
      profilePictureUrl,
    };

    if (selectedRole === 'volunteer') {
      payload.dog = {
        name: dogName,
        age: dogAge,
        breed: dogBreed,
        bio: dogBio,
        photoUrl: dogPhotoUrl,
      };
    }

    try {
      const response = await fetch('/api/profile-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await user?.reload();
        router.push('/dashboard');
      } else {
        const errorData = await response.json();
        setSubmitError(errorData.error || 'Error completing profile');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-white p-4">
      <div
        className={`w-full max-w-lg p-6 bg-white rounded-lg shadow-md transition-opacity duration-500 ${fadeIn ? 'opacity-100' : 'opacity-0'
          }`}
      >
        <h2 className="text-2xl font-semibold text-center mb-4">
          Hi {user?.firstName}, welcome to Sunshine!
        </h2>
        <p className="text-center mb-6">Please tell us more about yourself.</p>

        <form onSubmit={handleSubmit}>
          {/* Role selection */}
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
              placeholder="Tell us about yourself"
              disabled={isLoading}
            />
          </div>

          {/* Phone Number */}
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
              placeholder="Enter your phone number"
              disabled={isLoading}
            />
          </div>


          {/* Avatar Upload */}
          <div className="mb-4">
            <p className="block text-sm font-semibold text-gray-700 mb-2">Profile Picture</p>
            <AvatarUpload
              initialUrl={profilePictureUrl}
              fallbackUrl={user?.imageUrl} // Or '' if you don't want to show the Clerk image
              onUpload={(url) => setProfilePictureUrl(url)}
              size={100}
              altText="User Profile Picture"
            />
          </div>

          {/* Dog Section */}
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
                  placeholder="Enter your dog's name"
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
                  placeholder="Enter your dog's age"
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
                  placeholder="Enter your dog's breed"
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
                  placeholder="Tell us about your dog"
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

      {/* Modal Warning */}
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
