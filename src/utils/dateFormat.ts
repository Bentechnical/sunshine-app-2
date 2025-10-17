/**
 * Formats a date for email templates in a human-readable format
 * Example: "Tuesday, September 12th at 1:00 PM"
 */
export function formatAppointmentTime(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  // Format the base date
  const formatted = date.toLocaleDateString('en-US', options);

  // Add ordinal suffix to day (1st, 2nd, 3rd, 4th, etc.)
  const day = date.getDate();
  const ordinalSuffix = getOrdinalSuffix(day);

  // Replace the day number with day + ordinal suffix
  const withOrdinal = formatted.replace(
    new RegExp(`\\b${day}\\b`),
    `${day}${ordinalSuffix}`
  );

  // Replace "at" formatting for cleaner output
  return withOrdinal.replace(/, (\d)/, ' at $1');
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