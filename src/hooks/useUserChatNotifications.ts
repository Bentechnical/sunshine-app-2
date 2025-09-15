import { useState, useEffect, useCallback, useRef } from 'react';
import { streamChatManager } from '@/utils/stream-chat-client';
import { StreamChat } from 'stream-chat';

// Rate limiting to prevent too many API calls
let lastChannelQuery = 0;
const QUERY_COOLDOWN = 5000; // 5 seconds between queries

export function useUserChatNotifications(activeTab?: string) {
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<StreamChat | null>(null);
  const eventListenersSetup = useRef(false);

  const checkUnreadMessages = useCallback(async (client: StreamChat | null = null) => {
    const chatClient = client || streamChatManager.getClient();

    console.log('[useUserChatNotifications] checkUnreadMessages called:', {
      hasClient: !!chatClient,
      userID: chatClient?.userID,
      timestamp: new Date().toISOString()
    });

    if (!chatClient || !chatClient.userID) {
      console.log('[useUserChatNotifications] No client or userID, setting hasUnreadMessages to false');
      setHasUnreadMessages(false);
      setLoading(false);
      return;
    }

    // Rate limiting to prevent too many API calls
    const now = Date.now();
    if (now - lastChannelQuery < QUERY_COOLDOWN) {
      console.log('[useUserChatNotifications] Rate limited, skipping query. Time remaining:', QUERY_COOLDOWN - (now - lastChannelQuery), 'ms');
      return;
    }
    lastChannelQuery = now;

    try {
      // Get all channels for the current user
      const filter = {
        members: { $in: [chatClient.userID] },
        type: 'messaging'
      };

      console.log('[useUserChatNotifications] Querying channels with filter:', filter);
      const channels = await chatClient.queryChannels(filter, {}, { limit: 20 });

      // Check if any channel has unread messages
      const channelDetails = channels.map(channel => ({
        id: channel.id,
        cid: channel.cid,
        unread: channel.state.unreadCount || 0,
        totalMessages: channel.state.messages?.length || 0,
        lastMessage: channel.state.messages?.[channel.state.messages.length - 1]
      }));

      const hasUnread = channels.some(channel => {
        return (channel.state.unreadCount || 0) > 0;
      });

      console.log('[useUserChatNotifications] ✅ Unread check complete:', {
        channelCount: channels.length,
        hasUnread,
        currentState: hasUnreadMessages,
        willUpdate: hasUnread !== hasUnreadMessages,
        channelDetails
      });

      setHasUnreadMessages(hasUnread);
      setError(null);
    } catch (err) {
      console.error('[useUserChatNotifications] ❌ Error checking unread messages:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setHasUnreadMessages(false);
    } finally {
      setLoading(false);
    }
  }, [hasUnreadMessages]);

  const setupEventListeners = useCallback((client: StreamChat) => {
    if (eventListenersSetup.current || !client) {
      console.log('[useUserChatNotifications] Skipping event listener setup:', {
        alreadySetup: eventListenersSetup.current,
        hasClient: !!client
      });
      return;
    }

    console.log('[useUserChatNotifications] 🎧 Setting up Stream Chat event listeners for user:', client.userID);

    // Listen for new messages
    const handleNewMessage = (event: any) => {
      console.log('[useUserChatNotifications] 📩 New message event:', {
        channelId: event.channel?.id,
        messageId: event.message?.id,
        fromUser: event.user?.id,
        currentUser: client.userID,
        isOwnMessage: event.user?.id === client.userID,
        messageText: event.message?.text?.substring(0, 50) + '...'
      });

      // Debounce unread checks to prevent rate limiting
      setTimeout(() => checkUnreadMessages(client), 2000);
    };

    // Listen for message read events
    const handleMessageRead = (event: any) => {
      console.log('[useUserChatNotifications] 👁️ Message read event:', {
        channelId: event.channel?.id,
        user: event.user?.id
      });
      setTimeout(() => checkUnreadMessages(client), 2000);
    };

    // Listen for channel updates (includes unread count changes)
    const handleChannelUpdated = (event: any) => {
      console.log('[useUserChatNotifications] 🔄 Channel updated event:', {
        channelId: event.channel?.id,
        type: event.type
      });
      setTimeout(() => checkUnreadMessages(client), 2000);
    };

    // Listen for notifications
    const handleNotificationMarkRead = (event: any) => {
      console.log('[useUserChatNotifications] 🔔 Notification mark read event:', event);
      setTimeout(() => checkUnreadMessages(client), 2000);
    };

    // Set up event listeners
    client.on('message.new', handleNewMessage);
    client.on('message.read', handleMessageRead);
    client.on('notification.mark_read', handleNotificationMarkRead);
    client.on('channel.updated', handleChannelUpdated);

    eventListenersSetup.current = true;

    console.log('[useUserChatNotifications] ✅ Event listeners set up successfully');

    // Return cleanup function
    return () => {
      console.log('[useUserChatNotifications] 🧹 Cleaning up Stream Chat event listeners');
      client.off('message.new', handleNewMessage);
      client.off('message.read', handleMessageRead);
      client.off('notification.mark_read', handleNotificationMarkRead);
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