'use client';

import { useClerk, useUser } from '@clerk/clerk-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import React from 'react';
import { supabase } from '@/utils/supabase/client';

// Import the components
import VolunteerAvailability from '../../components/VolunteerAvailability'; // Adjust path if needed
import MeetWithDog from '../../components/MeetWithDog';
import EditDogProfile from '../../components/EditDogProfile';
import MyVisits from '../../components/MyVisits';


interface UserPublicMetadata {
  role?: string;
}

// A simple email validation helper (regex-based):
const isValidEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const AdminDashboard = () => {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [activeTab, setActiveTab] = useState('profile');

  // New state to track selected dog for the "Meet with a Dog" flow
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);

  // Store profile data from Supabase (bio, image, email, phone_number)
  const [profileData, setProfileData] = useState<any>({
    bio: '',
    profile_image: '',
    email: '',
    phone_number: '',
  });

  const [newProfileImage, setNewProfileImage] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Role state management
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [roleUpdateMessage, setRoleUpdateMessage] = useState({ type: '', message: '' });

  // Load role from localStorage if available
  useEffect(() => {
    const storedRole = localStorage.getItem('selectedRole');
    if (storedRole) {
      setSelectedRole(storedRole);
    }

    if (isLoaded && user) {
      const metadata = user.publicMetadata as UserPublicMetadata;
      setSelectedRole(metadata?.role || '');
    }
  }, [isLoaded, user]);

  // Fetch profile data from Supabase when the user is loaded
  useEffect(() => {
    if (user) {
      const fetchProfileData = async () => {
        console.log('Fetching profile data for user ID:', user.id);

        const { data, error } = await supabase
          .from('users')
          .select('bio, profile_image, email, phone_number')
          .eq('id', user.id)
          .single();

        if (error) {
          setError('Error fetching profile data');
          console.error('Supabase error:', error);
        } else {
          console.log('Fetched profile data:', data);
          setProfileData(data || {});
        }
      };

      fetchProfileData();
    }
  }, [user]);

  // Handle role changes in the dropdown
  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value;
    setSelectedRole(newRole);
    // Save the selected role to localStorage
    localStorage.setItem('selectedRole', newRole);
  };

  // Update role in Clerk via /api/assign-role route (if you have that set up)
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
      const response = await fetch('/api/assign-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, role: selectedRole }),
      });

      if (response.ok) {
        setRoleUpdateMessage({
          type: 'success',
          message: 'Role updated successfully!',
        });

        // Explicitly refresh the user data from Clerk
        await user.reload();
        setRoleUpdateMessage({
          type: 'success',
          message: 'Role updated successfully! You should see the new role.',
        });
      } else {
        const errorData = await response.text();
        setRoleUpdateMessage({
          type: 'error',
          message: `Failed to update role: ${errorData}`,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      setRoleUpdateMessage({
        type: 'error',
        message: `Error updating role: ${errorMessage}`,
      });
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // Sign out via Clerk
  const handleSignOut = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signOut();
      router.push('/sign-in');
    } catch (error) {
      setError('Error signing out. Please try again.');
      console.error('Error signing out:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle profile updates (bio, email, phone_number, etc.)
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    try {
      // Fetch current user data (including email so we don't accidentally set it to null)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, bio, role, phone_number')
        .eq('id', user.id)
        .single();

      if (userError) {
        throw new Error(userError.message);
      }

      // Ensure we send the existing email to avoid NULL errors
      const updatePayload = {
        id: user.id,
        first_name: userData?.first_name,
        last_name: userData?.last_name,
        role: userData?.role,
        email: userData?.email,
        bio: profileData.bio,
        phone_number: profileData.phone_number,
      };

      console.log('Updating user with payload:', updatePayload);

      const { error } = await supabase
        .from('users')
        .upsert(updatePayload, { onConflict: 'id' });

      if (error) {
        console.error('Error updating profile:', error);
        setError('Error updating profile');
      } else {
        console.log('✅ Profile updated successfully!');
        setError(null);
        setActiveTab('profile');
      }
    } catch (error) {
      console.error('Error in profile update:', error);
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
            onClick={() => (window.location.href = '/sign-in')}
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
              onClick={() => {
                setActiveTab('profile');
                setSelectedDogId(null); // reset dog selection if switching tabs
              }}
              className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'profile' ? 'bg-gray-600' : ''}`}
            >
              Profile
            </button>
            <button
              onClick={() => {
                setActiveTab('edit');
                setSelectedDogId(null);
              }}
              className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'edit' ? 'bg-gray-600' : ''}`}
            >
              Edit Profile
            </button>
            {/* My Dog Profile Tab (Only for Volunteers and Admins) */}
            {(selectedRole === 'volunteer' || selectedRole === 'admin') && (
              <button
                onClick={() => {
                  setActiveTab('my-dog-profile');
                  setSelectedDogId(null);
                }}
                className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'my-dog-profile' ? 'bg-gray-600' : ''}`}
              >
                My Dog Profile
              </button>
            )}
            {/* Availability Tab (Only for Volunteers and Admins) */}
            {(selectedRole === 'volunteer' || selectedRole === 'admin') && (
              <button
                onClick={() => {
                  setActiveTab('availability');
                  setSelectedDogId(null);
                }}
                className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'availability' ? 'bg-gray-600' : ''}`}
              >
                Availability
              </button>
            )}
            {/* Meet with a Dog Tab (For Individuals and Admins) */}
            {(selectedRole === 'individual' || selectedRole === 'admin') && (
              <button
                onClick={() => {
                  setActiveTab('meet-with-dog');
                  // Do not reset selectedDogId here; if a dog is already selected, we want to show its profile.
                }}
                className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'meet-with-dog' ? 'bg-gray-600' : ''}`}
              >
                Meet with a Dog
              </button>
            )}
            {(selectedRole === 'individual' || selectedRole === 'volunteer' || selectedRole === 'admin') && (
              <button
                onClick={() => setActiveTab('my-visits')}
                className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'my-visits' ? 'bg-gray-600' : ''
                  }`}
              >
                My Visits
              </button>
            )}

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
              <div
                className={`text-sm p-2 rounded ${roleUpdateMessage.type === 'success'
                  ? 'bg-green-800 text-green-100'
                  : 'bg-red-800 text-red-100'
                  }`}
              >
                {roleUpdateMessage.message}
              </div>
            )}
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleSignOut}
          className="w-full py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 transition duration-200"
        >
          Logout
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 bg-gray-100">
        <h2 className="text-3xl font-semibold mb-6">Admin Dashboard</h2>

        {/* Tabs */}
        {activeTab === 'profile' && (
          <div className="bg-white shadow-lg rounded-lg p-5 mb-6">
            <h3 className="text-xl font-semibold mb-4">Logged in as:</h3>
            <>
              <p className="text-lg text-gray-700">
                <strong>User ID:</strong> {user.id || 'ID not available'}
              </p>
              <p className="text-lg text-gray-700">
                <strong>Name:</strong> {user.firstName || 'First name not available'} {user.lastName || 'Last name not available'}
              </p>
              <p className="text-lg text-gray-700">
                <strong>Email:</strong> {profileData.email || 'Email not available'}
              </p>
              <p className="text-lg text-gray-700">
                <strong>Phone Number:</strong> {profileData.phone_number || 'Phone number not available'}
              </p>
              <p className="text-lg text-gray-700">
                <strong>Profile Type:</strong> <>{user.publicMetadata?.role || 'No role assigned'}</>
              </p>

              {profileData?.bio ? (
                <p className="text-lg text-gray-700 mt-4">
                  <strong>Bio:</strong> {profileData.bio}
                </p>
              ) : (
                <p className="text-lg text-gray-700 mt-4">Bio not available</p>
              )}

              <img
                src={profileData?.profile_image || 'default-image-url'}
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover mt-4"
              />
            </>
          </div>
        )}

        {activeTab === 'edit' && (
          <div className="bg-white shadow-lg rounded-lg p-5 mb-6">
            <h3 className="text-xl font-semibold mb-4">Edit Profile</h3>
            <form onSubmit={handleProfileUpdate}>
              <div className="mb-4">
                <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700">
                  Phone Number
                </label>
                <input
                  type="text"
                  id="phone_number"
                  value={profileData.phone_number || ''}
                  onChange={(e) => setProfileData({ ...profileData, phone_number: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
                />
              </div>
              <div className="mb-4">
                <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
                  Bio
                </label>
                <textarea
                  id="bio"
                  value={profileData.bio || ''}
                  onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
                  rows={4}
                />
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

        {/* My Dog Profile - For Volunteers and Admins */}
        {activeTab === 'my-dog-profile' && (selectedRole === 'volunteer' || selectedRole === 'admin') && (
          <div className="bg-white shadow-lg rounded-lg p-5 mb-6" style={{ minHeight: '60vh' }}>
            <EditDogProfile userId={user.id} />
          </div>
        )}

        {/* Availability - For Volunteers and Admins */}
        {activeTab === 'availability' && (selectedRole === 'volunteer' || selectedRole === 'admin') && (
          <div className="bg-white shadow-lg rounded-lg p-5 mb-6" style={{ minHeight: '60vh' }}>
            <VolunteerAvailability userId={user.id} />
          </div>
        )}

        {/* Meet with a Dog - For Individuals and Admins */}
        {activeTab === 'meet-with-dog' && (selectedRole === 'individual' || selectedRole === 'admin') && (
          <div className="bg-white shadow-lg rounded-lg p-5 mb-6" style={{ minHeight: '60vh' }}>
            <MeetWithDog selectedDogId={selectedDogId} setSelectedDogId={setSelectedDogId} />
          </div>
        )}
        {/* View my visits */}
        {activeTab === 'my-visits' && (
          <div className="bg-white shadow-lg rounded-lg p-5 mb-6" style={{ minHeight: '60vh' }}>
            <MyVisits userId={user.id} role={selectedRole} />
          </div>
        )}


        {/* Unauthorized message */}
        {((activeTab === 'availability' && selectedRole !== 'volunteer' && selectedRole !== 'admin') ||
          (activeTab === 'meet-with-dog' && selectedRole !== 'individual' && selectedRole !== 'admin')) && (
            <p className="text-red-600">You do not have permission to view this page.</p>
          )}
      </div>
    </div>
  );
};

export default AdminDashboard;
