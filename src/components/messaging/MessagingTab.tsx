'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import {
  Chat,
  Channel,
  ChannelHeader,
  ChannelList,
  MessageInput,
  MessageList,
  Thread,
  Window,
} from 'stream-chat-react';
import 'stream-chat-react/dist/css/v2/index.css';
import { streamChatManager } from '@/utils/stream-chat-client';
import { StreamChat } from 'stream-chat';
import { Loader2, Wifi, WifiOff, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';

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
  // No props needed for non-admin users
}

export default function MessagingTab({}: MessagingTabProps) {
  const { user } = useUser();
  const [client, setClient] = useState<StreamChat | null>(null);
  const [channels, setChannels] = useState<ChatData[]>([]);
  const [activeChannel, setActiveChannel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error' | 'reconnecting'>('disconnected');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [viewMode, setViewMode] = useState<'channelList' | 'activeChat'>('channelList');
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Cleanup function to reset state when client is disconnected
  const cleanupDisconnectedState = useCallback(() => {
    setActiveChannel(null);
    setChannels([]);
    setConnectionStatus('disconnected');
  }, []);

  // Reconnection function
  const handleReconnect = useCallback(async () => {
    if (!user || isReconnecting) return;

    setIsReconnecting(true);
    setError(null);
    setConnectionStatus('reconnecting');

    try {
      // Get fresh token
      const tokenResponse = await fetch('/api/chat/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get chat token');
      }

      const { token } = await tokenResponse.json();

      // Reconnect using the manager
      const userClient = await streamChatManager.connectUser(
        user.id,
        token,
        {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          image: user.imageUrl,
        }
      );

      setClient(userClient);
      setConnectionStatus('connected');
      
      // Refresh channels after reconnection
      await fetchChannels();
      
    } catch (err) {
      console.error('Error reconnecting:', err);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to reconnect';
      if (err instanceof Error) {
        if (err.message.includes('id field on the user is missing')) {
          errorMessage = 'Connection error: Please refresh the page and try again';
        } else if (err.message.includes('Failed to get chat token')) {
          errorMessage = 'Authentication error: Please sign in again';
        } else if (err.message.includes('network')) {
          errorMessage = 'Network error: Please check your connection and try again';
        } else {
          errorMessage = `Reconnection failed: ${err.message}`;
        }
      }
      
      setError(errorMessage);
      setConnectionStatus('error');
    } finally {
      setIsReconnecting(false);
    }
  }, [user, isReconnecting]);

  useEffect(() => {
    let isMounted = true;
    
    const initializeChat = async () => {
      if (!user) return;

      try {
        setConnectionStatus('connecting');
        setError(null);
        
        // Get Stream Chat token
        const tokenResponse = await fetch('/api/chat/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!tokenResponse.ok) {
          throw new Error('Failed to get chat token');
        }

        const { token } = await tokenResponse.json();

        // Use centralized client manager
        const userClient = await streamChatManager.connectUser(
          user.id,
          token,
          {
            id: user.id,
            name: `${user.firstName} ${user.lastName}`,
            image: user.imageUrl,
          }
        );

        if (isMounted) {
          setClient(userClient);
          setConnectionStatus('connected');
          setError(null);
        }

      } catch (err) {
        console.error('Error initializing chat:', err);
        if (isMounted) {
          setError('Failed to initialize chat');
          setConnectionStatus('error');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeChat();

    return () => {
      isMounted = false;
      // Note: We don't disconnect here anymore as the manager handles it
      // The manager will disconnect when the user changes or on page unload
    };
  }, [user?.id]); // Only depend on user.id to prevent re-initialization loops

  // Monitor connection status and handle disconnections
  useEffect(() => {
    if (!client) return;

    const checkConnectionStatus = () => {
      const state = streamChatManager.getConnectionState();
      
      // Map Stream Chat states to our UI states
      switch (state) {
        case 'connected':
          setConnectionStatus('connected');
          break;
        case 'connecting':
          setConnectionStatus('connecting');
          break;
        case 'disconnected':
          setConnectionStatus('disconnected');
          // Clean up state when disconnected
          cleanupDisconnectedState();
          break;
        default:
          setConnectionStatus('disconnected');
          cleanupDisconnectedState();
      }
    };

    // Check immediately
    checkConnectionStatus();

    // Set up periodic checking
    const interval = setInterval(checkConnectionStatus, 2000);

    // Listen for connection state changes
    const handleConnectionChange = () => {
      checkConnectionStatus();
    };

    // Listen for client disconnect events
    const handleDisconnect = () => {
      console.log('[MessagingTab] Client disconnected, cleaning up state');
      cleanupDisconnectedState();
      setConnectionStatus('disconnected');
    };

    // Register disconnect callback with the manager
    const handleManagerDisconnect = () => {
      console.log('[MessagingTab] Manager disconnect callback triggered');
      cleanupDisconnectedState();
      setConnectionStatus('disconnected');
    };

    streamChatManager.onDisconnect(handleManagerDisconnect);

    client.on('connection.changed', handleConnectionChange);
    client.on('disconnect', handleDisconnect);

    return () => {
      clearInterval(interval);
      client.off('connection.changed', handleConnectionChange);
      client.off('disconnect', handleDisconnect);
      streamChatManager.offDisconnect(handleManagerDisconnect);
    };
  }, [client, cleanupDisconnectedState]);

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      // Reset active channel when component unmounts
      setActiveChannel(null);
    };
  }, []);

  // Activity tracking for chat interactions
  useEffect(() => {
    const updateActivity = () => {
      streamChatManager.updateActivity();
    };

    // Track chat-specific interactions
    const events = ['mousedown', 'keypress', 'scroll'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
    };
  }, []);

  const fetchChannels = async () => {
    if (!client || connectionStatus !== 'connected' || !streamChatManager.isClientReady()) return;

    try {
      const response = await fetch('/api/chat/channels');
      if (response.ok) {
        const data = await response.json();
        setChannels(data.chats || []);

        // Ensure all channels are watched for unread count tracking
        for (const chat of data.chats || []) {
          const channelId = chat.channelId.replace('messaging:', '');
          const channel = client.channel('messaging', channelId);
          // Only watch if not already being watched
          if (!channel.initialized || !(channel.state.watcher_count > 0)) {
            try {
              await channel.watch();
            } catch (err) {
              // Ignore errors if already being watched
            }
          }
        }
        
        // Call the callback to update unread count in navigation
        // if (onUnreadCountChange) { // This line is removed as per the edit hint
        //   onUnreadCountChange();
        // }
      } else {
        console.error('Failed to fetch channels');
      }
    } catch (error) {
      console.error('Error fetching channels:', error);
    }
  };

  useEffect(() => {
    if (client && connectionStatus === 'connected') {
      fetchChannels();
    }
  }, [client, connectionStatus]);

  const handleChannelSelect = async (chat: ChatData) => {
    try {
      if (!client || connectionStatus !== 'connected' || !streamChatManager.isClientReady()) {
        console.log('[MessagingTab] Cannot select channel - client not ready');
        return;
      }

      // Create a Stream Chat channel from the chat data
      const channelId = chat.channelId.replace('messaging:', '');
      const channel = client.channel('messaging', channelId);
      
      // Watch the channel to load messages
      await channel.watch();
      
      setActiveChannel(channel);
      streamChatManager.updateActivity(); // Update activity when user interacts
      
      // Switch to chat view on mobile
      if (isMobile) {
        setViewMode('activeChat');
      }
    } catch (error) {
      console.error('Error selecting channel:', error);
      // If channel selection fails due to disconnection, trigger reconnection
      if (error instanceof Error && (error.message.includes('disconnect') || error.message.includes('disconnected'))) {
        console.log('[MessagingTab] Channel selection failed due to disconnection, triggering reconnection');
        cleanupDisconnectedState();
        await handleReconnect();
      }
    }
  };

  // Handle going back to channel list on mobile
  const handleBackToChannelList = () => {
    setViewMode('channelList');
    setActiveChannel(null);
  };

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'connecting':
      case 'reconnecting':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'disconnected':
        return <WifiOff className="h-4 w-4 text-gray-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <WifiOff className="h-4 w-4 text-gray-500" />;
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Connection Error';
      default:
        return 'Unknown';
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'text-green-600';
      case 'connecting':
      case 'reconnecting':
        return 'text-blue-600';
      case 'disconnected':
        return 'text-gray-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  // Custom mobile channel header with back button
  const MobileChannelHeader = () => {
    if (!activeChannel) return null;
    
    const channelData = channels.find(chat => 
      chat.channelId.replace('messaging:', '') === activeChannel.id
    );
    
    return (
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleBackToChannelList}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex items-center space-x-3">
            {channelData?.dogImage ? (
              <img
                src={channelData.dogImage}
                alt={channelData.dogName}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                <span className="text-gray-500 text-sm">🐕</span>
              </div>
            )}
            <div>
              <h3 className="font-medium text-gray-900">{channelData?.dogName}</h3>
              <p className="text-sm text-gray-500">with {channelData?.otherUserName.split(' ')[0]}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Initializing chat...</p>
        </div>
      </div>
    );
  }

  if (error && connectionStatus === 'error') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{error}</p>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleReconnect}
              disabled={isReconnecting}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
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
            <button
              onClick={async () => {
                try {
                  await streamChatManager.forceRefreshConnection();
                  await handleReconnect();
                } catch (error) {
                  console.error('Force refresh failed:', error);
                }
              }}
              disabled={isReconnecting}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center text-sm"
              title="Force refresh connection (use if reconnect fails)"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Force
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-600">No chat client available</p>
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center mx-auto"
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
    );
  }

  return (
    <div className="flex flex-col h-full md:h-[90vh] md:max-h-[90vh] -mx-2 md:mx-0 -mb-4 md:mb-0 bg-white">
      {/* Connection Status Bar */}
      <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          {getConnectionStatusIcon()}
          <span className={`text-sm ${getConnectionStatusColor()}`}>{getConnectionStatusText()}</span>
          {connectionStatus === 'reconnecting' && (
            <span className="text-xs text-blue-500">(Quick reconnect)</span>
          )}
        </div>
        <div className="flex items-center space-x-4 text-xs text-gray-500">
          <span>Last active: {new Date(streamChatManager.getLastActivityTime()).toLocaleTimeString()}</span>
          {connectionStatus === 'connected' && (
            <span className="text-green-600">● Live</span>
          )}
          {connectionStatus === 'disconnected' && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleReconnect}
                disabled={isReconnecting}
                className="text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Reconnect
              </button>
              <button
                onClick={async () => {
                  try {
                    await streamChatManager.forceRefreshConnection();
                    await handleReconnect();
                  } catch (error) {
                    console.error('Force refresh failed:', error);
                  }
                }}
                disabled={isReconnecting}
                className="text-orange-600 hover:text-orange-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center text-xs"
                title="Force refresh connection (use if reconnect fails)"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Force
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chat Interface */}
      <div className="flex-1 overflow-hidden">
        {connectionStatus === 'connected' ? (
          <Chat client={client} theme="messaging light">
            {isMobile ? (
              // Mobile Layout: Stacked
              <div className="h-full">
                {viewMode === 'channelList' ? (
                  // Channel List View
                  <div className="h-full flex flex-col">
                    <div className="p-4 border-b shrink-0">
                      <h3 className="font-semibold text-gray-900">Messages</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {(channels || []).length} active conversation{(channels || []).length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                      {(channels || []).length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          <p>No active conversations</p>
                          <p className="text-sm mt-1">Chats appear here when appointments are confirmed</p>
                        </div>
                      ) : (
                        <div>
                          {(channels || []).map((chat) => (
                            <div
                              key={chat.appointmentId}
                              onClick={() => handleChannelSelect(chat)}
                              className="p-4 border-b hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center space-x-3">
                                <div className="flex-shrink-0">
                                  {chat.dogImage ? (
                                    <img
                                      src={chat.dogImage}
                                      alt={chat.dogName}
                                      className="w-12 h-12 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                                      <span className="text-gray-500 text-lg">🐕</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-500 truncate">
                                    {new Date(chat.appointmentTime).toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      month: 'short',
                                      day: 'numeric'
                                    })} at {new Date(chat.appointmentTime).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true
                                    })}
                                  </p>
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
                      )}
                    </div>
                  </div>
                ) : (
                  // Chat View
                  activeChannel ? (
                    <Channel channel={activeChannel}>
                      <div className="h-full flex flex-col">
                        <MobileChannelHeader />
                        <div className="flex-1 overflow-hidden">
                          <MessageList />
                        </div>
                        <div className="shrink-0 pb-20">
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
                          Choose a conversation from the list to start messaging
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              // Desktop Layout: Side-by-side (existing)
              <div className="flex h-full">
                {/* Channel List */}
                <div className="w-80 border-r bg-white flex flex-col">
                  <div className="p-4 border-b shrink-0">
                    <h3 className="font-semibold text-gray-900">Messages</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {(channels || []).length} active conversation{(channels || []).length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto">
                    {(channels || []).length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        <p>No active conversations</p>
                        <p className="text-sm mt-1">Chats appear here when appointments are confirmed</p>
                      </div>
                    ) : (
                      <div>
                        {(channels || []).map((chat) => (
                          <div
                            key={chat.appointmentId}
                            onClick={() => handleChannelSelect(chat)}
                            className="p-4 border-b hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="flex-shrink-0">
                                {chat.dogImage ? (
                                  <img
                                    src={chat.dogImage}
                                    alt={chat.dogName}
                                    className="w-10 h-10 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                                    <span className="text-gray-500 text-sm">🐕</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-500 truncate">
                                  {new Date(chat.appointmentTime).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric'
                                  })} at {new Date(chat.appointmentTime).toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                  })}
                                </p>
                                <div className="border-b border-gray-100 mb-2"></div>
                                <p className="text-sm font-medium text-gray-700 truncate">
                                  {chat.dogName}
                                </p>
                                <p className="text-xs text-gray-400 truncate">
                                  with {chat.otherUserName.split(' ')[0]}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Chat Window */}
                <div className="flex-1 flex flex-col">
                  {activeChannel ? (
                    <Channel channel={activeChannel}>
                      <Window>
                        <ChannelHeader />
                        <MessageList />
                        <MessageInput />
                      </Window>
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
                          Choose a conversation from the list to start messaging
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Chat>
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-50">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-gray-500 text-2xl">📡</span>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {connectionStatus === 'disconnected' ? 'Connection Lost' : 'Connecting...'}
              </h3>
              <p className="text-gray-500 mb-4">
                {connectionStatus === 'disconnected' 
                  ? 'Your connection was lost due to inactivity. Click reconnect to continue.'
                  : 'Establishing connection to chat server...'
                }
              </p>
              {connectionStatus === 'disconnected' && (
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
