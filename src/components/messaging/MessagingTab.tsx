'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Chat,
  Channel,
  ChannelHeader,
  MessageInput,
  MessageList,
  Thread,
} from 'stream-chat-react';
import 'stream-chat-react/dist/css/v2/index.css';
import { Loader2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { useUnreadCount } from '@/contexts/UnreadCountContext';
import styles from './MessagingTab.module.css';

interface ChatData {
  appointmentId: number;
  channelId: string;
  appointmentTime: string;
  dogName: string;
  dogImage?: string;
  otherUserName: string;
  otherUserImage?: string;
  lastMessage?: any;
  unreadCount: number;
  isActive: boolean;
}

interface MessagingTabProps {
  onActiveChatChange?: (isActiveChat: boolean) => void;
}

export default function MessagingTab({ onActiveChatChange }: MessagingTabProps) {
  const { client, connectionStatus, updateUnreadFromChannels, refreshChannelData } = useUnreadCount();

  // Core state
  const [channels, setChannels] = useState<ChatData[]>([]);
  const [activeChannel, setActiveChannel] = useState<any>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(true);
  
  // Mobile state
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<'channelList' | 'activeChat'>('channelList');

  // Clean up handler
  const cleanupChatState = useCallback(() => {
    setActiveChannel(null);
    setActiveChannelId(null);
    setChannels([]);
    setViewMode('channelList');
    setLoadingChannels(false);
    onActiveChatChange?.(false);
  }, [onActiveChatChange]);

  // Handle client disconnection - clear active channel to prevent stale references
  useEffect(() => {
    if (connectionStatus === 'disconnected' || connectionStatus === 'connecting') {
      // Clear active channel when disconnected to prevent using channels from old client
      if (activeChannel !== null) {
        setActiveChannel(null);
        setActiveChannelId(null);
        setViewMode('channelList');
        onActiveChatChange?.(false);
      }
    }
  }, [connectionStatus, activeChannel, onActiveChatChange]);

  // Load channels
  const loadChannels = useCallback(async () => {
    try {
      setLoadingChannels(true);
      const response = await fetch('/api/chat/channels');
      if (!response.ok) throw new Error('Failed to fetch channels');

      const data = await response.json();
      const channelsArray = Array.isArray(data.chats) ? data.chats : [];

      // If we have a Stream Chat client, get real-time unread counts using official API
      let enrichedChannels = channelsArray;
      if (client && client.userID) {
        try {
          // Use Stream Chat's official unread count API with timeout
          const unreadResponse = await Promise.race([
            client.getUnreadCount(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Unread count timeout')), 10000)
            )
          ]);

          // Update unread counts with official Stream Chat unread data
          enrichedChannels = channelsArray.map((chat: any) => {
            // Extract channel ID from the full channel ID (format: messaging:channel-id)
            const channelId = chat.channelId?.split(':')[1] || chat.channelId;

            // Find matching channel in unread response
            const unreadChannel = (unreadResponse as any).channels?.find((uc: any) =>
              uc.channel_id === channelId || uc.channel_id === chat.channelId
            );

            return {
              ...chat,
              unreadCount: unreadChannel?.unread_count || 0
            };
          });
        } catch (streamError) {
          console.warn('[MessagingTab] Failed to get Stream Chat unread counts (using defaults):', streamError);
          // Fall back to API data if Stream Chat query fails - use 0 for unread counts
          enrichedChannels = channelsArray.map((chat: any) => ({
            ...chat,
            unreadCount: 0
          }));
        }
      }

      setChannels(enrichedChannels);

      // Update shared context with reliable MessagingTab data
      updateUnreadFromChannels(enrichedChannels);

      // Restore active channel if it exists
      if (activeChannelId && client) {
        const channel = client.channel('messaging', activeChannelId);
        await channel.watch();
        setActiveChannel(channel);
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
      setError('Failed to load conversations');
      setChannels([]);
    } finally {
      setLoadingChannels(false);
    }
  }, [activeChannelId, client, updateUnreadFromChannels]);

  // Load channels when client is ready
  useEffect(() => {
    if (client && connectionStatus === 'connected') {
      loadChannels();

      // NOTE: Real-time event listeners are now handled globally by UnreadCountContext
      // MessagingTab no longer sets up its own listeners to avoid conflicts
    }
  }, [client, connectionStatus, loadChannels]);

  // Listen for global unread count updates from UnreadCountContext
  useEffect(() => {
    const handleUnreadUpdate = (event: CustomEvent) => {
      const { channels: updatedChannels } = event.detail;
      setChannels(updatedChannels);
    };

    const handleClientReconnect = (event: CustomEvent) => {
      const { channels: updatedChannels, client: reconnectedClient } = event.detail;

      // Clear any error states
      setError(null);

      // Update channels from the reconnected state
      setChannels(updatedChannels);

      // If we had an active channel, re-establish it with the new client
      if (activeChannelId && reconnectedClient) {
        const channel = reconnectedClient.channel('messaging', activeChannelId);
        channel.watch().then(() => {
          setActiveChannel(channel);
        }).catch((err: any) => {
          console.error('[MessagingTab] Failed to re-establish active channel:', err);
          // Reset active channel if we can't re-establish it
          setActiveChannel(null);
          setActiveChannelId(null);
          setViewMode('channelList');
          onActiveChatChange?.(false);
        });
      }
    };

    window.addEventListener('unreadCountUpdated', handleUnreadUpdate as EventListener);
    window.addEventListener('clientReconnected', handleClientReconnect as EventListener);

    return () => {
      window.removeEventListener('unreadCountUpdated', handleUnreadUpdate as EventListener);
      window.removeEventListener('clientReconnected', handleClientReconnect as EventListener);
    };
  }, [activeChannelId, onActiveChatChange]);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Channel selection
  const handleChannelSelect = useCallback(async (channelId: string) => {
    if (!client) return;

    try {
      // Remove 'messaging:' prefix if present
      const cleanChannelId = channelId.replace('messaging:', '');
      
      const channel = client.channel('messaging', cleanChannelId);
      await channel.watch();
      
      setActiveChannel(channel);
      setActiveChannelId(cleanChannelId);
      
      // Mobile: switch to chat view and hide nav
      if (isMobile) {
        setViewMode('activeChat');
        onActiveChatChange?.(true);
      }
    } catch (err) {
      console.error('Failed to select channel:', err);
      setError('Failed to open conversation');
    }
  }, [client, isMobile, onActiveChatChange]);

  // Handle back to channel list
  const handleBackToChannelList = useCallback(() => {
    setViewMode('channelList');
    onActiveChatChange?.(false);
  }, [onActiveChatChange]);

  // Format appointment date for display
  const formatAppointmentDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };


  // Render loading state
  if (connectionStatus === 'connecting') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Connecting to chat...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-4 text-red-600" />
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={cleanupChatState}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center mx-auto"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // If we don't have a client yet, don't render anything
  if (!client) {
    return null;
  }

  const chatContent = (
    <div className={styles.messagingContainer}>
      {isMobile ? (
        // Mobile Layout
        viewMode === 'channelList' ? (
          // Channel List View
          <div className={styles.mobileChannelList}>
            <div className={styles.channelListHeader}>
              <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
            </div>
            <div className={styles.channelListContent}>
              {loadingChannels ? (
                // Loading state for mobile
                <div className="flex flex-col items-center justify-center text-center px-6 py-12 h-full min-h-[400px]">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    Loading Messages...
                  </h3>
                  <p className="text-sm text-gray-600 max-w-sm leading-relaxed">
                    Please wait while we fetch your conversations.
                  </p>
                </div>
              ) : channels.length === 0 ? (
                // Empty state for mobile
                <div className="flex flex-col items-center justify-center text-center px-6 py-12 h-full min-h-[400px]">
                  <div className="text-6xl mb-4">🐕</div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    No Messages Yet
                  </h3>
                  <p className="text-sm text-gray-600 max-w-sm leading-relaxed">
                    Your messages will appear here once you have a confirmed appointment. Chat with other users to coordinate your therapy dog visits!
                  </p>
                </div>
              ) : (
                channels.map(chat => (
                  <div
                    key={chat.channelId}
                    onClick={() => handleChannelSelect(chat.channelId)}
                  >
                    <div className="flex items-center space-x-3 p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                    <div className="flex-shrink-0">
                      {chat.dogImage ? (
                        <img
                          src={chat.dogImage}
                          alt={chat.dogName}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                          <span className="text-gray-500">🐕</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {chat.dogName}
                        </h3>
                        <div className="flex flex-col items-end space-y-1">
                          <div className="text-right">
                            <div className="text-xs text-gray-500 font-medium">Meeting Date:</div>
                            <div className="text-xs text-gray-400">
                              {formatAppointmentDate(chat.appointmentTime)}
                            </div>
                          </div>
                          {chat.unreadCount > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        with {chat.otherUserName}
                      </p>
                    </div>
                  </div>
                </div>
              ))
              )}
            </div>
          </div>
        ) : (
          // Active Chat View
          activeChannel && client && connectionStatus === 'connected' && (
            <Channel channel={activeChannel}>
              <div className={styles.mobileChatView}>
                {/* Chat Header */}
                <div className={styles.mobileChatHeader}>
                  <div className="flex items-center space-x-2 py-2 px-3 bg-white border-b border-gray-200">
                    <button
                      onClick={handleBackToChannelList}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <ArrowLeft size={18} className="text-gray-600" />
                    </button>

                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        {channels.find(chat => chat.channelId === activeChannel?.id)?.dogImage ? (
                          <img
                            src={channels.find(chat => chat.channelId === activeChannel?.id)?.dogImage}
                            alt="Dog"
                            className="w-7 h-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
                            <span className="text-gray-400 text-sm">🐕</span>
                          </div>
                        )}
                        <div>
                          <h3 className="font-medium text-gray-900 text-sm leading-tight">
                            {channels.find(chat => chat.channelId === activeChannel?.id)?.dogName || 'Dog Bio'}
                          </h3>
                          <p className="text-xs text-gray-500 leading-tight">
                            with {channels.find(chat => chat.channelId === activeChannel?.id)?.otherUserName || 'Volunteer'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className={styles.mobileChatMessages}>
                  <MessageList />
                </div>

                {/* Chat Input */}
                <div className={styles.mobileChatInput}>
                  <MessageInput />
                </div>
              </div>
            </Channel>
          )
        )
      ) : (
        // Desktop Layout
        <div className={styles.desktopChatLayout}>
          {/* Channel List */}
          <div className={styles.desktopChannelList}>
            <div className={styles.channelListHeader}>
              <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
            </div>
            <div className={styles.channelListContent}>
              {loadingChannels ? (
                // Loading state for desktop
                <div className="flex flex-col items-center justify-center text-center px-6 py-12 h-full min-h-[400px]">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    Loading Messages...
                  </h3>
                  <p className="text-sm text-gray-600 max-w-sm leading-relaxed">
                    Please wait while we fetch your conversations.
                  </p>
                </div>
              ) : channels.length === 0 ? (
                // Empty state for desktop
                <div className="flex flex-col items-center justify-center text-center px-6 py-12 h-full min-h-[400px]">
                  <div className="text-6xl mb-4">🐕</div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    No Messages Yet
                  </h3>
                  <p className="text-sm text-gray-600 max-w-sm leading-relaxed">
                    Your messages will appear here once you have a confirmed appointment. Chat with other users to coordinate your therapy dog visits!
                  </p>
                </div>
              ) : (
                channels.map(chat => (
                  <div
                    key={chat.channelId}
                    onClick={() => handleChannelSelect(chat.channelId)}
                    className={`${styles.channelItem} ${activeChannelId === chat.channelId ? styles.active : ''}`}
                  >
                    <div className="flex items-center space-x-3 p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                    {chat.dogImage ? (
                      <img
                        src={chat.dogImage}
                        alt={chat.dogName}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                        <span className="text-gray-500">🐕</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {chat.dogName}
                        </h3>
                        <div className="flex flex-col items-end space-y-1">
                          <div className="text-right">
                            <div className="text-xs text-gray-500 font-medium">Meeting Date:</div>
                            <div className="text-xs text-gray-400">
                              {formatAppointmentDate(chat.appointmentTime)}
                            </div>
                          </div>
                          {chat.unreadCount > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        with {chat.otherUserName}
                      </p>
                    </div>
                  </div>
                </div>
              ))
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div className={styles.desktopChatArea}>
            {activeChannel && client && connectionStatus === 'connected' ? (
              <Channel channel={activeChannel}>
                <div className={styles.desktopChatContent}>
                  <MessageList />
                  <MessageInput />
                </div>
              </Channel>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                {connectionStatus === 'connecting' ? 'Connecting...' : 'Select a conversation to start messaging'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Return the chat interface wrapped in the Chat component
  return (
    <Chat client={client}>
      {chatContent}
    </Chat>
  );
}
