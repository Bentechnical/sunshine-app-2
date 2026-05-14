import { useState, useEffect, useCallback, useRef } from 'react';

export function useAdminUnreadCount(activeTab?: string, refreshTrigger?: number, enabled = true) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/admin/unread-counts');

      if (!res.ok) {
        if (res.status === 403) {
          setUnreadCount(0);
          setError(null);
          return;
        }
        throw new Error('Failed to fetch unread count');
      }

      const data = await res.json();
      setUnreadCount(data.total ?? 0);
    } catch (err) {
      console.error('[useAdminUnreadCount] Error fetching unread count:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up polling only once
  useEffect(() => {
    // Initial fetch
    fetchUnreadCount();

    // Set up polling to check for new unread messages every 30 seconds
    intervalRef.current = setInterval(() => {
      fetchUnreadCount();
    }, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []); // Empty dependency array - only run once

  // Manual refresh when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchUnreadCount();
    }
  }, [refreshTrigger, fetchUnreadCount]);

  // Clear unread count when admin is viewing chats (they're "reading" the messages)
  const effectiveUnreadCount = activeTab === 'chats' ? 0 : unreadCount;

  return { unreadCount: effectiveUnreadCount, loading, error, refresh: fetchUnreadCount };
} 