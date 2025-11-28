/**
 * Configuration for email notification system
 */

// Delay before sending email notification for unread messages (in hours)
export const EMAIL_NOTIFICATION_DELAY_HOURS = 1;

// Convert to milliseconds for easier use in code
export const EMAIL_NOTIFICATION_DELAY_MS = EMAIL_NOTIFICATION_DELAY_HOURS * 60 * 60 * 1000;
