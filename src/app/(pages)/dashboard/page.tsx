'use client';

import { useClerk, useUser } from '@clerk/clerk-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import React from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';

import VolunteerAvailability from '../../../components/availability/VolunteerAvailability';
import MeetWithDog from '../../../components/visits/MeetWithDog';
import EditDogProfile from '../../../components/dog/EditDogProfile';
import MyVisits from '../../../components/visits/MyVisits';
import EditProfileForm from '../../../components/profile/EditProfileForm';

interface UserPublicMetadata {
  role?: string;
}

const AdminDashboard = () => {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

  // -----------------------------------------------------------
  // ALL HOOKS: must always be called, regardless of user state
  // -----------------------------------------------------------
  const [activeTab, setActiveTab] = useState('profile');
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);

  const [profileData, setProfileData] = useState<any>({
    bio: '',
    profile_image: '',
    email: '',
    phone_number: '',
  });
  const [newProfileImage, setNewProfileImage] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [roleUpdateMessage, setRoleUpdateMessage] = useState({ type: '', message: '' });

  // Create a Supabase client that attaches the Clerk token
  const supabase = useSupabaseClient();

  // We'll define this for usage in effects. It's "true" if user is loaded & not null
  const isUserReady = isLoaded && Boolean(user);

  // --- HOOK 1: Load role from localStorage & Clerk metadata
  useEffect(() => {
    if (!isUserReady) return;

    // Because isUserReady is true, "user" is guaranteed non-null
    const storedRole = localStorage.getItem('selectedRole');
    if (storedRole) {
      setSelectedRole(storedRole);
    }
    const metadata = user!.publicMetadata as UserPublicMetadata;
    setSelectedRole(metadata?.role || '');
  }, [isUserReady, user]);

  // --- HOOK 2: Fetch profile data from Supabase
  useEffect(() => {
    if (!isUserReady) return;

    async function fetchProfileData() {
      console.log('Fetching profile data for user ID:', user!.id);
      const { data, error } = await supabase
        .from('users')
        .select('bio, profile_image, email, phone_number')
        .eq('id', user!.id)
        .single();

      if (error) {
        setError('Error fetching profile data');
        console.error('Supabase error:', error);
      } else {
        console.log('Fetched profile data:', data);
        setProfileData(data || {});
      }
    }

    fetchProfileData();
  }, [isUserReady, user, supabase]);

  // -----------------------------------------------------------
  // UTILITY FUNCTIONS
  // -----------------------------------------------------------

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value;
    setSelectedRole(newRole);
    localStorage.setItem('selectedRole', newRole);
  };

  const updateUserRole = async () => {
    if (!selectedRole) {
      setRoleUpdateMessage({ type: 'error', message: 'Please select a role' });
      return;
    }

    if (!isUserReady) {
      setRoleUpdateMessage({ type: 'error', message: 'User not logged in' });
      return;
    }

    setIsUpdatingRole(true);
    setRoleUpdateMessage({ type: '', message: '' });

    try {
      // Because isUserReady is true, we can safely do user!.id
      const response = await fetch('/api/assign-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user!.id, role: selectedRole }),
      });

      if (response.ok) {
        setRoleUpdateMessage({
          type: 'success',
          message: 'Role updated successfully!',
        });
        // Refresh user data from Clerk
        await user!.reload();
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setRoleUpdateMessage({
        type: 'error',
        message: `Error updating role: ${errorMessage}`,
      });
    } finally {
      setIsUpdatingRole(false);
    }
  };

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

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUserReady) return;

    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, bio, role, phone_number')
        .eq('id', user!.id)
        .single();

      if (userError) {
        throw new Error(userError.message);
      }

      const updatePayload = {
        id: user!.id,
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

  // -----------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------

  // We do NOT do an early "return" here, so the hooks always run in the same order.
  // Instead, we conditionally render a loading UI or the main UI.
  return (
    <>
      {!isUserReady ? (
        // LOADING UI
        <div className="flex items-center justify-center h-screen bg-gray-100">
          <div className="text-center">
            <h2 className="text-3xl font-semibold text-gray-800 mb-4">Loading...</h2>
          </div>
        </div>
      ) : (
        // MAIN UI
        <div className="min-h-screen flex">
          {/* Sidebar */}
          <div className="w-64 bg-gray-800 text-white p-5 space-y-6 flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-bold">Admin Dashboard</h2>
              <div>
                <button
                  onClick={() => {
                    setActiveTab('profile');
                    setSelectedDogId(null);
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
                {(selectedRole === 'individual' || selectedRole === 'admin') && (
                  <button
                    onClick={() => {
                      setActiveTab('meet-with-dog');
                    }}
                    className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'meet-with-dog' ? 'bg-gray-600' : ''}`}
                  >
                    Meet with a Dog
                  </button>
                )}
                {(selectedRole === 'individual' ||
                  selectedRole === 'volunteer' ||
                  selectedRole === 'admin') && (
                    <button
                      onClick={() => setActiveTab('my-visits')}
                      className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'my-visits' ? 'bg-gray-600' : ''}`}
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
                    className={`text-sm p-2 rounded ${roleUpdateMessage.type === 'success' ? 'bg-green-800 text-green-100' : 'bg-red-800 text-red-100'
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
                    <strong>User ID:</strong> {user!.id}
                  </p>
                  <p className="text-lg text-gray-700">
                    <strong>Name:</strong> {user!.firstName || 'First name not available'}{' '}
                    {user!.lastName || 'Last name not available'}
                  </p>
                  <p className="text-lg text-gray-700">
                    <strong>Email:</strong> {profileData.email || 'Email not available'}
                  </p>
                  <p className="text-lg text-gray-700">
                    <strong>Phone Number:</strong> {profileData.phone_number || 'Phone number not available'}
                  </p>
                  <p className="text-lg text-gray-700">
                    <strong>Profile Type:</strong>{' '}
                    {typeof user!.publicMetadata?.role === 'string'
                      ? user!.publicMetadata.role
                      : 'No role assigned'}
                  </p>
                  {profileData?.bio ? (
                    <p className="text-lg text-gray-700 mt-4">
                      <strong>Bio:</strong> {profileData.bio}
                    </p>
                  ) : (
                    <p className="text-lg text-gray-700 mt-4">Bio not available</p>
                  )}
                  {profileData?.profile_image && (
                    <img
                      src={profileData.profile_image}
                      alt="Profile"
                      className="w-24 h-24 rounded-full object-cover mt-4"
                    />
                  )}
                </>
              </div>
            )}

            {activeTab === 'edit' && (
              <EditProfileForm
                initialBio={profileData.bio}
                initialPhone={profileData.phone_number}
                initialAvatarUrl={profileData.profile_image}
                onSubmit={async (bio, phone, avatarUrl) => {
                  if (!isUserReady) return;
                  try {
                    const { error } = await supabase
                      .from('users')
                      .update({
                        bio,
                        phone_number: phone,
                        profile_image: avatarUrl,
                      })
                      .eq('id', user!.id);

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
                }}
                error={error}
              />
            )}

            {activeTab === 'my-dog-profile' && (selectedRole === 'volunteer' || selectedRole === 'admin') && (
              <div className="bg-white shadow-lg rounded-lg p-5 mb-6" style={{ minHeight: '60vh' }}>
                <EditDogProfile />
              </div>
            )}

            {activeTab === 'availability' && (selectedRole === 'volunteer' || selectedRole === 'admin') && (
              <div className="bg-white shadow-lg rounded-lg p-5 mb-6" style={{ minHeight: '60vh' }}>
                <VolunteerAvailability userId={user!.id} />
              </div>
            )}

            {activeTab === 'meet-with-dog' && (selectedRole === 'individual' || selectedRole === 'admin') && (
              <div className="bg-white shadow-lg rounded-lg p-5 mb-6" style={{ minHeight: '60vh' }}>
                <MeetWithDog selectedDogId={selectedDogId} setSelectedDogId={setSelectedDogId} />
              </div>
            )}

            {activeTab === 'my-visits' && (
              <div className="bg-white shadow-lg rounded-lg p-5 mb-6" style={{ minHeight: '60vh' }}>
                <MyVisits userId={user!.id} role={selectedRole} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default AdminDashboard;
