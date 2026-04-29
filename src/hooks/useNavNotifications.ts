import { usePathname } from 'next/navigation';
import { useUnreadCount } from '@/contexts/UnreadCountContext';

export function useNavNotifications() {
  const { hasUnreadMessages, loading, connectionStatus } = useUnreadCount();
  const pathname = usePathname();

  // Clear notification when user is viewing messages
  const effectiveHasUnread = pathname.startsWith('/dashboard/messages') ? false : hasUnreadMessages;

  return {
    hasUnreadMessages: effectiveHasUnread,
    loading,
    connectionStatus,
  };
}