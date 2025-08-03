import { useState, useEffect, useCallback, useRef } from 'react';

export function useAdminUnreadCount(activeTab?: string, refreshTrigger?: number) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    console.log('[useAdminUnreadCount] Fetching admin unread count...');
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/admin/chats');
      
      if (!response.ok) {
        if (response.status === 403) {
          // User is not authorized to access admin endpoints - return 0 unread count
          console.log('[useAdminUnreadCount] 403 error - user not authorized, returning 0');
          setUnreadCount(0);
          setError(null);
          return;
        }
        throw new Error('Failed to fetch unread count');
      }
      
      const data = await response.json();
      
      // Calculate total unread count from all chats
      const totalUnread = data.chats?.reduce((sum: number, chat: any) => {
        return sum + (chat.unread_count || 0);
      }, 0) || 0;
      
      console.log('[useAdminUnreadCount] Successfully fetched unread count:', totalUnread);
      setUnreadCount(totalUnread);
    } catch (err) {
      console.error('[useAdminUnreadCount] Error fetching unread count:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Fallback to 0 if there's an error
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up polling only once
  useEffect(() => {
    console.log('[useAdminUnreadCount] Setting up polling...');
    
    // Initial fetch
    fetchUnreadCount();

    // Set up polling to check for new unread messages every 15 seconds
    intervalRef.current = setInterval(() => {
      console.log('[useAdminUnreadCount] Polling interval triggered');
      fetchUnreadCount();
    }, 15000);

    return () => {
      console.log('[useAdminUnreadCount] Cleaning up polling interval');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []); // Empty dependency array - only run once

  // Manual refresh when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      console.log('[useAdminUnreadCount] Manual refresh triggered');
      fetchUnreadCount();
    }
  }, [refreshTrigger, fetchUnreadCount]);

  // Clear unread count when admin is viewing chats (they're "reading" the messages)
  const effectiveUnreadCount = activeTab === 'chats' ? 0 : unreadCount;

  return { unreadCount: effectiveUnreadCount, loading, error, refresh: fetchUnreadCount };
} 