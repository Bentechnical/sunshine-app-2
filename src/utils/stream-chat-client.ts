import { StreamChat } from 'stream-chat';

// Global client instance to prevent multiple connections
let globalClient: StreamChat | null = null;
let currentUserId: string | null = null;

// Activity tracking
let lastActivityTime = Date.now();
let inactivityTimer: NodeJS.Timeout | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let tokenCache: { [userId: string]: { token: string; expiresAt: number } } = {};
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const RECONNECT_DELAY = 500; // Reduced from 2000ms to 500ms
const TOKEN_CACHE_DURATION = 55 * 60 * 1000; // 55 minutes (tokens typically last 1 hour)
const QUICK_RECONNECT_DELAY = 100; // For tab switching

export class StreamChatClientManager {
  private static instance: StreamChatClientManager;
  private client: StreamChat | null = null;
  private currentUserId: string | null = null;
  private currentUserData: any = null; // Store user data for reconnection
  private isConnecting = false;
  private isDisconnecting = false;
  private connectionHealthCheck: NodeJS.Timeout | null = null;
  private lastDisconnectTime = 0;
  private isPageVisible = true;
  private disconnectCallbacks: Array<() => void> = [];

  private constructor() {
    this.setupActivityTracking();
    this.setupBrowserEvents();
  }

  static getInstance(): StreamChatClientManager {
    if (!StreamChatClientManager.instance) {
      StreamChatClientManager.instance = new StreamChatClientManager();
    }
    return StreamChatClientManager.instance;
  }

  // Register disconnect callback
  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  // Unregister disconnect callback
  offDisconnect(callback: () => void): void {
    const index = this.disconnectCallbacks.indexOf(callback);
    if (index > -1) {
      this.disconnectCallbacks.splice(index, 1);
    }
  }

  // Notify all disconnect callbacks
  private notifyDisconnect(): void {
    this.disconnectCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('[StreamChatManager] Error in disconnect callback:', error);
      }
    });
  }

  private setupActivityTracking() {
    if (typeof window === 'undefined') return;

    const updateActivity = () => {
      lastActivityTime = Date.now();
      this.resetInactivityTimer();
    };

    // Track user interactions
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      const wasVisible = this.isPageVisible;
      this.isPageVisible = !document.hidden;
      
      if (wasVisible && !this.isPageVisible) {
        // Page becoming hidden - quick disconnect
        console.log('[StreamChatManager] Page hidden, quick disconnect...');
        this.quickDisconnect().catch(error => {
          console.error('[StreamChatManager] Quick disconnect failed:', error);
        });
      } else if (!wasVisible && this.isPageVisible) {
        // Page becoming visible - quick reconnect
        console.log('[StreamChatManager] Page visible, quick reconnect...');
        this.quickReconnect();
      }
    });
  }

  private setupBrowserEvents() {
    if (typeof window === 'undefined') return;

    // More reliable than beforeunload
    window.addEventListener('pagehide', () => {
      console.log('[StreamChatManager] Page hiding, disconnecting...');
      this.disconnectUser();
    });

    // Handle online/offline events
    window.addEventListener('online', () => {
      console.log('[StreamChatManager] Network online, reconnecting...');
      this.reconnectIfNeeded();
    });

    window.addEventListener('offline', () => {
      console.log('[StreamChatManager] Network offline, disconnecting...');
      this.disconnectUser();
    });

    // Handle beforeunload as backup
    window.addEventListener('beforeunload', () => {
      this.disconnectUser();
    });
  }

  private resetInactivityTimer() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }

    inactivityTimer = setTimeout(() => {
      console.log('[StreamChatManager] User inactive for 5 minutes, disconnecting...');
      this.disconnectUser();
    }, INACTIVITY_TIMEOUT);
  }

  private startConnectionHealthCheck() {
    if (this.connectionHealthCheck) {
      clearInterval(this.connectionHealthCheck);
    }

    this.connectionHealthCheck = setInterval(() => {
      if (this.client && this.currentUserId) {
        // Check if connection is healthy by checking if userID exists
        if (!this.client.userID) {
          console.log('[StreamChatManager] Connection unhealthy, attempting reconnect...');
          this.reconnectIfNeeded();
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private stopConnectionHealthCheck() {
    if (this.connectionHealthCheck) {
      clearInterval(this.connectionHealthCheck);
      this.connectionHealthCheck = null;
    }
  }

  // Quick disconnect for tab switching (non-blocking)
  private async quickDisconnect(): Promise<void> {
    if (this.client && this.currentUserId && !this.isDisconnecting) {
      this.lastDisconnectTime = Date.now();
      this.isDisconnecting = true;
      
      try {
        // First, disconnect the user
        await this.client.disconnectUser();
        console.log('[StreamChatManager] Quick disconnect completed');
        
        // Then, completely destroy the client instance to clean up WebSocket
        if (this.client) {
          try {
            // Force close any remaining connections
            await this.client.disconnect();
          } catch (error) {
            console.warn('[StreamChatManager] Error during client disconnect:', error);
          }
        }
        
        // Notify components of disconnect
        this.notifyDisconnect();
        
        // Clear all references and create fresh client instance
        this.client = null;
        this.currentUserId = null;
        this.currentUserData = null;
        this.stopConnectionHealthCheck();
        
        console.log('[StreamChatManager] Client instance destroyed and cleaned up');
      } catch (error) {
        console.error('[StreamChatManager] Quick disconnect error:', error);
      } finally {
        this.isDisconnecting = false;
      }
    }
  }

  // Quick reconnect for tab switching (uses cached token if available)
  private quickReconnect(): void {
    if (!this.currentUserId || this.isConnecting) {
      return;
    }

    // Clear any existing reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    // Use longer delay to ensure WebSocket is fully closed
    const timeSinceDisconnect = Date.now() - this.lastDisconnectTime;
    const minDelay = Math.max(500, timeSinceDisconnect < 5000 ? 1000 : RECONNECT_DELAY);
    
    console.log(`[StreamChatManager] Scheduling reconnect in ${minDelay}ms (${timeSinceDisconnect}ms since disconnect)`);
    
    reconnectTimer = setTimeout(async () => {
      try {
        console.log('[StreamChatManager] Quick reconnecting...');
        
        // Try to use cached token first
        const cachedToken = this.getCachedToken(this.currentUserId!);
        if (cachedToken) {
          console.log('[StreamChatManager] Using cached token for quick reconnect');
          await this.connectUser(
            this.currentUserId!,
            cachedToken,
            this.currentUserData // Reuse stored user data
          );
          return;
        }

        // Fallback to fresh token
        await this.reconnectWithFreshToken();
      } catch (error) {
        console.error('[StreamChatManager] Quick reconnection failed:', error);
        // Fallback to full reconnection
        this.reconnectIfNeeded();
      } finally {
        reconnectTimer = null;
      }
    }, minDelay);
  }

  private getCachedToken(userId: string): string | null {
    const cached = tokenCache[userId];
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }
    // Clean up expired token
    delete tokenCache[userId];
    return null;
  }

  private cacheToken(userId: string, token: string): void {
    tokenCache[userId] = {
      token,
      expiresAt: Date.now() + TOKEN_CACHE_DURATION
    };
  }

  private async reconnectWithFreshToken(): Promise<void> {
    try {
      // Get fresh token
      const tokenResponse = await fetch('/api/chat/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get chat token for reconnection');
      }

      const { token } = await tokenResponse.json();
      
      // Cache the new token
      this.cacheToken(this.currentUserId!, token);

      // Use stored user data for reconnection, with fallback
      let userData = this.currentUserData;
      if (!userData) {
        console.warn('[StreamChatManager] No stored user data, using fallback');
        userData = {
          id: this.currentUserId!,
          name: 'User',
          image: undefined,
        };
      }

      // Ensure user data has required fields
      if (!userData.id) {
        userData.id = this.currentUserId!;
      }

      // Reconnect with fresh token and user data
      await this.connectUser(
        this.currentUserId!,
        token,
        userData
      );

      console.log('[StreamChatManager] Reconnection with fresh token successful');
    } catch (error) {
      console.error('[StreamChatManager] Reconnection with fresh token failed:', error);
      throw error;
    }
  }

  async connectUser(userId: string, userToken: string, userData: any): Promise<StreamChat> {
    // Prevent connection while disconnecting
    if (this.isDisconnecting) {
      console.log('[StreamChatManager] Cannot connect while disconnecting, waiting...');
      while (this.isDisconnecting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // If already connected to the same user, return existing client
    if (this.client && this.currentUserId === userId && this.client.userID) {
      console.log(`[StreamChatManager] Already connected to user: ${userId}`);
      this.resetInactivityTimer();
      return this.client;
    }

    // Wait for any ongoing disconnection to complete
    if (this.isDisconnecting) {
      console.log('[StreamChatManager] Waiting for disconnection to complete...');
      while (this.isDisconnecting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Disconnect from previous user if different
    if (this.client && this.currentUserId !== userId) {
      await this.disconnectUser();
    }

    // Prevent multiple simultaneous connection attempts, with a safety timeout to break stale waits
    if (this.isConnecting) {
      const waitStart = Date.now();
      console.log('[StreamChatManager] Connection already in progress, waiting...');
      while (this.isConnecting && Date.now() - waitStart < 15000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.client && this.currentUserId === userId && this.client.userID) {
        return this.client;
      }
      // If we waited too long, reset stale state to allow a fresh attempt
      if (this.isConnecting) {
        console.warn('[StreamChatManager] Previous connection attempt appears stuck. Resetting state.');
        this.isConnecting = false;
        try {
          if (this.client) {
            await this.client.disconnectUser();
            await this.client.disconnect();
          }
        } catch {
          // ignore
        }
        this.client = null;
        this.currentUserId = null;
        this.currentUserData = null;
      }
    }

    this.isConnecting = true;

    try {
      // Always create a fresh client instance to prevent WebSocket issues
      if (this.client) {
        console.log('[StreamChatManager] Destroying existing client instance');
        try {
          await this.client.disconnect();
        } catch (error) {
          console.warn('[StreamChatManager] Error disconnecting existing client:', error);
        }
      }
      
      // Create new client instance
      this.client = StreamChat.getInstance(process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY!);

      // Connect to new user with a single automatic retry on transient failures
      const attemptConnect = async (): Promise<void> => {
        await this.client!.connectUser(userData, userToken);
      };
      try {
        await attemptConnect();
      } catch (firstError) {
        console.warn('[StreamChatManager] Initial connect failed, retrying once...', firstError);
        // Small delay before retry
        await new Promise(resolve => setTimeout(resolve, 500));
        // Ensure socket fully closed
        try { await this.client!.disconnectUser(); await this.client!.disconnect(); } catch {}
        this.client = StreamChat.getInstance(process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY!);
        await attemptConnect();
      }
      this.currentUserId = userId;
      this.currentUserData = userData; // Store user data

      // Cache the token for future quick reconnections
      this.cacheToken(userId, userToken);

      console.log(`[StreamChatManager] Connected user: ${userId}`);
      
      // Start activity tracking and health monitoring
      this.resetInactivityTimer();
      this.startConnectionHealthCheck();

      return this.client;
    } catch (error) {
      console.error('[StreamChatManager] Connection error:', error);
      this.client = null;
      this.currentUserId = null;
      this.currentUserData = null; // Clear stored user data on error
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnectUser(): Promise<void> {
    if (this.client && !this.isDisconnecting) {
      this.isDisconnecting = true;
      
      try {
        // First, disconnect the user
        await this.client.disconnectUser();
        console.log(`[StreamChatManager] Disconnected user: ${this.currentUserId}`);
        
        // Then, completely destroy the client instance to clean up WebSocket
        if (this.client) {
          try {
            // Force close any remaining connections
            await this.client.disconnect();
            console.log('[StreamChatManager] Client instance destroyed');
          } catch (error) {
            console.warn('[StreamChatManager] Error during client disconnect:', error);
          }
        }
      } catch (error) {
        console.error('[StreamChatManager] Error disconnecting user:', error);
      } finally {
        this.client = null;
        this.currentUserId = null;
        this.currentUserData = null; // Clear stored user data on disconnect
        this.stopConnectionHealthCheck();
        this.isDisconnecting = false;
        
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }

        // Notify all disconnect callbacks
        this.notifyDisconnect();
      }
    }
  }

  async reconnectIfNeeded(): Promise<void> {
    if (!this.currentUserId || this.isConnecting) {
      return;
    }

    // Clear any existing reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    // Add delay to prevent rapid reconnection attempts
    reconnectTimer = setTimeout(async () => {
      try {
        console.log('[StreamChatManager] Attempting to reconnect...');
        await this.reconnectWithFreshToken();
        console.log('[StreamChatManager] Reconnection successful');
      } catch (error) {
        console.error('[StreamChatManager] Reconnection failed:', error);
      } finally {
        reconnectTimer = null;
      }
    }, RECONNECT_DELAY);
  }

  getClient(): StreamChat | null {
    return this.client;
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  isConnected(): boolean {
    return this.client !== null && 
           this.currentUserId !== null && 
           this.client.userID !== undefined &&
           !this.isDisconnecting;
  }

  getConnectionState(): string {
    if (!this.client || this.isDisconnecting) return 'disconnected';
    if (!this.client.userID) return 'disconnected';
    return 'connected';
  }

  getLastActivityTime(): number {
    return lastActivityTime;
  }

  // Force activity update (useful for manual activity tracking)
  updateActivity(): void {
    lastActivityTime = Date.now();
    this.resetInactivityTimer();
  }

  // Clear cached tokens (useful for testing or token refresh)
  clearTokenCache(): void {
    tokenCache = {};
  }

  // Check if client is in a valid state for operations
  isClientReady(): boolean {
    return this.isConnected() && !this.isDisconnecting && !this.isConnecting;
  }

  // Force refresh connection (useful for troubleshooting)
  async forceRefreshConnection(): Promise<void> {
    console.log('[StreamChatManager] Force refreshing connection...');
    
    // Clear any existing timers
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
    
    // Disconnect current client
    if (this.client) {
      await this.disconnectUser();
    }
    
    // Clear cached data
    this.clearTokenCache();
    
    console.log('[StreamChatManager] Connection refreshed, ready for new connection');
  }
}

// Export singleton instance
export const streamChatManager = StreamChatClientManager.getInstance();

// Cleanup function for app shutdown
export const cleanupStreamChat = async (): Promise<void> => {
  await streamChatManager.disconnectUser();
};

// Handle page unload to ensure cleanup
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    streamChatManager.disconnectUser();
  });
} 