'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { streamChatManager } from '@/utils/stream-chat-client';
import { StreamChat } from 'stream-chat';

interface UnreadCountContextType {
  hasUnreadMessages: boolean;
  loading: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  client: StreamChat | null;
  refreshUnreadCount: () => Promise<void>;
}

const UnreadCountContext = createContext<UnreadCountContextType | null>(null);

export function useUnreadCount() {
  const context = useContext(UnreadCountContext);
  if (!context) {
    throw new Error('useUnreadCount must be used within an UnreadCountProvider');
  }
  return context;
}

interface UnreadCountProviderProps {
  children: React.ReactNode;
}

export function UnreadCountProvider({ children }: UnreadCountProviderProps) {
  const { user } = useUser();
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<StreamChat | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  // Use refs to prevent excessive API calls
  const lastUnreadCheckRef = useRef<number>(0);
  const isCheckingUnreadRef = useRef(false);

  const cleanupChatState = useCallback(() => {
    setClient(null);
    setConnectionStatus('disconnected');
    setHasUnreadMessages(false);
    setLoading(false);
  }, []);

  // Shared unread count loading with throttling
  const loadUnreadCount = useCallback(async () => {
    if (!client || !client.userID || isCheckingUnreadRef.current) {
      console.log('[UnreadCountContext] Skipping unread check - no client or already checking');
      setHasUnreadMessages(false);
      setLoading(false);
      return;
    }

    // Throttle API calls to prevent rate limiting (max once per 2 seconds)
    const now = Date.now();
    if (now - lastUnreadCheckRef.current < 2000) {
      console.log('[UnreadCountContext] Throttling unread check - too soon since last call');
      return;
    }

    isCheckingUnreadRef.current = true;
    lastUnreadCheckRef.current = now;

    try {
      console.log('[UnreadCountContext] 🔍 Checking unread count (shared state)...');

      const unreadResponse = await client.getUnreadCount();

      console.log('[UnreadCountContext] Got unread counts from Stream Chat API:', {
        total_unread: unreadResponse.total_unread_count,
        channels: unreadResponse.channels?.length,
        timestamp: new Date().toISOString()
      });

      const hasUnread = (unreadResponse.total_unread_count || 0) > 0;
      setHasUnreadMessages(hasUnread);
      setLoading(false);

      console.log('[UnreadCountContext] ✅ Updated shared unread state:', {
        hasUnread,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[UnreadCountContext] ❌ Error getting unread count:', error);
      setHasUnreadMessages(false);
      setLoading(false);
    } finally {
      isCheckingUnreadRef.current = false;
    }
  }, [client]);

  // Public refresh function for components that need to force an update
  const refreshUnreadCount = useCallback(async () => {
    // Reset throttling for manual refresh
    lastUnreadCheckRef.current = 0;
    await loadUnreadCount();
  }, [loadUnreadCount]);

  // Initialize chat connection
  useEffect(() => {
    if (!user) return;

    const initializeChat = async () => {
      setConnectionStatus('connecting');
      setLoading(true);

      try {
        console.log('[UnreadCountContext] 🔄 Initializing shared chat connection...');

        const newClient = await streamChatManager.connectUserWithProvider(
          user.id,
          {
            id: user.id,
            name: user.fullName || user.firstName || 'User',
            image: user.imageUrl || undefined,
          }
        );

        if (newClient) {
          console.log('[UnreadCountContext] ✅ Shared chat client connected');
          setClient(newClient);
          setConnectionStatus('connected');
          await loadUnreadCount();

          // Set up shared event listeners for real-time unread count updates
          const updateUnreadCounts = async () => {
            try {
              console.log('[UnreadCountContext] 🔄 Real-time unread update triggered (shared)');
              await loadUnreadCount();
            } catch (err) {
              console.warn('[UnreadCountContext] Failed to update unread counts:', err);
            }
          };

          // Listen for official unread notification events
          newClient.on('notification.message_new', updateUnreadCounts as any);
          newClient.on('notification.mark_read', updateUnreadCounts as any);
          newClient.on('notification.mark_unread', updateUnreadCounts as any);
        } else {
          throw new Error('Failed to initialize chat client');
        }
      } catch (err: any) {
        console.error('[UnreadCountContext] Chat initialization failed:', err);
        setConnectionStatus('error');
        cleanupChatState();
      }
    };

    // Handle disconnection from StreamChatManager
    const handleDisconnect = () => {
      console.log('[UnreadCountContext] Received disconnect notification');
      setConnectionStatus('disconnected');
      cleanupChatState();
    };

    // Register disconnect handler and initialize
    streamChatManager.onDisconnect(handleDisconnect);
    initializeChat();

    // Cleanup: unregister disconnect handler
    return () => {
      streamChatManager.offDisconnect(handleDisconnect);
    };
  }, [user, loadUnreadCount, cleanupChatState]);

  console.log('[UnreadCountContext] 📊 Shared state:', {
    connectionStatus,
    hasClient: !!client,
    hasUnreadMessages,
    loading,
    timestamp: new Date().toISOString()
  });

  return (
    <UnreadCountContext.Provider
      value={{
        hasUnreadMessages,
        loading,
        connectionStatus,
        client,
        refreshUnreadCount
      }}
    >
      {children}
    </UnreadCountContext.Provider>
  );
}