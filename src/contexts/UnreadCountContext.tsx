'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { streamChatManager } from '@/utils/stream-chat-client';
import { StreamChat } from 'stream-chat';

interface UnreadCountContextType {
  hasUnreadMessages: boolean;
  loading: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  client: StreamChat | null;
  updateUnreadFromChannels: (channels: any[]) => void;
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

  const cleanupChatState = useCallback(() => {
    setClient(null);
    setConnectionStatus('disconnected');
    setHasUnreadMessages(false);
    setLoading(false);
  }, []);

  // ONLY function to update unread state - called by MessagingTab
  const updateUnreadFromChannels = useCallback((channels: any[]) => {
    const totalUnreadFromChannels = channels.reduce((total, channel) => {
      return total + (channel.unreadCount || 0);
    }, 0);

    const hasUnread = totalUnreadFromChannels > 0;
    setHasUnreadMessages(hasUnread);
  }, []);

  // ONLY initialize chat connection - MessagingTab handles all unread logic
  useEffect(() => {
    if (!user) return;

    const initializeChat = async () => {
      setConnectionStatus('connecting');
      setLoading(true);

      try {
        const newClient = await streamChatManager.connectUserWithProvider(
          user.id,
          {
            id: user.id,
            name: user.fullName || user.firstName || 'User',
            image: user.imageUrl || undefined,
          }
        );

        if (newClient) {
          setClient(newClient);
          setConnectionStatus('connected');

          // Load initial unread state when connection is established
          console.log('[UnreadCountContext] Starting initial unread state load...');

          try {
            console.log('[UnreadCountContext] Fetching channels from API...');
            const response = await fetch('/api/chat/channels');

            console.log('[UnreadCountContext] Channels API response:', {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText
            });

            if (response.ok) {
              const data = await response.json();
              const channelsArray = Array.isArray(data.chats) ? data.chats : [];

              console.log('[UnreadCountContext] Got channels from API:', {
                channelCount: channelsArray.length,
                sampleChannels: channelsArray.slice(0, 2).map((ch: any) => ({
                  channelId: ch.channelId,
                  dogName: ch.dogName
                }))
              });

              // Get unread counts from Stream Chat for initial load
              console.log('[UnreadCountContext] Getting unread counts from Stream Chat...');
              const unreadResponse = await newClient.getUnreadCount();

              console.log('[UnreadCountContext] Stream Chat unread response:', {
                total_unread: unreadResponse.total_unread_count,
                channels: unreadResponse.channels?.length,
                channelDetails: unreadResponse.channels?.slice(0, 2)
              });

              // Update channels with unread counts (same logic as MessagingTab)
              const enrichedChannels = channelsArray.map((chat: any) => {
                const channelId = chat.channelId?.split(':')[1] || chat.channelId;
                const unreadChannel = unreadResponse.channels?.find((uc: any) =>
                  uc.channel_id === channelId || uc.channel_id === chat.channelId
                );
                return {
                  ...chat,
                  unreadCount: unreadChannel?.unread_count || 0
                };
              });

              console.log('[UnreadCountContext] Enriched channels for context update:', {
                channelCount: enrichedChannels.length,
                sampleUnreadCounts: enrichedChannels.slice(0, 3).map((ch: any) => ({
                  channelId: ch.channelId,
                  unreadCount: ch.unreadCount
                }))
              });

              // Update context with initial unread state
              updateUnreadFromChannels(enrichedChannels);

              console.log('[UnreadCountContext] ✅ Initial unread state loaded successfully');
            } else {
              console.error('[UnreadCountContext] Channels API failed:', {
                status: response.status,
                statusText: response.statusText
              });
            }
          } catch (err) {
            console.error('[UnreadCountContext] ❌ Failed to load initial unread state:', err);
          }

          // Set up global real-time event listeners for unread updates
          const updateUnreadFromRealtimeEvent = async () => {
            try {
              console.log('[UnreadCountContext] 🔔 Real-time message event received, refreshing unread state...', {
                clientExists: !!newClient,
                clientUserID: newClient?.userID,
                timestamp: new Date().toISOString()
              });

              // Fetch fresh channel data (same as initial load)
              const response = await fetch('/api/chat/channels');
              if (response.ok) {
                const data = await response.json();
                const channelsArray = Array.isArray(data.chats) ? data.chats : [];

                // Get fresh unread counts from Stream Chat
                const unreadResponse = await newClient.getUnreadCount();

                // Update channels with unread counts
                const enrichedChannels = channelsArray.map((chat: any) => {
                  const channelId = chat.channelId?.split(':')[1] || chat.channelId;
                  const unreadChannel = unreadResponse.channels?.find((uc: any) =>
                    uc.channel_id === channelId || uc.channel_id === chat.channelId
                  );
                  return {
                    ...chat,
                    unreadCount: unreadChannel?.unread_count || 0
                  };
                });

                // Update context with fresh unread state
                updateUnreadFromChannels(enrichedChannels);

                console.log('[UnreadCountContext] ✅ Real-time unread state updated');
              }
            } catch (err) {
              console.warn('[UnreadCountContext] Failed to update real-time unread state:', err);
            }
          };

          // Listen for Stream Chat real-time events globally
          newClient.on('notification.message_new', updateUnreadFromRealtimeEvent as any);
          newClient.on('notification.mark_read', updateUnreadFromRealtimeEvent as any);
          newClient.on('notification.mark_unread', updateUnreadFromRealtimeEvent as any);

          console.log('[UnreadCountContext] 🎧 Real-time event listeners set up');

          // Store cleanup function for this specific client and handlers
          const cleanup = () => {
            try {
              newClient.off('notification.message_new', updateUnreadFromRealtimeEvent as any);
              newClient.off('notification.mark_read', updateUnreadFromRealtimeEvent as any);
              newClient.off('notification.mark_unread', updateUnreadFromRealtimeEvent as any);
              console.log('[UnreadCountContext] 🧹 Event listeners cleaned up');
            } catch (err) {
              console.warn('[UnreadCountContext] Error cleaning up event listeners:', err);
            }
          };

          // Store cleanup function for later use
          (newClient as any).__unreadContextCleanup = cleanup;

          // Periodic health check for event listeners
          const healthCheck = setInterval(() => {
            const currentClient = streamChatManager.getClient();
            if (!currentClient || !currentClient.userID) {
              console.warn('[UnreadCountContext] ⚠️ Client disconnected, event listeners may be lost');
            } else if (currentClient !== newClient) {
              console.warn('[UnreadCountContext] ⚠️ Client instance changed, re-setting up event listeners');

              // Set up event listeners on new client
              try {
                currentClient.on('notification.message_new', updateUnreadFromRealtimeEvent as any);
                currentClient.on('notification.mark_read', updateUnreadFromRealtimeEvent as any);
                currentClient.on('notification.mark_unread', updateUnreadFromRealtimeEvent as any);
                console.log('[UnreadCountContext] 🔄 Event listeners re-attached to new client');
              } catch (err) {
                console.error('[UnreadCountContext] Failed to re-attach event listeners:', err);
              }
            } else {
              console.log('[UnreadCountContext] ✅ Event listeners health check passed');
            }
          }, 60000); // Check every minute

          // Store health check for cleanup
          (newClient as any).__unreadContextHealthCheck = healthCheck;

          setLoading(false);
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
      setConnectionStatus('disconnected');
      cleanupChatState();
    };

    // Register disconnect handler and initialize
    streamChatManager.onDisconnect(handleDisconnect);
    initializeChat();

    // Cleanup: unregister disconnect handler and remove event listeners
    return () => {
      streamChatManager.offDisconnect(handleDisconnect);

      // Clean up Stream Chat event listeners if client exists
      const currentClient = streamChatManager.getClient();
      if (currentClient) {
        if ((currentClient as any).__unreadContextCleanup) {
          (currentClient as any).__unreadContextCleanup();
        }
        if ((currentClient as any).__unreadContextHealthCheck) {
          clearInterval((currentClient as any).__unreadContextHealthCheck);
        }
      }
    };
  }, [user, cleanupChatState]);

  return (
    <UnreadCountContext.Provider
      value={{
        hasUnreadMessages,
        loading,
        connectionStatus,
        client,
        updateUnreadFromChannels
      }}
    >
      {children}
    </UnreadCountContext.Provider>
  );
}