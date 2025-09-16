import { useUnreadCount } from '@/contexts/UnreadCountContext';

export function useNavNotifications(activeTab?: string) {
  const { hasUnreadMessages, loading, connectionStatus } = useUnreadCount();

  // Clear notification when user is viewing messages
  const effectiveHasUnread = activeTab === 'messaging' ? false : hasUnreadMessages;


  return {
    hasUnreadMessages: effectiveHasUnread,
    loading,
    connectionStatus
  };
}