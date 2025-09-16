import { useUnreadCount } from '@/contexts/UnreadCountContext';

export function useNavNotifications(activeTab?: string) {
  const { hasUnreadMessages, loading, connectionStatus } = useUnreadCount();

  // Clear notification when user is viewing messages
  const effectiveHasUnread = activeTab === 'messaging' ? false : hasUnreadMessages;

  console.log('[NavNotifications] 📊 Using shared state:', {
    activeTab,
    connectionStatus,
    hasUnreadMessages,
    effectiveHasUnread,
    loading,
    timestamp: new Date().toISOString()
  });

  return {
    hasUnreadMessages: effectiveHasUnread,
    loading,
    connectionStatus
  };
}