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

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Reconnection handler
  const handleReconnect = useCallback(async () => {
    if (!user || isReconnecting) return;

    setIsReconnecting(true);
    setError(null);

    try {
      setConnectionStatus('connecting');

      // Use streamChatManager for connection
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
        
        // Fetch channels after connection
        await loadChannels();
      } else {
        throw new Error('Failed to connect to chat');
      }
    } catch (err: any) {
      console.error('Reconnection failed:', err);
      setError('Connection failed. Please try again.');
      setConnectionStatus('error');
    } finally {
      setIsReconnecting(false);
    }
  }, [user, isReconnecting]);

  // Load channels
  const loadChannels = useCallback(async () => {
    try {
      const response = await fetch('/api/chat/channels');
      if (!response.ok) throw new Error('Failed to fetch channels');
      
      const channelData = await response.json();
      setChannels(channelData);
      
      // Restore active channel if it exists
      if (activeChannelId && client) {
        const channel = client.channel('messaging', activeChannelId);
        await channel.watch();
        setActiveChannel(channel);
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
      setError('Failed to load conversations');
    }
  }, [activeChannelId, client]);

  // Initialize chat
  useEffect(() => {
    if (!user) return;

    const initializeChat = async () => {
      setConnectionStatus('connecting');
      setError(null);

      try {
        // Get Stream Chat token
        const tokenResponse = await fetch('/api/chat/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        });

        if (!tokenResponse.ok) {
          throw new Error('Failed to get chat token');
        }

        const { token } = await tokenResponse.json();

        // Connect using streamChatManager
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
        } else {
          throw new Error('Failed to initialize chat client');
        }
      } catch (err: any) {
        console.error('Chat initialization failed:', err);
        setError('Failed to connect to chat. Please try again.');
        setConnectionStatus('error');
      }
    };

    initializeChat();

    // No cleanup needed - streamChatManager handles connection lifecycle
  }, [user, loadChannels]);

  // Channel selection
  const handleChannelSelect = useCallback(async (channelId: string) => {
    if (!client) return;

    try {
      const channel = client.channel('messaging', channelId);
      await channel.watch();
      
      setActiveChannel(channel);
      setActiveChannelId(channelId);
      
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

  // Back to channel list
  const handleBackToChannelList = useCallback(() => {
    if (isMobile) {
      setViewMode('channelList');
      onActiveChatChange?.(false);
    }
  }, [isMobile, onActiveChatChange]);

  // Error state
  if (error && connectionStatus === 'error') {
    return (
      <div className={styles.messagingContainer}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 mb-4 whitespace-pre-line">{error}</p>
            <button
              onClick={handleReconnect}
              disabled={isReconnecting}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center mx-auto"
            >
              {isReconnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Reconnecting...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reconnect
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (!client || connectionStatus === 'connecting') {
    return (
      <div className={styles.messagingContainer}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Connecting to chat...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.messagingContainer}>
      <Chat client={client}>
        {/* Mobile Layout */}
        {isMobile ? (
          <>
            {viewMode === 'channelList' ? (
              // Channel List View
              <div className={styles.mobileChannelList}>
                <div className={styles.channelListHeader}>
                  <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
                  <p className="text-sm text-gray-600">{channels.length} active conversation{channels.length !== 1 ? 's' : ''}</p>
                </div>
                
                <div className={styles.channelListContent}>
                  {channels.map((chat) => (
                    <div
                      key={chat.channelId}
                      onClick={() => handleChannelSelect(chat.channelId)}
                      className={styles.channelItem}
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
                              <span className="text-gray-600 text-lg">🐕</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm text-gray-500">
                              {new Date(chat.appointmentTime).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </p>
                          </div>
                          <div className="border-b border-gray-100 mb-2"></div>
                          <p className="text-sm font-medium text-gray-700 truncate">
                            {chat.dogName}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            with {chat.otherUserName.split(' ')[0]}
                          </p>
                          {chat.unreadCount > 0 && (
                            <div className="mt-1">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {chat.unreadCount} unread
                              </span>
                            </div>
                          )}
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
                      <div className="flex items-center space-x-3 p-4 bg-white border-b border-gray-200">
                        <button
                          onClick={handleBackToChannelList}
                          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <ArrowLeft size={20} className="text-gray-600" />
                        </button>
                        
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                              <span className="text-gray-600">🐕</span>
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900">Dog Bio</h3>
                              <p className="text-sm text-gray-500">with Volunteer</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Messages */}
                    <div className={styles.mobileChatMessages}>
                      <MessageList />
                    </div>

                    {/* Message Input */}
                    <div className={styles.mobileChatInput}>
                      <MessageInput />
                    </div>
                  </div>
                  
                  <Thread />
                </Channel>
              )
            )}
          </>
        ) : (
          // Desktop Layout
          <div className={styles.desktopChatLayout}>
            {/* Channel List Sidebar */}
            <div className={styles.desktopChannelList}>
              <div className={styles.channelListHeader}>
                <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
                <p className="text-sm text-gray-600">{channels.length} active conversation{channels.length !== 1 ? 's' : ''}</p>
              </div>
              
              <div className={styles.channelListContent}>
                {channels.map((chat) => (
                  <div
                    key={chat.channelId}
                    onClick={() => handleChannelSelect(chat.channelId)}
                    className={`${styles.channelItem} ${activeChannelId === chat.channelId ? styles.active : ''}`}
                  >
                    <div className="flex items-center space-x-3 p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                      <div className="flex-shrink-0">
                        {chat.dogImage ? (
                          <img
                            src={chat.dogImage}
                            alt={chat.dogName}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-gray-600">🐕</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {chat.dogName}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          with {chat.otherUserName.split(' ')[0]}
                        </p>
                        {chat.unreadCount > 0 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                            {chat.unreadCount}
                          </span>
                        )}
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
                    <div className={styles.desktopChatHeader}>
                      <ChannelHeader />
                    </div>
                    
                    <div className={styles.desktopChatMessages}>
                      <MessageList />
                    </div>
                    
                    <div className={styles.desktopChatInput}>
                      <MessageInput />
                    </div>
                  </div>
                  
                  <Thread />
                </Channel>
              ) : (
                <div className="flex items-center justify-center h-full bg-gray-50">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-gray-500 text-2xl">💬</span>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Select a conversation
                    </h3>
                    <p className="text-gray-500">
                      Choose a chat to start messaging
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Chat>
    </div>
  );
}