// src/components/dashboard/fragments/AnnouncementBanner.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';

interface AnnouncementBannerProps {
  userType: 'individual' | 'volunteer';
  fallbackMessage?: string;
}

export default function AnnouncementBanner({ userType, fallbackMessage }: AnnouncementBannerProps) {
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const supabase = useSupabaseClient();

  useEffect(() => {
    const fetchMessage = async () => {
      try {
        const { data, error } = await supabase
          .from('welcome_messages')
          .select('message')
          .eq('user_type', userType)
          .eq('is_active', true)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
          console.error('Error fetching welcome message:', error);
        }

        setMessage(data?.message || '');
      } catch (err) {
        console.error('Error fetching welcome message:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessage();
  }, [supabase, userType]);

  if (loading) {
    return (
      <div className="bg-yellow-100 text-yellow-900 px-4 py-2 rounded border border-yellow-300 shadow-sm">
        <div className="animate-pulse">
          <div className="h-4 bg-yellow-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  const displayMessage = message || fallbackMessage || 'Welcome!';

  return (
    <div className="bg-yellow-100 text-yellow-900 px-4 py-2 rounded border border-yellow-300 shadow-sm">
      <p className="text-sm font-medium">{displayMessage}</p>
    </div>
  );
}
