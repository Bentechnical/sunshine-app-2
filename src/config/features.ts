// src/config/features.ts
// Flags for features that are built but switched off.
//
// Preferred over commenting code out or deleting it: the code keeps compiling, keeps being
// type-checked, and keeps showing up in refactors, so it doesn't rot while it's dormant. Turning
// a feature back on is a one-line change rather than an archaeology exercise.

/**
 * Stream Chat — volunteer↔individual messaging, admin chat monitoring, and the unread-count
 * machinery behind the nav badges.
 *
 * Switched **off** 24 Oct 2026. The feature is frozen (see CLAUDE.md "Deprecated and frozen") and
 * unreachable in the product, but it was still booting on every dashboard load: a Stream token
 * request plus a channel query, measured at ~1.7s of round trips on a slow connection, for
 * something nobody can use.
 *
 * With this false:
 *   * `UnreadCountProvider` still renders and still supplies a context value, so every
 *     `useUnreadCount()` consumer keeps working — it just never connects or fetches. Removing the
 *     provider instead would throw in `MessagingTab` and `useNavNotifications`.
 *   * The admin "Chat Management" tab is hidden from the nav.
 *   * `useAdminUnreadCount` skips its fetch.
 *
 * To re-enable: set this to true. Nothing else needs changing. Expect the chat tables
 * (`appointment_chats`, `chat_logs`, `message_read_status`) and the Stream account to still be
 * there — they were never torn down.
 */
export const CHAT_ENABLED = false;
