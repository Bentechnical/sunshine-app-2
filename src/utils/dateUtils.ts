/**
 * Centralized date utilities using date-fns for consistent timezone handling
 * This replaces all manual timezone math and native Date methods
 */

import {
  format,
  parse,
  parseISO,
  isToday,
  isTomorrow,
  isYesterday,
  addDays,
  addHours,
  startOfDay,
  endOfDay,
  isAfter,
  isBefore
} from 'date-fns';
import { fromZonedTime, toZonedTime, format as formatTz } from 'date-fns-tz';

// Eastern Time timezone identifier
const EASTERN_TIMEZONE = 'America/New_York';

// Common date format patterns
export const DATE_FORMATS = {
  DISPLAY_DATE: 'EEEE, MMMM do', // "Monday, January 1st"
  DISPLAY_DATE_TIME: 'EEEE, MMMM do \'at\' h:mm a', // "Monday, January 1st at 3:00 PM"
  DISPLAY_TIME: 'h:mm a', // "3:00 PM"
  SHORT_DATE: 'MMM d', // "Jan 1"
  SHORT_DATE_TIME: 'MMM d \'at\' h:mm a', // "Jan 1 at 3:00 PM"
  WEEKDAY_SHORT: 'EEE', // "Mon"
  ISO_DATE: 'yyyy-MM-dd', // "2025-01-01"
  TIME_INPUT: 'h:mm a', // For parsing user input like "3:00 PM"
  TIME_INPUT_SHORT: 'ha', // For parsing user input like "3pm"
} as const;

/**
 * Parse user time input (like "3pm", "3:30 PM") for a specific date
 * Uses proper Eastern Time conversion for the specific date
 */
export function parseUserTimeInput(timeInput: string, targetDate: Date): Date | null {
  try {
    const dateStr = format(targetDate, DATE_FORMATS.ISO_DATE);

    // Try different time formats the user might enter
    const timeFormats = [
      'h a',        // "3 PM"
      'h:mm a',     // "3:30 PM"
      'ha',         // "3pm"
      'h:mma',      // "3:30pm"
      'H',          // "15" (24-hour)
      'H:mm',       // "15:30" (24-hour)
    ];

    for (const timeFormat of timeFormats) {
      try {
        // Parse the time in the context of the target date
        const parsedDate = parse(`${dateStr} ${timeInput.trim()}`, `${DATE_FORMATS.ISO_DATE} ${timeFormat}`, new Date());

        // Validate the result is a valid date
        if (isNaN(parsedDate.getTime())) continue;

        // Extract the time and use createAvailabilityDateTime for proper timezone handling
        const hours = parsedDate.getHours();
        const minutes = parsedDate.getMinutes();
        const utcDate = createAvailabilityDateTime(targetDate, `${hours}:${minutes}`);

        console.log(`[PROPER TIMEZONE] User input: ${timeInput} on ${dateStr}`);
        console.log(`[PROPER TIMEZONE] Converted to UTC: ${utcDate.toISOString()}`);

        return utcDate;
      } catch {
        continue; // Try next format
      }
    }

    return null; // No format matched
  } catch {
    return null;
  }
}

/**
 * @deprecated Use functions from @/utils/timeZone instead
 * Format appointment date/time for display
 * Uses proper Eastern Time for the specific date
 */
export function formatAppointmentDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatTz(dateObj, DATE_FORMATS.DISPLAY_DATE_TIME, { timeZone: EASTERN_TIMEZONE });
}

/**
 * @deprecated Use functions from @/utils/timeZone instead
 * Format just the time portion (Eastern Time)
 */
export function formatAppointmentTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatUTCAsEasternTime(dateObj);
}

/**
 * @deprecated Use functions from @/utils/timeZone instead
 * Format just the date portion
 */
export function formatAppointmentDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;

  // Convert to Eastern Time for proper date calculations
  const easternDate = toZonedTime(dateObj, EASTERN_TIMEZONE);

  if (isToday(easternDate)) return `Today, ${formatTz(dateObj, 'MMMM do', { timeZone: EASTERN_TIMEZONE })}`;
  if (isTomorrow(easternDate)) return `Tomorrow, ${formatTz(dateObj, 'MMMM do', { timeZone: EASTERN_TIMEZONE })}`;
  if (isYesterday(easternDate)) return `Yesterday, ${formatTz(dateObj, 'MMMM do', { timeZone: EASTERN_TIMEZONE })}`;

  return formatTz(dateObj, DATE_FORMATS.DISPLAY_DATE, { timeZone: EASTERN_TIMEZONE });
}

/**
 * @deprecated Use functions from @/utils/timeZone instead
 * Format for chat messages and short displays
 */
export function formatShortDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatTz(dateObj, DATE_FORMATS.SHORT_DATE_TIME, { timeZone: EASTERN_TIMEZONE });
}

/**
 * @deprecated Use functions from @/utils/timeZone instead
 * Format for admin and technical displays
 */
export function formatFullDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatTz(dateObj, 'PPpp', { timeZone: EASTERN_TIMEZONE }); // "Jan 1, 2025 at 3:00 PM"
}

/**
 * Check if an appointment is in the past
 */
export function isAppointmentPast(endTime: Date | string): boolean {
  const endDate = typeof endTime === 'string' ? parseISO(endTime) : endTime;
  return isBefore(endDate, new Date());
}

/**
 * Check if an appointment is coming up soon (within 24 hours)
 */
export function isAppointmentSoon(startTime: Date | string): boolean {
  const startDate = typeof startTime === 'string' ? parseISO(startTime) : startTime;
  const now = new Date();
  const tomorrow = addDays(now, 1);
  return isAfter(startDate, now) && isBefore(startDate, tomorrow);
}

/**
 * Calculate appointment duration in a human-readable format
 */
export function getAppointmentDuration(startTime: Date | string, endTime: Date | string): string {
  const start = typeof startTime === 'string' ? parseISO(startTime) : startTime;
  const end = typeof endTime === 'string' ? parseISO(endTime) : endTime;

  const durationMs = end.getTime() - start.getTime();
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
}

/**
 * Format for email templates (with ordinal suffixes)
 * Replaces the existing formatAppointmentTime in dateFormat.ts
 */
export function formatEmailDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatTz(dateObj, 'EEEE, MMMM do \'at\' h:mm a', { timeZone: EASTERN_TIMEZONE });
}

/**
 * Safe date parsing from ISO strings
 */
export function safeParseISO(dateString: string): Date | null {
  try {
    const date = parseISO(dateString);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Create availability time slots for database storage
 * Uses proper Eastern Time (EST/EDT) conversion for each individual date
 * This ensures 10am is always 10am local time, but stored correctly for DST
 */
export function createAvailabilityDateTime(appointmentDate: Date, timeString: string): Date {
  // Parse time components
  const [hours, minutes] = timeString.split(':').map(Number);

  // Create a local date object with the target date and time
  const year = appointmentDate.getFullYear();
  const month = appointmentDate.getMonth();
  const day = appointmentDate.getDate();

  // Create a timezone-naive date string for Eastern Time
  const easternDateTimeString = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

  // Convert from Eastern Time to UTC using the proper timezone for this specific date
  // This automatically handles EDT vs EST based on the actual date
  const utcDate = fromZonedTime(easternDateTimeString, EASTERN_TIMEZONE);

  // console.log(`[PROPER TIMEZONE] Input: ${timeString} on ${appointmentDate.toDateString()}`);
  // console.log(`[PROPER TIMEZONE] Eastern Time String: ${easternDateTimeString}`);
  // console.log(`[PROPER TIMEZONE] UTC Result: ${utcDate.toISOString()}`);

  return utcDate;
}

/**
 * Format times from UTC to proper Eastern Time display
 * Uses date-fns-tz to properly handle EST/EDT for the specific date
 */
function formatUTCAsEasternTime(utcTime: Date): string {
  // Convert UTC to proper Eastern Time for this specific date
  return formatTz(utcTime, DATE_FORMATS.DISPLAY_TIME, { timeZone: EASTERN_TIMEZONE });
}

/**
 * Create a date range string for availability slots
 * Forces Eastern Time display regardless of browser timezone
 */
export function formatAvailabilitySlot(startTime: Date | string, endTime: Date | string): string {
  const start = typeof startTime === 'string' ? parseISO(startTime) : startTime;
  const end = typeof endTime === 'string' ? parseISO(endTime) : endTime;

  const startFormatted = formatUTCAsEasternTime(start);
  const endFormatted = formatUTCAsEasternTime(end);

  console.log(`[TIMEZONE] UTC: ${start.toISOString()} → Eastern: ${startFormatted}`);

  return `${startFormatted} – ${endFormatted}`;
}