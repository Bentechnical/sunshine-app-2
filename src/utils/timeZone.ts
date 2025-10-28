/**
 * Centralized timezone utility for the Sunshine App
 *
 * All appointments are in Eastern Time (America/New_York) regardless of user's browser timezone.
 * This utility provides consistent time display and parsing across the entire application.
 *
 * IMPORTANT: All functions ignore browser timezone completely.
 */

import { format as formatTz, toZonedTime } from 'date-fns-tz';
import { parseISO } from 'date-fns';

// Eastern Time timezone identifier - handles both EST/EDT automatically
const EASTERN_TIMEZONE = 'America/New_York';

/**
 * Convert a Date or ISO string to Eastern Time
 * This properly handles UTC to Eastern Time conversion
 */
function toEasternTime(date: Date | string): Date {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return toZonedTime(dateObj, EASTERN_TIMEZONE);
}

/**
 * Format appointment date - "Today, January 1st" or "Monday, January 1st"
 */
export function formatAppointmentDate(date: Date | string): string {
  const easternDate = toEasternTime(date);
  return formatTz(easternDate, 'EEEE, MMMM do', { timeZone: EASTERN_TIMEZONE });
}

/**
 * Format appointment time - "3:00 PM"
 */
export function formatAppointmentTime(date: Date | string): string {
  const easternDate = toEasternTime(date);
  return formatTz(easternDate, 'h:mm a', { timeZone: EASTERN_TIMEZONE });
}

/**
 * Format appointment date and time - "Monday, January 1st at 3:00 PM"
 */
export function formatAppointmentDateTime(date: Date | string): string {
  const easternDate = toEasternTime(date);
  return formatTz(easternDate, 'EEEE, MMMM do \'at\' h:mm a', { timeZone: EASTERN_TIMEZONE });
}

/**
 * Format short date - "Jan 1"
 */
export function formatShortDate(date: Date | string): string {
  const easternDate = toEasternTime(date);
  return formatTz(easternDate, 'MMM d', { timeZone: EASTERN_TIMEZONE });
}

/**
 * Format short date and time - "Jan 1 at 3:00 PM"
 */
export function formatShortDateTime(date: Date | string): string {
  const easternDate = toEasternTime(date);
  return formatTz(easternDate, 'MMM d \'at\' h:mm a', { timeZone: EASTERN_TIMEZONE });
}

/**
 * Format for appointment cards (replaces toLocaleDateString calls)
 * Returns format like "Mon, Jan 1"
 */
export function formatCardDate(date: Date | string): string {
  const easternDate = toEasternTime(date);
  return formatTz(easternDate, 'EEE, MMM d', { timeZone: EASTERN_TIMEZONE });
}

/**
 * Format for appointment cards (replaces toLocaleTimeString calls)
 * Returns format like "3:00 PM"
 */
export function formatCardTime(date: Date | string): string {
  const easternDate = toEasternTime(date);
  return formatTz(easternDate, 'h:mm a', { timeZone: EASTERN_TIMEZONE });
}

/**
 * Format for dashboard cards (replaces toLocaleDateString/toLocaleTimeString)
 * Returns both date and time formatted for dashboard display
 */
export function formatDashboardDate(date: Date | string): string {
  const easternDate = toEasternTime(date);
  return formatTz(easternDate, 'EEE, MMM d', { timeZone: EASTERN_TIMEZONE });
}

export function formatDashboardTime(date: Date | string): string {
  const easternDate = toEasternTime(date);
  return formatTz(easternDate, 'h:mm a', { timeZone: EASTERN_TIMEZONE });
}

/**
 * Format for email templates with ordinal suffixes
 * Returns format like "Monday, January 1st at 3:00 PM"
 */
export function formatEmailDateTime(date: Date | string): string {
  const easternDate = toEasternTime(date);
  return formatTz(easternDate, 'EEEE, MMMM do \'at\' h:mm a', { timeZone: EASTERN_TIMEZONE });
}

/**
 * Format time range for availability slots
 * Returns format like "3:00 PM – 4:00 PM"
 */
export function formatTimeRange(startTime: Date | string, endTime: Date | string): string {
  const startEastern = toEasternTime(startTime);
  const endEastern = toEasternTime(endTime);

  const startFormatted = formatTz(startEastern, 'h:mm a', { timeZone: EASTERN_TIMEZONE });
  const endFormatted = formatTz(endEastern, 'h:mm a', { timeZone: EASTERN_TIMEZONE });

  return `${startFormatted} – ${endFormatted}`;
}

/**
 * Check if an appointment date is in the past (Eastern Time)
 */
export function isAppointmentPast(endTime: Date | string): boolean {
  const endDate = typeof endTime === 'string' ? parseISO(endTime) : endTime;
  const now = new Date();
  return endDate.getTime() < now.getTime();
}

// Re-export timezone constant and timezone conversion function for other utilities
export { EASTERN_TIMEZONE, toEasternTime };