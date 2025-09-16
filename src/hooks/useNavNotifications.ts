import { useUnreadCount } from '@/contexts/UnreadCountContext';

export function useNavNotifications(activeTab?: string) {
  const { hasUnreadMessages, loading, connectionStatus } = useUnreadCount();

  // Clear notification when user is viewing messages
  const effectiveHasUnread = activeTab === 'messaging' ? false : hasUnreadMessages;

  console.log('[NavNotifications] 🚨 DETAILED STATE CHECK:', {
    activeTab,
    connectionStatus,
    hasUnreadMessages,
    effectiveHasUnread,
    loading,
    'will show red flag': effectiveHasUnread,
    'calculation': `${hasUnreadMessages} && ${activeTab} !== 'messaging' = ${effectiveHasUnread}`,
    timestamp: new Date().toISOString()
  });

  // Extra debugging for flag visibility
  if (effectiveHasUnread !== hasUnreadMessages) {
    console.log('[NavNotifications] 🔄 FLAG SUPPRESSED because activeTab is messaging:', {
      activeTab,
      originalValue: hasUnreadMessages,
      suppressedValue: effectiveHasUnread
    });
  }

  return {
    hasUnreadMessages: effectiveHasUnread,
    loading,
    connectionStatus
  };
}