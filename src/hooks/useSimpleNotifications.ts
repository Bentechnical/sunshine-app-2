import { useState, useEffect, useRef } from 'react';
import { streamChatManager } from '@/utils/stream-chat-client';
import { StreamChat } from 'stream-chat';

export function useSimpleNotifications(activeTab?: string) {
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [loading, setLoading] = useState(true);
  const clientRef = useRef<StreamChat | null>(null);
  const eventListenersSetup = useRef(false);

  // Simple check without querying channels - just listen to events
  const updateUnreadState = (hasUnread: boolean) => {
    console.log('[SimpleNotifications] Updating unread state:', hasUnread);
    setHasUnreadMessages(hasUnread);
    setLoading(false);
  };

  // Set up lightweight event listeners
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const setupClient = () => {
      const client = streamChatManager.getClient();

      if (client && client.userID && !eventListenersSetup.current) {
        console.log('[SimpleNotifications] Setting up lightweight event listeners');
        clientRef.current = client;
        eventListenersSetup.current = true;

        // Track unread state locally without API calls
        let localUnreadState = false;

        const handleNewMessage = (event: any) => {
          // If message is not from current user, assume we have unreads
          if (event.user?.id !== client.userID && event.channel?.type === 'messaging') {
            console.log('[SimpleNotifications] New message from another user, setting unread = true');
            localUnreadState = true;
            updateUnreadState(true);
          }
        };

        const handleMessageRead = (event: any) => {
          // If current user read a message, check if we should clear unreads
          if (event.user?.id === client.userID) {
            console.log('[SimpleNotifications] User read a message, setting unread = false');
            localUnreadState = false;
            updateUnreadState(false);
          }
        };

        // Set up minimal event listeners
        client.on('message.new', handleNewMessage);
        client.on('message.read', handleMessageRead);
        client.on('notification.mark_read', handleMessageRead);

        // Start with no unreads assumption
        setLoading(false);

        cleanup = () => {
          console.log('[SimpleNotifications] Cleaning up event listeners');
          client.off('message.new', handleNewMessage);
          client.off('message.read', handleMessageRead);
          client.off('notification.mark_read', handleMessageRead);
          eventListenersSetup.current = false;
        };
      }
    };

    // Check for client connection periodically (less frequent)
    const checkInterval = setInterval(setupClient, 2000);
    setupClient(); // Initial check

    const handleDisconnect = () => {
      console.log('[SimpleNotifications] Stream Chat disconnected');
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
    loading,
    error: null // Simplified - no error handling for now
  };
}