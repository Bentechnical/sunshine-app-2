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
  const { client, connectionStatus, updateUnreadFromChannels } = useUnreadCount();

  // Core state
  const [channels, setChannels] = useState<ChatData[]>([]);
  const [activeChannel, setActiveChannel] = useState<any>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  
  // Mobile state
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<'channelList' | 'activeChat'>('channelList');

  // Clean up handler
  const cleanupChatState = useCallback(() => {
    setActiveChannel(null);
    setActiveChannelId(null);
    setChannels([]);
    setViewMode('channelList');
    onActiveChatChange?.(false);
  }, [onActiveChatChange]);

  // Load channels
  const loadChannels = useCallback(async () => {
    try {
      const response = await fetch('/api/chat/channels');
      if (!response.ok) throw new Error('Failed to fetch channels');

      const data = await response.json();
      const channelsArray = Array.isArray(data.chats) ? data.chats : [];

      // If we have a Stream Chat client, get real-time unread counts using official API
      let enrichedChannels = channelsArray;
      if (client && client.userID) {
        try {
          // Use Stream Chat's official unread count API
          const unreadResponse = await client.getUnreadCount();

          console.log('[MessagingTab] Got unread counts from Stream Chat API:', {
            total_unread: unreadResponse.total_unread_count,
            channels: unreadResponse.channels?.length,
            channelDetails: unreadResponse.channels?.slice(0, 3)
          });

          // Update unread counts with official Stream Chat unread data
          enrichedChannels = channelsArray.map((chat: any) => {
            // Extract channel ID from the full channel ID (format: messaging:channel-id)
            const channelId = chat.channelId?.split(':')[1] || chat.channelId;

            // Find matching channel in unread response
            const unreadChannel = unreadResponse.channels?.find((uc: any) =>
              uc.channel_id === channelId || uc.channel_id === chat.channelId
            );

            return {
              ...chat,
              unreadCount: unreadChannel?.unread_count || 0
            };
          });
        } catch (streamError) {
          console.warn('[MessagingTab] Failed to get Stream Chat unread counts:', streamError);
          // Fall back to API data if Stream Chat query fails
        }
      }

      console.log('[MessagingTab] 📋 Final channels data:', {
        originalCount: channelsArray.length,
        enrichedCount: enrichedChannels.length,
        hasClient: !!client,
        channelSample: enrichedChannels.slice(0, 2).map((ch: any) => ({
          channelId: ch.channelId,
          unreadCount: ch.unreadCount,
          dogName: ch.dogName
        }))
      });

      setChannels(enrichedChannels);

      // Update shared context with reliable MessagingTab data
      console.log('[MessagingTab] Updating shared context with channels:', {
        channelCount: enrichedChannels.length,
        sampleUnreadCounts: enrichedChannels.slice(0, 3).map((ch: any) => ({
          channelId: ch.channelId,
          unreadCount: ch.unreadCount
        }))
      });
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
    }
  }, [activeChannelId, client, updateUnreadFromChannels]);

  // Load channels when client is ready
  useEffect(() => {
    if (client && connectionStatus === 'connected') {
      loadChannels();

      // Set up event listeners for real-time unread count updates
      const updateUnreadCounts = async () => {
        try {
          // Reload channels which will automatically update shared context
          await loadChannels();
        } catch (err) {
          console.warn('[MessagingTab] Failed to update unread counts:', err);
        }
      };

      // Listen for official unread notification events
      client.on('notification.message_new', updateUnreadCounts as any);
      client.on('notification.mark_read', updateUnreadCounts as any);
      client.on('notification.mark_unread', updateUnreadCounts as any);

      return () => {
        // Clean up event listeners
        client.off('notification.message_new', updateUnreadCounts as any);
        client.off('notification.mark_read', updateUnreadCounts as any);
        client.off('notification.mark_unread', updateUnreadCounts as any);
      };
    }
  }, [client, connectionStatus, loadChannels]);

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
              {channels.map(chat => (
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
                        {chat.unreadCount > 0 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        with {chat.otherUserName}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Active Chat View
          activeChannel && (
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
              {channels.map(chat => (
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
                        {chat.unreadCount > 0 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        with {chat.otherUserName}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Area */}
          <div className={styles.desktopChatArea}>
            {activeChannel ? (
              <Channel channel={activeChannel}>
                <div className={styles.desktopChatContent}>
                  <MessageList />
                  <MessageInput />
                </div>
              </Channel>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a conversation to start messaging
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
