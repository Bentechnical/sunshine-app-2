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

    // Cleanup: unregister disconnect handler
    return () => {
      streamChatManager.offDisconnect(handleDisconnect);
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