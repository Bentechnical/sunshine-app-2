import { formatEmailDateTime } from './dateUtils';

/**
 * Formats a date for email templates in a human-readable format
 * Example: "Tuesday, September 12th at 1:00 PM"
 *
 * @deprecated Use formatEmailDateTime from dateUtils.ts instead
 * This function is replaced by the new timezone-aware implementation
 */
export function formatAppointmentTime(date: Date): string {
  // Delegate to the new timezone-aware function
  return formatEmailDateTime(date);
}

/**
 * Gets the ordinal suffix for a number (st, nd, rd, th)
 */
function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) {
    return 'th';
  }

  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}