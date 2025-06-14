//src/components/profile/PofileTab.tsx

'use client';

import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';

import ProfileCard from '@/components/profile/ProfileCard';
import EditProfileForm from '@/components/profile/EditProfileForm';
import { Button } from '@/components/ui/button';



export default function ProfileTab() {
  const { user } = useUser();
  const supabase = useSupabaseClient();

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userData, setUserData] = useState<{
    userId?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    role?: string;
    bio?: string;
    profileImage?: string;
  }>({});

  useEffect(() => {
    const loadUserData = async () => {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from('users')
        .select(
          'id, first_name, last_name, email, phone_number, role, bio, profile_image'
        )
        .eq('id', user.id)
        .single();

      if (error) {
        setError('Failed to load user data.');
        console.error(error);
      } else {
        setUserData({
          userId: data.id,
          firstName: data.first_name,
          lastName: data.last_name,
          email: data.email,
          phoneNumber: data.phone_number,
          role: data.role,
          bio: data.bio,
          profileImage: data.profile_image,
        });
      }

      setLoading(false);
    };

    loadUserData();
  }, [user?.id, supabase]);

  const handleSave = async (bio: string, phone: string, avatarUrl?: string) => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('users')
      .update({
        bio,
        phone_number: phone,
        profile_image: avatarUrl,
      })
      .eq('id', user.id);

    if (error) {
      setError('Failed to update profile.');
      console.error(error);
    } else {
      setUserData((prev) => ({
        ...prev,
        bio,
        phoneNumber: phone,
        profileImage: avatarUrl,
      }));
      setIsEditing(false);
      setError(null);
    }
  };

  if (loading) {
    return <div className="text-gray-600">Loading profile...</div>;
  }

  return (
  <div>
    {!isEditing ? (
      <>
        <ProfileCard {...userData} />
        <Button onClick={() => setIsEditing(true)}>
          Edit Profile
        </Button>
      </>
    ) : (
      <EditProfileForm
        initialBio={userData.bio}
        initialPhone={userData.phoneNumber}
        initialAvatarUrl={userData.profileImage}
        onSubmit={handleSave}
        error={error}
      />
    )}
  </div>
);

}
