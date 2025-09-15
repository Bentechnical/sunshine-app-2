import { useState, useEffect, useCallback, useRef } from 'react';
import { streamChatManager } from '@/utils/stream-chat-client';
import { StreamChat } from 'stream-chat';

export function useUserChatNotifications(activeTab?: string) {
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<StreamChat | null>(null);
  const eventListenersSetup = useRef(false);

  const checkUnreadMessages = useCallback(async (client: StreamChat | null = null) => {
    const chatClient = client || streamChatManager.getClient();

    if (!chatClient || !chatClient.userID) {
      setHasUnreadMessages(false);
      setLoading(false);
      return;
    }

    try {
      // Get all channels for the current user
      const filter = {
        members: { $in: [chatClient.userID] },
        type: 'messaging'
      };

      const channels = await chatClient.queryChannels(filter, {}, { limit: 20 });

      // Check if any channel has unread messages
      const hasUnread = channels.some(channel => {
        return (channel.state.unreadCount || 0) > 0;
      });

      console.log('[useUserChatNotifications] Unread check:', {
        channelCount: channels.length,
        hasUnread,
        unreadCounts: channels.map(c => ({ id: c.id, unread: c.state.unreadCount }))
      });

      setHasUnreadMessages(hasUnread);
      setError(null);
    } catch (err) {
      console.error('[useUserChatNotifications] Error checking unread messages:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setHasUnreadMessages(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const setupEventListeners = useCallback((client: StreamChat) => {
    if (eventListenersSetup.current || !client) return;

    console.log('[useUserChatNotifications] Setting up Stream Chat event listeners');

    // Listen for new messages
    const handleNewMessage = (event: any) => {
      // Only update if this is not the current user's message
      if (event.user?.id !== client.userID) {
        console.log('[useUserChatNotifications] New message received, checking unread state');
        checkUnreadMessages(client);
      }
    };

    // Listen for message read events
    const handleMessageRead = (event: any) => {
      console.log('[useUserChatNotifications] Message read event, checking unread state');
      checkUnreadMessages(client);
    };

    // Listen for channel updates (includes unread count changes)
    const handleChannelUpdated = (event: any) => {
      console.log('[useUserChatNotifications] Channel updated, checking unread state');
      checkUnreadMessages(client);
    };

    // Set up event listeners
    client.on('message.new', handleNewMessage);
    client.on('message.read', handleMessageRead);
    client.on('notification.mark_read', handleMessageRead);
    client.on('channel.updated', handleChannelUpdated);

    eventListenersSetup.current = true;

    // Return cleanup function
    return () => {
      console.log('[useUserChatNotifications] Cleaning up Stream Chat event listeners');
      client.off('message.new', handleNewMessage);
      client.off('message.read', handleMessageRead);
      client.off('notification.mark_read', handleMessageRead);
      client.off('channel.updated', handleChannelUpdated);
      eventListenersSetup.current = false;
    };
  }, [checkUnreadMessages]);

  // Monitor Stream Chat client connection
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let connectionCheckInterval: NodeJS.Timeout;

    const checkConnection = () => {
      const client = streamChatManager.getClient();
      const isReady = streamChatManager.isClientReady();

      if (client && client.userID && isReady && client !== clientRef.current) {
        console.log('[useUserChatNotifications] Stream Chat client connected, setting up listeners');
        clientRef.current = client;

        // Clean up previous listeners if any
        if (cleanup) cleanup();

        // Set up new listeners
        cleanup = setupEventListeners(client);

        // Initial unread check
        checkUnreadMessages(client);
      } else if (!client || !client.userID || !isReady) {
        if (clientRef.current) {
          console.log('[useUserChatNotifications] Stream Chat client disconnected');
          clientRef.current = null;
          setHasUnreadMessages(false);
          setLoading(false);
          if (cleanup) {
            cleanup();
            cleanup = undefined;
          }
        }
      }
    };

    // Initial check
    checkConnection();

    // Set up a timer to periodically check connection status (more frequent for faster detection)
    connectionCheckInterval = setInterval(checkConnection, 500);

    // Register disconnect callback with stream chat manager
    const handleDisconnect = () => {
      console.log('[useUserChatNotifications] Stream Chat disconnected via callback');
      clientRef.current = null;
      setHasUnreadMessages(false);
      setLoading(false);
      if (cleanup) {
        cleanup();
        cleanup = undefined;
      }
    };

    streamChatManager.onDisconnect(handleDisconnect);

    return () => {
      clearInterval(connectionCheckInterval);
      streamChatManager.offDisconnect(handleDisconnect);
      if (cleanup) cleanup();
    };
  }, [setupEventListeners, checkUnreadMessages]);

  // Clear notification badge when user is actively viewing messages
  const effectiveHasUnread = activeTab === 'messaging' ? false : hasUnreadMessages;

  return {
    hasUnreadMessages: effectiveHasUnread,
    loading,
    error,
    refresh: () => checkUnreadMessages()
  };
}