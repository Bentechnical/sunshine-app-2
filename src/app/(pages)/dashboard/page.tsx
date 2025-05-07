'use client';

import { useClerk, useUser } from '@clerk/clerk-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabaseClient } from '@/utils/supabase/client';

import VolunteerAvailability from '@/components/availability/VolunteerAvailability';
import MeetWithDog from '@/components/visits/MeetWithDog';
import EditDogProfile from '@/components/dog/EditDogProfile';
import MyVisits from '@/components/visits/MyVisits';
import EditProfileForm from '@/components/profile/EditProfileForm';

const AdminDashboard: React.FC = () => {
  const { isLoaded, user } = useUser();
  const supabase = useSupabaseClient();
  const { signOut } = useClerk();
  const router = useRouter();

  const userId = user?.id;
  const isUserReady = isLoaded && !!userId;

  const [activeTab, setActiveTab] = useState<'profile' | 'edit' | 'my-dog-profile' | 'availability' | 'meet-with-dog' | 'my-visits'>('profile');
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<{ bio: string; profile_image: string; email: string; phone_number: string }>({ bio: '', profile_image: '', email: '', phone_number: '' });
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [roleUpdateMessage, setRoleUpdateMessage] = useState<{ type: string; message: string }>({ type: '', message: '' });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isUserReady) return;
    const stored = localStorage.getItem('selectedRole');
    if (stored) setSelectedRole(stored);
    const metaRole = (user?.publicMetadata as { role?: string }).role;
    setSelectedRole(metaRole || '');
  }, [isUserReady, user]);

  useEffect(() => {
    if (isLoaded && !user) {
      router.push('/sign-in');
    }
  }, [isLoaded, user]);

  const fetchProfileData = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('bio, profile_image, email, phone_number')
      .eq('id', userId)
      .single();

    if (error) {
      setError('Error fetching profile data');
    } else {
      setProfileData(data || {});
    }
  };

  useEffect(() => {
    if (!userId) return;
    fetchProfileData();
  }, [userId]);

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value;
    setSelectedRole(newRole);
    localStorage.setItem('selectedRole', newRole);
  };

  const updateUserRole = async (): Promise<void> => {
    if (!selectedRole || !userId) {
      setRoleUpdateMessage({ type: 'error', message: 'Please select a role' });
      return;
    }
    setIsUpdatingRole(true);
    try {
      const res = await fetch('/api/assign-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, role: selectedRole }),
      });
      if (!res.ok) throw new Error(await res.text());
      await user?.reload();
      setRoleUpdateMessage({ type: 'success', message: 'Role updated successfully!' });
    } catch (err: any) {
      setRoleUpdateMessage({ type: 'error', message: err.message || 'Error updating role' });
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(() => {
        router.push('/sign-in');
      });
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleProfileUpdate = async (
    bio: string,
    phone: string,
    avatarUrl?: string
  ): Promise<void> => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({
          bio,
          phone_number: phone,
          profile_image: avatarUrl || '',
        })
        .eq('id', userId);

      if (error) {
        setError(`Update failed: ${error.message}`);
        return;
      }

      await fetchProfileData();
      setError(null);
      setActiveTab('profile');
    } catch (err: any) {
      setError(err.message || 'Unexpected error updating profile');
    }
  };

  if (!isUserReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <h2 className="text-3xl font-semibold text-gray-800">Loading…</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-gray-800 text-white p-5 flex flex-col justify-between">
        <div>
          <h2 className="text-xl font-bold mb-6">Admin Dashboard</h2>
          <nav className="space-y-2">
            <button onClick={() => { setActiveTab('profile'); setSelectedDogId(null); }} className={`block w-full text-left px-4 py-2 rounded ${activeTab === 'profile' ? 'bg-gray-600' : ''}`}>Profile</button>
            <button onClick={() => { setActiveTab('edit'); setSelectedDogId(null); }} className={`block w-full text-left px-4 py-2 rounded ${activeTab === 'edit' ? 'bg-gray-600' : ''}`}>Edit Profile</button>
            {(selectedRole === 'volunteer' || selectedRole === 'admin') && (
              <>
                <button onClick={() => { setActiveTab('my-dog-profile'); setSelectedDogId(null); }} className={`block w-full text-left px-4 py-2 rounded ${activeTab === 'my-dog-profile' ? 'bg-gray-600' : ''}`}>My Dog Profile</button>
                <button onClick={() => { setActiveTab('availability'); setSelectedDogId(null); }} className={`block w-full text-left px-4 py-2 rounded ${activeTab === 'availability' ? 'bg-gray-600' : ''}`}>Availability</button>
              </>
            )}
            {(selectedRole === 'individual' || selectedRole === 'admin') && (
              <button onClick={() => setActiveTab('meet-with-dog')} className={`block w-full text-left px-4 py-2 rounded ${activeTab === 'meet-with-dog' ? 'bg-gray-600' : ''}`}>Meet with a Dog</button>
            )}
            <button onClick={() => setActiveTab('my-visits')} className={`block w-full text-left px-4 py-2 rounded ${activeTab === 'my-visits' ? 'bg-gray-600' : ''}`}>My Visits</button>
          </nav>
        </div>

        <div>
          <div className="border-t border-gray-700 pt-4 mt-4">
            <h3 className="text-lg font-medium mb-2">Update Your Role</h3>
            <select value={selectedRole} onChange={handleRoleChange} className="w-full mb-2 px-3 py-2 bg-gray-700 rounded">
              <option value="">Select Role</option>
              <option value="volunteer">Volunteer</option>
              <option value="admin">Admin</option>
              <option value="individual">Individual</option>
            </select>
            <button onClick={updateUserRole} disabled={isUpdatingRole} className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500">
              {isUpdatingRole ? 'Updating…' : 'Update Role'}
            </button>
            {roleUpdateMessage.message && (
              <p className={`mt-2 p-2 rounded ${roleUpdateMessage.type === 'success' ? 'bg-green-800 text-green-100' : 'bg-red-800 text-red-100'}`}>{roleUpdateMessage.message}</p>
            )}
          </div>
          <button onClick={handleSignOut} className="w-full py-2 mt-4 rounded bg-red-600 hover:bg-red-700">Logout</button>
        </div>
      </aside>

      <main className="flex-1 p-6 bg-gray-100">
        <h2 className="text-3xl font-semibold mb-6">Admin Dashboard</h2>

        {activeTab === 'profile' && (
          <section className="bg-white shadow rounded-lg p-6 mb-6">
            <h3 className="text-xl font-semibold mb-4">Logged in as:</h3>
            <p><strong>User ID:</strong> {userId}</p>
            <p><strong>Name:</strong> {user?.firstName || 'N/A'} {user?.lastName || ''}</p>
            <p><strong>Email:</strong> {profileData.email || 'N/A'}</p>
            <p><strong>Phone:</strong> {profileData.phone_number || 'N/A'}</p>
            <p><strong>Profile Type:</strong> {selectedRole || 'N/A'}</p>
            {profileData.bio && <p className="mt-4"><strong>Bio:</strong> {profileData.bio}</p>}
            {profileData.profile_image && (
              <img
                src={`${profileData.profile_image}?t=${Date.now()}`}
                alt="Profile"
                className="w-24 h-24 rounded-full mt-4"
              />
            )}
          </section>
        )}

        {activeTab === 'edit' && (
          <EditProfileForm
            initialBio={profileData.bio}
            initialPhone={profileData.phone_number}
            initialAvatarUrl={profileData.profile_image}
            onSubmit={handleProfileUpdate}
            error={error}
          />
        )}

        {activeTab === 'my-dog-profile' && (selectedRole === 'volunteer' || selectedRole === 'admin') && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <EditDogProfile />
          </div>
        )}

        {activeTab === 'availability' && (selectedRole === 'volunteer' || selectedRole === 'admin') && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <VolunteerAvailability userId={userId!} />
          </div>
        )}

        {activeTab === 'meet-with-dog' && (selectedRole === 'individual' || selectedRole === 'admin') && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <MeetWithDog selectedDogId={selectedDogId} setSelectedDogId={setSelectedDogId} />
          </div>
        )}

        {activeTab === 'my-visits' && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <MyVisits userId={userId!} role={selectedRole} />
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
