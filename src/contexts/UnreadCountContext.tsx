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
  updateUnreadFromChannels: (channels: any[]) => void;
  refreshChannelData: () => Promise<any[]>;
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

  // Store the current client reference for event listener management
  const currentClientRef = useRef<StreamChat | null>(null);

  const cleanupChatState = useCallback(() => {
    setClient(null);
    setConnectionStatus('disconnected');
    setHasUnreadMessages(false);
    setLoading(false);
  }, []);

  // Function to fetch and return fresh channel data
  const refreshChannelData = useCallback(async (): Promise<any[]> => {
    try {
      const response = await fetch('/api/chat/channels');
      if (response.ok) {
        const data = await response.json();
        const channelsArray = Array.isArray(data.chats) ? data.chats : [];

        // Get fresh unread counts from Stream Chat
        const currentClient = streamChatManager.getClient();
        if (currentClient) {
          const unreadResponse = await currentClient.getUnreadCount();

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

          return enrichedChannels;
        }
      }
      return [];
    } catch (err) {
      console.warn('[UnreadCountContext] Failed to refresh channel data:', err);
      return [];
    }
  }, []);

  // Function to update unread state - called by MessagingTab or real-time events
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

    // Set up visibility change listener for automatic reconnection
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        // Tab became visible - check if we need to reconnect
        const currentClient = streamChatManager.getClient();
        if (!currentClient || !currentClient.userID) {
          try {
            const reconnectedClient = await streamChatManager.connectUserWithProvider(
              user.id,
              {
                id: user.id,
                name: user.firstName || 'User',
                image: user.imageUrl || undefined,
              }
            );

            if (reconnectedClient) {
              setClient(reconnectedClient);
              setConnectionStatus('connected');
              currentClientRef.current = reconnectedClient;

              // Re-attach event listeners
              const updateUnreadFromRealtimeEvent = async () => {
                try {
                  const enrichedChannels = await refreshChannelData();
                  updateUnreadFromChannels(enrichedChannels);

                  window.dispatchEvent(new CustomEvent('unreadCountUpdated', {
                    detail: { channels: enrichedChannels }
                  }));
                } catch (err) {
                  console.warn('[UnreadCountContext] Failed to update real-time unread state:', err);
                }
              };

              reconnectedClient.on('notification.message_new', updateUnreadFromRealtimeEvent as any);
              reconnectedClient.on('notification.mark_read', updateUnreadFromRealtimeEvent as any);
              reconnectedClient.on('notification.mark_unread', updateUnreadFromRealtimeEvent as any);

              // Refresh unread state after a brief delay
              setTimeout(async () => {
                try {
                  const enrichedChannels = await refreshChannelData();
                  updateUnreadFromChannels(enrichedChannels);

                  window.dispatchEvent(new CustomEvent('clientReconnected', {
                    detail: { channels: enrichedChannels, client: reconnectedClient }
                  }));
                } catch (err) {
                  console.error('[UnreadCountContext] Failed to refresh state after reconnection:', err);
                }
              }, 1000);
            }
          } catch (err) {
            console.error('[UnreadCountContext] Failed to reconnect:', err);
            setConnectionStatus('error');
          }
        }
      }
    };

    const initializeChat = async () => {
      setConnectionStatus('connecting');
      setLoading(true);

      try {
        const newClient = await streamChatManager.connectUserWithProvider(
          user.id,
          {
            id: user.id,
            name: user.firstName || 'User',
            image: user.imageUrl || undefined,
          }
        );

        if (newClient) {
          setClient(newClient);
          setConnectionStatus('connected');
          currentClientRef.current = newClient;

          // Load initial unread state when connection is established
          try {
            const response = await fetch('/api/chat/channels');

            if (response.ok) {
              const data = await response.json();
              const channelsArray = Array.isArray(data.chats) ? data.chats : [];

              // Get unread counts from Stream Chat for initial load
              const unreadResponse = await newClient.getUnreadCount();

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

              // Update context with initial unread state
              updateUnreadFromChannels(enrichedChannels);
            } else {
              console.error('[UnreadCountContext] Failed to load channels:', response.status);
            }
          } catch (err) {
            console.error('[UnreadCountContext] Failed to load initial unread state:', err);
          }


          // Set up global real-time event listeners for unread updates
          const updateUnreadFromRealtimeEvent = async () => {
            try {
              // Use shared function to get fresh channel data
              const enrichedChannels = await refreshChannelData();

              // Update context with fresh unread state
              updateUnreadFromChannels(enrichedChannels);

              // Trigger a global event for MessagingTab to refresh its channel list
              window.dispatchEvent(new CustomEvent('unreadCountUpdated', {
                detail: { channels: enrichedChannels }
              }));
            } catch (err) {
              console.warn('[UnreadCountContext] Failed to update real-time unread state:', err);
            }
          };

          // Listen for Stream Chat real-time events globally
          newClient.on('notification.message_new', updateUnreadFromRealtimeEvent as any);
          newClient.on('notification.mark_read', updateUnreadFromRealtimeEvent as any);
          newClient.on('notification.mark_unread', updateUnreadFromRealtimeEvent as any);

          // Keep default 60s hidden timeout but make reconnection seamless

          // Store cleanup function for this specific client and handlers
          const cleanup = () => {
            try {
              newClient.off('notification.message_new', updateUnreadFromRealtimeEvent as any);
              newClient.off('notification.mark_read', updateUnreadFromRealtimeEvent as any);
              newClient.off('notification.mark_unread', updateUnreadFromRealtimeEvent as any);
            } catch (err) {
              console.warn('[UnreadCountContext] Error cleaning up event listeners:', err);
            }
          };

          // Store cleanup function for later use
          (newClient as any).__unreadContextCleanup = cleanup;

          // Smart health check that handles reconnection automatically
          const healthCheck = setInterval(async () => {
            const currentClient = streamChatManager.getClient();

            if (currentClient && currentClient !== currentClientRef.current) {
              // Client instance changed - reconnection happened, re-attach listeners
              try {
                // Re-attach event listeners to the new client instance
                currentClient.on('notification.message_new', updateUnreadFromRealtimeEvent as any);
                currentClient.on('notification.mark_read', updateUnreadFromRealtimeEvent as any);
                currentClient.on('notification.mark_unread', updateUnreadFromRealtimeEvent as any);

                // Update stored client reference and context
                currentClientRef.current = currentClient;
                setClient(currentClient);

                // Add a small delay before refreshing data to let the client stabilize
                setTimeout(async () => {
                  try {
                    // Refresh unread state after reconnection
                    const enrichedChannels = await refreshChannelData();
                    updateUnreadFromChannels(enrichedChannels);

                    // Trigger a global event for MessagingTab to refresh its channel list
                    window.dispatchEvent(new CustomEvent('clientReconnected', {
                      detail: { channels: enrichedChannels, client: currentClient }
                    }));
                  } catch (err) {
                    console.error('[UnreadCountContext] Failed to refresh state after reconnection:', err);
                  }
                }, 1000);

              } catch (err) {
                console.error('[UnreadCountContext] Failed to re-attach event listeners:', err);
              }
            }
          }, 30000); // Check every 30 seconds for faster reconnection

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
    document.addEventListener('visibilitychange', handleVisibilityChange);
    initializeChat();

    // Cleanup: unregister disconnect handler and remove event listeners
    return () => {
      streamChatManager.offDisconnect(handleDisconnect);

      // Remove visibility change listener
      document.removeEventListener('visibilitychange', handleVisibilityChange);

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
        updateUnreadFromChannels,
        refreshChannelData
      }}
    >
      {children}
    </UnreadCountContext.Provider>
  );
}