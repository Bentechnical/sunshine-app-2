'use client';

import { useClerk, useUser } from '@clerk/clerk-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import React from 'react';
import { supabase } from '@/utils/supabase/client'; // Import Supabase client

interface UserPublicMetadata {
  role?: string;
}

const AdminDashboard = () => {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [activeTab, setActiveTab] = useState('profile');
  const [profileData, setProfileData] = useState<any>({
    bio: '',
    profile_image: '', // Assuming this is the field for the profile picture
  });
  const [newProfileImage, setNewProfileImage] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Role state management
  const [selectedRole, setSelectedRole] = useState<string>(''); // Ensure selectedRole is always a string
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [roleUpdateMessage, setRoleUpdateMessage] = useState({ type: '', message: '' });

  // Load role from localStorage if available
  useEffect(() => {
    const storedRole = localStorage.getItem('selectedRole');
    if (storedRole) {
      setSelectedRole(storedRole);
    }

    if (isLoaded && user) {
      // Cast the metadata to your type
      const metadata = user.publicMetadata as UserPublicMetadata;
      setSelectedRole(metadata?.role || '');
    }
  }, [isLoaded, user]);

  // Fetch profile data from Supabase when the user is loaded
  useEffect(() => {
    if (user) {
      const fetchProfileData = async () => {
        console.log('Fetching profile data for user ID:', user.id); // Log user ID
        const { data, error } = await supabase
          .from('users') // Ensure this table is correct
          .select('bio, profile_image')
          .eq('id', user.id) // Ensure the user_id matches the Clerk user ID
          .single(); // Fetch a single row

        if (error) {
          setError('Error fetching profile data');
          console.error('Supabase error:', error); // Log Supabase error
        } else {
          console.log('Fetched profile data:', data); // Log data to check
          setProfileData(data);
        }
      };

      fetchProfileData();
    }
  }, [user]);

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value;
    setSelectedRole(newRole);
    // Save the selected role to localStorage
    localStorage.setItem('selectedRole', newRole);
  };

  const updateUserRole = async () => {
    if (!selectedRole) {
      setRoleUpdateMessage({ type: 'error', message: 'Please select a role' });
      return;
    }

    if (!user) {
      setRoleUpdateMessage({ type: 'error', message: 'User not logged in' });
      return;
    }

    setIsUpdatingRole(true);
    setRoleUpdateMessage({ type: '', message: '' });

    try {
      const response = await fetch("/api/assign-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: user.id,
          role: selectedRole,
        }),
      });


      if (response.ok) {
        setRoleUpdateMessage({
          type: 'success',
          message: 'Role updated successfully!'
        });

        // Explicitly refresh the user data from Clerk
        await user.reload();  // Refresh user data from Clerk
        setRoleUpdateMessage({
          type: 'success',
          message: 'Role updated successfully! You should see the new role.',
        });
      } else {
        const errorData = await response.text();
        setRoleUpdateMessage({
          type: 'error',
          message: `Failed to update role: ${errorData}`
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'Unknown error occurred';

      setRoleUpdateMessage({
        type: 'error',
        message: `Error updating role: ${errorMessage}`
      });
    } finally {
      setIsUpdatingRole(false); // Reset the updating state
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signOut();
      router.push('/sign-in');
    } catch (error) {
      setError("Error signing out. Please try again.");
      console.error("Error signing out:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    try {
      let profile_image = profileData.profile_image;

      if (newProfileImage) {
        // Upload new profile image to Supabase Storage (assuming you have set up storage)
        const { data, error: uploadError } = await supabase.storage
          .from('profile-images')
          .upload(`public/${user.id}/${newProfileImage.name}`, newProfileImage);

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        profile_image = data?.path || profile_image; // Update the profile image path
      }

      const { error } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          bio: profileData.bio,
          profile_image,
        });

      if (error) {
        setError('Error updating profile');
      } else {
        alert('Profile updated successfully!');
        setError(null);
      }
    } catch (error) {
      setError('Error updating profile');
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <h2 className="text-3xl font-semibold text-gray-800 mb-4">Loading...</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <h2 className="text-3xl font-semibold text-gray-800 mb-4">You are not logged in</h2>
          <p className="text-gray-600">Please log in to proceed</p>
          <button
            onClick={() => window.location.href = '/sign-in'}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 text-white p-5 space-y-6 flex flex-col justify-between">
        <div>
          <h2 className="text-xl font-bold">Admin Dashboard</h2>
          <div>
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'profile' ? 'bg-gray-600' : ''}`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveTab('edit')}
              className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'edit' ? 'bg-gray-600' : ''}`}
            >
              Edit Profile
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'users' ? 'bg-gray-600' : ''}`}
            >
              Users
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'settings' ? 'bg-gray-600' : ''}`}
            >
              Settings
            </button>
          </div>
        </div>

        {/* Role Management Section */}
        <div className="border-t border-gray-700 pt-4 mt-4">
          <h3 className="text-lg font-medium mb-2">Update Your Role</h3>
          <div className="space-y-3">
            <select
              value={selectedRole}
              onChange={handleRoleChange}
              className="w-full px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Role</option>
              <option value="volunteer">Volunteer</option>
              <option value="admin">Admin</option>
              <option value="individual">Individual</option>
            </select>
            <button
              onClick={updateUserRole}
              disabled={isUpdatingRole}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200 disabled:bg-gray-500"
            >
              {isUpdatingRole ? 'Updating...' : 'Update Role'}
            </button>
            {roleUpdateMessage.message && (
              <div className={`text-sm p-2 rounded ${roleUpdateMessage.type === 'success'
                  ? 'bg-green-800 text-green-100'
                  : 'bg-red-800 text-red-100'
                }`}>
                {roleUpdateMessage.message}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      {/* Main Content */}
      <div className="flex-1 p-6 bg-gray-100">
        <h2 className="text-3xl font-semibold mb-6">Admin Dashboard</h2>

        {/* Tabs */}
        {activeTab === 'profile' && (
          <div className="bg-white shadow-lg rounded-lg p-5 mb-6">
            <h3 className="text-xl font-semibold mb-4">Logged in as:</h3>
            {user ? (
              <>
                <p className="text-lg text-gray-700">
                  <strong>User ID:</strong> {user.id || 'ID not available'}
                </p>
                <p className="text-lg text-gray-700">
                  <strong>Name:</strong> {user.firstName || 'First name not available'} {user.lastName || 'Last name not available'}
                </p>
                <p className="text-lg text-gray-700">
                  <strong>Email:</strong> {user.emailAddresses?.[0]?.emailAddress || 'Email not available'}
                </p>
                <p className="text-lg text-gray-700">
                  <strong>Profile Type:</strong>  <>{user.publicMetadata?.role || 'No role assigned'}</>
                </p>

                {/* Display Bio from Supabase */}
                {profileData?.bio ? (
                  <p className="text-lg text-gray-700 mt-4">
                    <strong>Bio:</strong> {profileData.bio || 'Bio not available'}
                  </p>
                ) : (
                  <p className="text-lg text-gray-700 mt-4">Bio not available</p>
                )}

                {/* Profile Picture at the bottom */}
                <img
                  src={profileData?.profile_image || 'default-image-url'}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover mt-4"
                />

              </>
            ) : (
              <p className="text-lg text-gray-700">User information not available</p>
            )}
          </div>
        )}
        {activeTab === 'edit' && (
          <div className="bg-white shadow-lg rounded-lg p-5 mb-6">
            <h3 className="text-xl font-semibold mb-4">Edit Profile</h3>

            <form onSubmit={handleProfileUpdate}>
              {/* Bio Field */}
              <div className="mb-4">
                <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
                  Bio
                </label>
                <textarea
                  id="bio"
                  value={profileData.bio}
                  onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
                  rows={4}
                />
              </div>

              {/* Profile Image Upload */}
              <div className="mb-4">
                <label htmlFor="profile_image" className="block text-sm font-medium text-gray-700">
                  Profile Image
                </label>
                <input
                  type="file"
                  id="profile_image"
                  accept="image/*"
                  onChange={(e) => setNewProfileImage(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
                />
                {profileData.profile_image && !newProfileImage && (
                  <img
                    src={profileData.profile_image}
                    alt="Current Profile"
                    className="mt-2 w-24 h-24 rounded-full object-cover"
                  />
                )}
              </div>

              <button
                type="submit"
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200"
              >
                Save Changes
              </button>
            </form>

            {error && <p className="text-red-600 mt-4">{error}</p>}
          </div>
        )}


        {/* Other content for 'dashboard', 'sessions', 'users', etc. */}
      </div>
    </div>
  );
};

export default AdminDashboard;