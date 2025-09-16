import { useState, useEffect, useCallback } from 'react';
import { streamChatManager } from '@/utils/stream-chat-client';
import { useUser } from '@clerk/nextjs';

export function useNavNotifications(activeTab?: string) {
  const { user } = useUser();
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  const cleanupChatState = useCallback(() => {
    setClient(null);
    setConnectionStatus('disconnected');
    setHasUnreadMessages(false);
    setLoading(false);
  }, []);

  // Load unread count using the EXACT same approach as MessagingTab
  const loadUnreadCount = useCallback(async () => {
    if (!client || !client.userID) {
      console.log('[NavNotifications] No client available for unread check');
      setHasUnreadMessages(false);
      setLoading(false);
      return;
    }

    try {
      console.log('[NavNotifications] 🔍 Checking unread count like MessagingTab...');

      // Use Stream Chat's official unread count API (SAME as MessagingTab)
      const unreadResponse = await client.getUnreadCount();

      console.log('[NavNotifications] Got unread counts from Stream Chat API:', {
        total_unread: unreadResponse.total_unread_count,
        channels: unreadResponse.channels?.length,
        activeTab
      });

      const hasUnread = (unreadResponse.total_unread_count || 0) > 0;
      setHasUnreadMessages(hasUnread);
      setLoading(false);

      console.log('[NavNotifications] ✅ Updated unread state:', {
        hasUnread,
        activeTab,
        willShowFlag: hasUnread && activeTab !== 'messaging'
      });

    } catch (error) {
      console.error('[NavNotifications] ❌ Error getting unread count:', error);
      setHasUnreadMessages(false);
      setLoading(false);
    }
  }, [client, activeTab]);

  // Initialize chat - EXACT same pattern as MessagingTab
  useEffect(() => {
    if (!user) return;

    const initializeChat = async () => {
      setConnectionStatus('connecting');
      setLoading(true);

      try {
        console.log('[NavNotifications] 🔄 Initializing chat connection like MessagingTab...');

        const newClient = await streamChatManager.connectUserWithProvider(
          user.id,
          {
            id: user.id,
            name: user.fullName || user.firstName || 'User',
            image: user.imageUrl || undefined,
          }
        );

        if (newClient) {
          console.log('[NavNotifications] ✅ Chat client connected, setting up like MessagingTab');
          setClient(newClient);
          setConnectionStatus('connected');
          await loadUnreadCount();

          // Set up event listeners for real-time unread count updates (SAME as MessagingTab)
          const updateUnreadCounts = async () => {
            try {
              console.log('[NavNotifications] 🔄 Real-time unread update triggered');
              // Use official unread API instead of queryChannels (SAME as MessagingTab)
              const unreadResponse = await newClient.getUnreadCount();

              console.log('[NavNotifications] Real-time unread update result:', {
                total_unread: unreadResponse.total_unread_count,
                channels_with_unread: unreadResponse.channels?.length
              });

              const hasUnread = (unreadResponse.total_unread_count || 0) > 0;
              setHasUnreadMessages(hasUnread);
            } catch (err) {
              console.warn('[NavNotifications] Failed to update unread counts:', err);
            }
          };

          // Listen for official unread notification events (SAME as MessagingTab)
          newClient.on('notification.message_new', updateUnreadCounts as any);
          newClient.on('notification.mark_read', updateUnreadCounts as any);
          newClient.on('notification.mark_unread', updateUnreadCounts as any);
        } else {
          throw new Error('Failed to initialize chat client');
        }
      } catch (err: any) {
        console.error('[NavNotifications] Chat initialization failed:', err);
        setConnectionStatus('error');
        cleanupChatState();
      }
    };

    // Handle disconnection from StreamChatManager (SAME as MessagingTab)
    const handleDisconnect = () => {
      console.log('[NavNotifications] Received disconnect notification');
      setConnectionStatus('disconnected');
      cleanupChatState();
    };

    // Register disconnect handler and initialize (SAME as MessagingTab)
    streamChatManager.onDisconnect(handleDisconnect);
    initializeChat();

    // Cleanup: unregister disconnect handler (SAME as MessagingTab)
    return () => {
      streamChatManager.offDisconnect(handleDisconnect);
    };
  }, [user, loadUnreadCount, cleanupChatState]);

  // Clear notification when user is viewing messages
  const effectiveHasUnread = activeTab === 'messaging' ? false : hasUnreadMessages;

  console.log('[NavNotifications] 📊 Final state:', {
    activeTab,
    connectionStatus,
    hasClient: !!client,
    hasUnreadMessages,
    effectiveHasUnread,
    loading
  });

  return {
    hasUnreadMessages: effectiveHasUnread,
    loading,
    connectionStatus
  };
}