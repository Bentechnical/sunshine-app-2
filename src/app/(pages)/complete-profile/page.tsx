// /src/app/profile-complete/page.tsx
'use client';

import React, { useState, useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { useRouter } from "next/navigation";
import ImageUpload from "@/app/components/ImageUpload";

export default function ProfileCompletePage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  // Fade-in state for animation.
  const [fadeIn, setFadeIn] = useState(false);

  // Form state
  const [selectedRole, setSelectedRole] = useState("");
  const [roleError, setRoleError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Common fields
  const [bio, setBio] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");

  // Volunteer-specific fields
  const [dogName, setDogName] = useState("");
  const [dogAge, setDogAge] = useState("");
  const [dogBreed, setDogBreed] = useState("");
  const [dogBio, setDogBio] = useState("");
  const [dogPhotoUrl, setDogPhotoUrl] = useState("");

  // Wait for user data to load, then trigger fade-in.
  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(() => {
        setFadeIn(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoaded]);

  // Show a spinner if user data isn't loaded.
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Validate role selection and required fields.
  const validateForm = () => {
    if (!selectedRole) {
      setSubmitError("Please select your role.");
      return false;
    }
    if (!bio) {
      setSubmitError("Please provide a personal bio.");
      return false;
    }
    // For volunteers, ensure dog's info is filled.
    if (selectedRole === "volunteer") {
      if (!dogName || !dogAge || !dogBreed || !dogBio || !dogPhotoUrl) {
        setSubmitError("Please complete all fields for your dog's profile.");
        return false;
      }
    }
    return true;
  };

  const handleRoleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRole(event.target.value);
    setRoleError(false);
    setSubmitError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    // Build the payload for the profile completion API.
    const payload: any = {
      id: user?.id,
      role: selectedRole,
      bio,
      profilePictureUrl,
    };

    if (selectedRole === "volunteer") {
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
        await user?.reload(); // Refresh Clerk user data.
        router.push("/dashboard");
      } else {
        const errorData = await response.json();
        setSubmitError(errorData.error || "Error completing profile");
      }
    } catch (error) {
      if (error instanceof Error) {
        setSubmitError(`Error occurred: ${error.message}`);
      } else {
        setSubmitError("An unknown error occurred");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div
        className={`w-full max-w-lg p-6 bg-white rounded-lg shadow-md transition-opacity duration-500 ${
          fadeIn ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Greeting */}
        <h2 className="text-2xl font-semibold text-center mb-4">
          Hi {user?.firstName}, welcome to Sunshine. We are glad to have you!
        </h2>
        <p className="text-center mb-6">
          Please tell us more about yourself.
        </p>

        <form onSubmit={handleSubmit}>
          {/* Role selection */}
          <div className="mb-4">
            <label
              htmlFor="role"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              Select your role
            </label>
            <select
              id="role"
              value={selectedRole}
              onChange={handleRoleChange}
              className={`w-full px-4 py-2 border rounded-lg text-gray-700 ${
                roleError ? "border-red-500" : "border-gray-300"
              }`}
              disabled={isLoading}
            >
              <option value="">Select Role</option>
              <option value="individual">Individual</option>
              <option value="volunteer">Volunteer</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Common Fields */}
          <div className="mb-4">
            <label
              htmlFor="bio"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
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

          <div className="mb-4">
            <p className="block text-sm font-semibold text-gray-700 mb-2">
              Profile Picture
            </p>
            <ImageUpload onUpload={(url) => setProfilePictureUrl(url)} />
            {profilePictureUrl && (
              <img
                src={profilePictureUrl}
                alt="Profile Picture"
                className="w-20 h-20 mt-2 rounded-full object-cover"
              />
            )}
          </div>

          {/* Volunteer-Specific Fields */}
          {selectedRole === "volunteer" && (
            <>
              <h3 className="text-lg font-bold mb-2">Dog Profile</h3>

              <div className="mb-4">
                <label
                  htmlFor="dogName"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
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
                <label
                  htmlFor="dogAge"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
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
                <label
                  htmlFor="dogBreed"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
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
                <label
                  htmlFor="dogBio"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
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
                <p className="block text-sm font-semibold text-gray-700 mb-2">
                  Dog Photo
                </p>
                <ImageUpload onUpload={(url) => setDogPhotoUrl(url)} />
                {dogPhotoUrl && (
                  <img
                    src={dogPhotoUrl}
                    alt="Dog Photo"
                    className="w-20 h-20 mt-2 rounded object-cover"
                  />
                )}
              </div>
            </>
          )}

          {submitError && (
            <p className="text-red-500 text-sm mt-2">{submitError}</p>
          )}

          <button
            type="submit"
            className="w-full mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg"
            disabled={isLoading}
          >
            {isLoading ? "Submitting..." : "Submit Profile"}
          </button>
        </form>
      </div>
    </div>
  );
}
