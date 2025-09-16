import { useState, useEffect, useRef } from 'react';
import { streamChatManager } from '@/utils/stream-chat-client';
import { StreamChat } from 'stream-chat';

export function useStreamChatUnread(activeTab?: string) {
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [loading, setLoading] = useState(true);
  const clientRef = useRef<StreamChat | null>(null);
  const eventListenersSetup = useRef(false);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const setupUnreadTracking = async () => {
      const client = streamChatManager.getClient();

      if (client && client.userID && !eventListenersSetup.current) {
        console.log('[StreamChatUnread] Setting up official unread tracking');
        clientRef.current = client;
        eventListenersSetup.current = true;

        try {
          // Get initial unread count using Stream Chat's official API
          const unreadResponse = await client.getUnreadCount();
          const initialUnread = (unreadResponse.total_unread_count || 0) > 0;

          console.log('[StreamChatUnread] Initial unread state:', {
            total_unread_count: unreadResponse.total_unread_count,
            channels_count: unreadResponse.channels?.length || 0,
            hasUnread: initialUnread
          });

          setHasUnreadMessages(initialUnread);
          setLoading(false);

          // Set up real-time event listeners for unread count changes
          const handleUnreadEvent = (event: any) => {
            console.log('[StreamChatUnread] Unread event received:', {
              type: event.type,
              total_unread_count: event.total_unread_count,
              channels_count: event.unread_channels
            });

            if (event.total_unread_count !== undefined) {
              const hasUnread = event.total_unread_count > 0;
              setHasUnreadMessages(hasUnread);
            }
          };

          // Listen to the official unread events
          client.on('notification.message_new', handleUnreadEvent);
          client.on('notification.mark_read', handleUnreadEvent);
          client.on('notification.mark_unread', handleUnreadEvent);

          cleanup = () => {
            console.log('[StreamChatUnread] Cleaning up unread tracking');
            client.off('notification.message_new', handleUnreadEvent);
            client.off('notification.mark_read', handleUnreadEvent);
            client.off('notification.mark_unread', handleUnreadEvent);
            eventListenersSetup.current = false;
          };

        } catch (error) {
          console.error('[StreamChatUnread] Error setting up unread tracking:', error);
          setLoading(false);
        }
      }
    };

    // Check for client connection less frequently
    const checkInterval = setInterval(setupUnreadTracking, 3000);
    setupUnreadTracking(); // Initial setup

    const handleDisconnect = () => {
      console.log('[StreamChatUnread] Stream Chat disconnected');
      clientRef.current = null;
      setHasUnreadMessages(false);
      setLoading(false);
      eventListenersSetup.current = false;
    };

    streamChatManager.onDisconnect(handleDisconnect);

    return () => {
      clearInterval(checkInterval);
      streamChatManager.offDisconnect(handleDisconnect);
      if (cleanup) cleanup();
    };
  }, []);

  // Clear notification when user is viewing messages
  const effectiveHasUnread = activeTab === 'messaging' ? false : hasUnreadMessages;

  return {
    hasUnreadMessages: effectiveHasUnread,
    loading
  };
}