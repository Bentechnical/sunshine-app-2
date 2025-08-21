'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
// Check if web version has keyboard context
// import { useKeyboardContext } from 'stream-chat-react';
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
  onActiveChatChange?: (isActiveChat: boolean) => void;
}

export default function MessagingTab({ onActiveChatChange }: MessagingTabProps) {
  const { user } = useUser();
  const [client, setClient] = useState<StreamChat | null>(null);
  const [channels, setChannels] = useState<ChatData[]>([]);
  const [activeChannel, setActiveChannel] = useState<any>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
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

  // Simplified: rely on CSS vh helper and flex layout (no dynamic height writes)

  // No per-frame recalcs; the container height is driven by --vh via CSS

  // No dynamic padding needed with grid layout

  // Cleanup function to reset state when client is disconnected
  const cleanupDisconnectedState = useCallback(() => {
    setActiveChannel(null);
    setActiveChannelId(null);
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

      // Reconnect using provider path (SDK-managed)
      const userClient = await streamChatManager.connectUserWithProvider(
        user.id,
        {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          image: user.imageUrl,
        }
      );

      setClient(userClient);
      setConnectionStatus('connected');
      setViewMode('channelList');
      // Refresh channels immediately and with backoff to handle mobile timing
      await fetchChannelsWithClient(userClient);
      setTimeout(() => fetchChannelsWithClient(userClient), 300);
      setTimeout(() => fetchChannelsWithClient(userClient), 1000);
      
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

  // Comprehensive mobile layout cleanup function
  const cleanupMobileLayout = () => {
    // Reset any persistent styles that might have been applied by previous keyboard detection
    const elementsToClean = [
      '.relative.flex-1.overflow-hidden',
      'main.flex-grow', 
      'main.flex-1',
      '.chat-vv',
      '.str-chat__container' // Add Stream Chat container cleanup
    ];
    
    elementsToClean.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        const el = element as HTMLElement;
        el.style.removeProperty('height');
        el.style.removeProperty('max-height');
        el.style.removeProperty('overflow');
        el.style.removeProperty('position');
        el.style.removeProperty('top');
        el.style.removeProperty('transform');
        el.style.removeProperty('padding-bottom');
        el.style.removeProperty('margin-bottom');
      }
    });
    
    // Clean up body and document styles
    document.body.classList.remove('keyboard-open', 'ios-keyboard-open');
    document.body.style.removeProperty('position');
    document.body.style.removeProperty('top');
    document.body.style.removeProperty('height');
    document.body.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('--visual-viewport-height');
    
    // Force Stream Chat to recalculate layout
    setTimeout(() => {
      const streamContainer = document.querySelector('.str-chat__container');
      if (streamContainer) {
        (streamContainer as HTMLElement).style.removeProperty('height');
        (streamContainer as HTMLElement).style.removeProperty('max-height');
      }
    }, 50);
  };

  // Debug helpers for development and testing
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      try {
        (window as any).__setChats = (arr: any[]) => setChannels(Array.isArray(arr) ? arr : []);
        (window as any).__openChat = (id: string) => setActiveChannelId(id);
        
        // Connection testing helpers
        (window as any).__forceDisconnect = () => {
          console.log('🔌 Forcing disconnect...');
          if (client) {
            client.disconnectUser();
          }
          cleanupDisconnectedState();
        };
        
        (window as any).__forceReconnect = () => {
          console.log('🔄 Forcing reconnect...');
          handleReconnect();
        };
        
        // Stream Chat manager helpers
        (window as any).__forceRefresh = async () => {
          console.log('♻️ Forcing connection refresh...');
          try {
            await streamChatManager.forceRefreshConnection();
            await handleReconnect();
          } catch (error) {
            console.error('Force refresh failed:', error);
          }
        };
        
        // Layout cleanup helper
        (window as any).__cleanupLayout = () => {
          console.log('🧹 Cleaning up mobile layout...');
          cleanupMobileLayout();
        };
        
      } catch {}
    }
  }, [client, handleReconnect, cleanupMobileLayout]);

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

        // Use centralized client manager (provider)
        const userClient = await streamChatManager.connectUserWithProvider(
          user.id,
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
          await fetchChannelsWithClient(userClient);
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

  // Monitor connection status and handle disconnections (event-driven only)
  useEffect(() => {
    if (!client) return;

    // Listen for connection state changes
    const handleConnectionChange = (e?: any) => {
      if (e && e.online === true) {
        setConnectionStatus('connected');
        const freshClient = streamChatManager.getClient();
        if (freshClient) {
          // Immediate fetch
          fetchChannelsWithClient(freshClient);
          // Backoff re-fetch to handle mobile timing
          setTimeout(() => fetchChannelsWithClient(freshClient), 300);
          setTimeout(() => fetchChannelsWithClient(freshClient), 1000);
        }
        setViewMode('channelList');
      } else if (e && e.online === false) {
        // transient offline; don't clear UI state
        setConnectionStatus('disconnected');
      }
    };

    // Listen for client disconnect events (definitive)
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
      
      // Comprehensive mobile layout cleanup
      const elementsToClean = [
        '.relative.flex-1.overflow-hidden',
        'main.flex-grow', 
        'main.flex-1',
        '.chat-vv'
      ];
      
      elementsToClean.forEach(selector => {
        const element = document.querySelector(selector);
        if (element) {
          const el = element as HTMLElement;
          el.style.removeProperty('height');
          el.style.removeProperty('max-height');
          el.style.removeProperty('overflow');
          el.style.removeProperty('position');
          el.style.removeProperty('top');
          el.style.removeProperty('transform');
        }
      });
      
      // Clean up body and document styles
      document.body.classList.remove('keyboard-open', 'ios-keyboard-open');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('height');
      document.body.style.removeProperty('overflow');
      document.documentElement.style.removeProperty('--visual-viewport-height');
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

  const fetchChannelsWithClient = async (c: StreamChat | null) => {
    try {
      const response = await fetch('/api/chat/channels');
      if (!response.ok) {
        console.error('Failed to fetch channels');
        return;
      }
      const data = await response.json();
      setChannels(data.chats || []);
      if (!c) return;
      for (const chat of data.chats || []) {
        const channelId = chat.channelId.replace('messaging:', '');
        const ch = c.channel('messaging', channelId);
        if (!ch.initialized || !(ch.state.watcher_count > 0)) {
          try { await ch.watch(); } catch {}
        }
      }
    } catch (error) {
      console.error('Error fetching channels:', error);
    }
  };

  const fetchChannels = async () => {
    if (!client || connectionStatus !== 'connected' || !streamChatManager.isClientReady()) return;
    await fetchChannelsWithClient(client);
  };

  useEffect(() => {
    if (client && connectionStatus === 'connected') {
      fetchChannelsWithClient(client);
    }
  }, [client, connectionStatus]);

  const handleChannelSelect = async (chat: ChatData) => {
    try {
      if (!client || !client.userID) {
        console.log('[MessagingTab] Cannot select channel - client not ready');
        return;
      }

      // Create a Stream Chat channel from the chat data
      const channelId = chat.channelId.replace('messaging:', '');
      const channel = client.channel('messaging', channelId);
      
      // Set UI state immediately
      setActiveChannelId(channelId);
      try { (window as any).__activeChannelId = channelId; } catch {}
      setActiveChannel(channel);
      // Watch in background; if it fails we will rebind via effect
      channel.watch().catch((e: any) => {
        console.warn('[MessagingTab] channel.watch failed (will rely on rebind):', e);
      });
      streamChatManager.updateActivity(); // Update activity when user interacts
      
      // Switch to chat view on mobile
      if (isMobile) {
        setViewMode('activeChat');
        if (onActiveChatChange) {
          onActiveChatChange(true);
        }
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

  // Re-bind active channel to the fresh client after reconnects or client changes
  useEffect(() => {
    let cancelled = false;
    const rebind = async () => {
      if (!client || !activeChannelId) return;
      try {
        const ch = client.channel('messaging', activeChannelId);
        setActiveChannel(ch); // set immediately for UI
        // Always watch to hydrate message list; ignore errors
        try { await ch.watch(); } catch {}
        if (!cancelled) setActiveChannel(ch);
      } catch (e) {
        console.warn('[MessagingTab] Rebind channel failed:', e);
      }
    };
    rebind();
    return () => { cancelled = true; };
  }, [client, activeChannelId]);

  // Handle going back to channel list on mobile
  const handleBackToChannelList = () => {
    setViewMode('channelList');
    setActiveChannel(null);
    
    // Comprehensive cleanup for mobile
    if (isMobile) {
      cleanupMobileLayout();
      if (onActiveChatChange) {
        onActiveChatChange(false);
      }
    }
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
    
    const headerBase = 'z-60 bg-white border-b md:relative'; // Higher z-index than main header (z-50)
    const headerClass = isMobile
      ? `chat-mobile-subheader ${headerBase} fixed top-12 left-0 right-0` // Fixed positioning below main header
      : `sticky top-0 px-3 py-2 ${headerBase}`;
    return (
      <div className={headerClass}> 
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackToChannelList}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            {channelData?.dogImage ? (
              <img
                src={channelData.dogImage}
                alt={channelData.dogName}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center">
                <span className="text-gray-500 text-sm">🐕</span>
              </div>
            )}
            <div>
              <h3 className="text-sm font-medium text-gray-900 leading-tight">{channelData?.dogName}</h3>
              <p className="text-xs text-gray-500 leading-tight">with {channelData?.otherUserName.split(' ')[0]}</p>
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
    <div className="chat-vv flex flex-col h-full w-full bg-white md:bg-card md:rounded-xl md:shadow md:h-[90vh] md:max-h-[90vh]">
      {/* Connection Status Bar (hidden on mobile) */}
      <div className="hidden md:flex bg-gray-50 border-b px-4 py-2 items-center justify-between shrink-0">
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
      <div className="flex-1 min-h-0 overflow-hidden">
        {connectionStatus === 'connected' && client?.userID ? (
          <Chat key={client.userID} client={client} theme="messaging light">
            {isMobile ? (
              // Mobile Layout: Stacked
              <div className="h-full">
                {viewMode === 'channelList' ? (
                  // Channel List View
                  <div className="h-full flex flex-col str-chat__channel-list">
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
                          <button onClick={() => {
                            const fresh = streamChatManager.getClient();
                            if (fresh) {
                              fetchChannelsWithClient(fresh);
                              setTimeout(() => fetchChannelsWithClient(fresh), 300);
                            }
                          }} className="mt-3 px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Retry</button>
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
                  // Chat View (mobile grid layout)
                  activeChannel && activeChannelId ? (
                    <Channel key={activeChannelId} channel={activeChannel}>
              <div className={`h-full w-full flex flex-col mobile-chat-container ${viewMode === 'activeChat' ? 'nav-hidden' : ''}`}>
                        <div className="bg-white mobile-chat-header">
                          <MobileChannelHeader />
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto px-3 mobile-chat-messages">
                          <MessageList />
                        </div>
                        <div className="bg-white mobile-chat-input">
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
                        <button onClick={() => {
                          const fresh = streamChatManager.getClient();
                          if (fresh) {
                            fetchChannelsWithClient(fresh);
                            setTimeout(() => fetchChannelsWithClient(fresh), 300);
                          }
                        }} className="mt-3 px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Retry</button>
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
                  {activeChannel && activeChannelId ? (
                    <Channel key={activeChannelId} channel={activeChannel}>
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
          <div className="flex items-start md:items-center justify-center h-full bg-white md:bg-gray-50 pt-10 md:pt-0">
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
