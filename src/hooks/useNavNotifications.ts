import { useUnreadCount } from '@/contexts/UnreadCountContext';

export function useNavNotifications(activeTab?: string) {
  const { hasUnreadMessages, loading, connectionStatus } = useUnreadCount();

  // Clear notification when user is viewing messages
  const effectiveHasUnread = activeTab === 'messaging' ? false : hasUnreadMessages;

  // Enhanced logging to track flag state
  console.log('[NavNotifications] State check:', {
    activeTab,
    hasUnreadMessages,
    effectiveHasUnread,
    willShowFlag: effectiveHasUnread
  });

  if (effectiveHasUnread !== hasUnreadMessages) {
    console.log('[NavNotifications] Flag suppressed on messaging tab:', { activeTab, hasUnreadMessages });
  }

  return {
    hasUnreadMessages: effectiveHasUnread,
    loading,
    connectionStatus
  };
}