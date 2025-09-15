'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import {
  Chat,
  Channel,
  ChannelHeader,
  MessageInput,
  MessageList,
  Thread,
} from 'stream-chat-react';
import 'stream-chat-react/dist/css/v2/index.css';
import { streamChatManager } from '@/utils/stream-chat-client';
import { StreamChat } from 'stream-chat';
import { Loader2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
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
  const { user } = useUser();
  
  // Core state
  const [client, setClient] = useState<StreamChat | null>(null);
  const [channels, setChannels] = useState<ChatData[]>([]);
  const [activeChannel, setActiveChannel] = useState<any>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  
  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error' | 'reconnecting'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
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

      // If we have a Stream Chat client, get real-time unread counts
      let enrichedChannels = channelsArray;
      if (client && client.userID) {
        try {
          // Get channels from Stream Chat client with unread counts
          const filter = {
            members: { $in: [client.userID!] },
            type: 'messaging'
          };
          const streamChannels = await client.queryChannels(filter, {}, { limit: 20 });

          // Update unread counts with real Stream Chat data
          enrichedChannels = channelsArray.map((chat: any) => {
            const streamChannel = streamChannels.find(sc => sc.id === chat.channelId);
            return {
              ...chat,
              unreadCount: streamChannel?.state?.unreadCount || 0
            };
          });
        } catch (streamError) {
          console.warn('Failed to get Stream Chat unread counts:', streamError);
          // Fall back to API data if Stream Chat query fails
        }
      }

      setChannels(enrichedChannels);

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
  }, [activeChannelId, client]);

  // Initialize chat
  useEffect(() => {
    if (!user) return;

    const initializeChat = async () => {
      setConnectionStatus('connecting');
      setError(null);

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
          await loadChannels();

          // Set up event listeners for real-time unread count updates
          const updateUnreadCounts = async () => {
            try {
              const filter = {
                members: { $in: [newClient.userID!] },
                type: 'messaging'
              };
              const streamChannels = await newClient.queryChannels(filter, {}, { limit: 20 });

              setChannels(prev => {
                // Only update if we have channels loaded
                if (prev.length === 0) return prev;

                return prev.map((chat: any) => {
                  const streamChannel = streamChannels.find(sc => sc.id === chat.channelId);
                  return {
                    ...chat,
                    unreadCount: streamChannel?.state?.unreadCount || 0
                  };
                });
              });
            } catch (err) {
              console.warn('Failed to update unread counts:', err);
            }
          };

          // Listen for message events to update unread counts
          newClient.on('message.new', updateUnreadCounts as any);
          newClient.on('message.read', updateUnreadCounts as any);
          newClient.on('notification.mark_read', updateUnreadCounts as any);
        } else {
          throw new Error('Failed to initialize chat client');
        }
      } catch (err: any) {
        console.error('Chat initialization failed:', err);
        setError('Failed to connect to chat. Please try again.');
        setConnectionStatus('error');
        cleanupChatState();
      }
    };

    // Handle disconnection from StreamChatManager
    const handleDisconnect = () => {
      console.log('[MessagingTab] Received disconnect notification');
      setConnectionStatus('disconnected');
      cleanupChatState();
    };

    // Register disconnect handler and initialize
    streamChatManager.onDisconnect(handleDisconnect);
    initializeChat();

    // Cleanup: unregister disconnect handler
    return () => {
      streamChatManager.offDisconnect(handleDisconnect);
      // Note: Event listeners are cleaned up when the client disconnects
    };
  }, [user, loadChannels, cleanupChatState]);

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

  // Monitor connection state changes
  useEffect(() => {
    if (!client) return;

    const handleConnectionChange = ({ online = false }) => {
      setConnectionStatus(online ? 'connected' : 'disconnected');
    };

    client.on('connection.changed', handleConnectionChange);

    return () => {
      client.off('connection.changed', handleConnectionChange);
    };
  }, [client]);

  // Render loading state
  if (connectionStatus === 'connecting' || isReconnecting) {
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
            disabled={isReconnecting}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isReconnecting ? 'animate-spin' : ''}`} />
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
