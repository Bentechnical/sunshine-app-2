'use client';

import { useUser } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { streamChatManager } from '@/utils/stream-chat-client';

export default function StreamChatCleanup() {
  const { user, isSignedIn } = useUser();

  useEffect(() => {
    // Cleanup Stream Chat when user signs out
    if (!isSignedIn) {
      streamChatManager.disconnectUser();
    }
  }, [isSignedIn]);

  // This component doesn't render anything
  return null;
} 