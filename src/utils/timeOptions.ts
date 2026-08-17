// Shared time option generator used across appointment and visit forms.

export interface TimeOption {
  value: string; // "HH:MM" 24-hour
  label: string; // "7:00 AM"
}

/**
 * Generates time options from startHour to endHour (inclusive),
 * at the given step interval in minutes (15 or 30).
 */
export function buildTimeOptions(
  stepMinutes: 15 | 30 = 30,
  startHour = 7,
  endHour = 21
): TimeOption[] {
  const options: TimeOption[] = [];
  const steps = 60 / stepMinutes;
  for (let h = startHour; h <= endHour; h++) {
    for (let s = 0; s < steps; s++) {
      const m = s * stepMinutes;
      if (h === endHour && m > 0) break;
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      const label = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      options.push({ value, label });
    }
  }
  return options;
}

/** 30-min options for appointment scheduling (7 AM – 9 PM) */
export const APPOINTMENT_TIME_OPTIONS = buildTimeOptions(30);

/** 15-min options for visit scheduling (7 AM – 9 PM) */
export const VISIT_TIME_OPTIONS = buildTimeOptions(15);

/** Returns end-time options for visits: exactly 60 and 75 minutes after the given start time */
export function endTimeOptions(startTime: string): TimeOption[] {
  if (!startTime) return [];
  const [h, m] = startTime.split(':').map(Number);
  const startMinutes = h * 60 + m;
  return [60, 75].map(offset => {
    const total = startMinutes + offset;
    const eh = Math.floor(total / 60);
    const em = total % 60;
    if (eh > 21) return null; // outside range
    const hour12 = eh % 12 === 0 ? 12 : eh % 12;
    const ampm = eh < 12 ? 'AM' : 'PM';
    const label = `${hour12}:${String(em).padStart(2, '0')} ${ampm}`;
    const value = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
    return { value, label };
  }).filter(Boolean) as TimeOption[];
}

/** Duration options for visit creation: 30 min – 4 hours in 15-min steps */
export const VISIT_DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hr' },
  { value: 75, label: '1 hr 15 min' },
  { value: 90, label: '1 hr 30 min' },
  { value: 105, label: '1 hr 45 min' },
  { value: 120, label: '2 hrs' },
  { value: 150, label: '2 hrs 30 min' },
  { value: 180, label: '3 hrs' },
  { value: 210, label: '3 hrs 30 min' },
  { value: 240, label: '4 hrs' },
];

/** Computes end time (HH:MM) from a start time (HH:MM) and duration in minutes. Returns '' if invalid. */
export function computeEndTime(startTime: string, durationMinutes: number): string {
  if (!startTime || !durationMinutes) return '';
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + durationMinutes;
  const eh = Math.floor(total / 60);
  const em = total % 60;
  if (eh > 23) return '';
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

/** Formats an HH:MM value as a human-readable time (e.g. "2:30 PM") */
export function formatTime(value: string): string {
  if (!value) return '';
  const [h, m] = value.split(':').map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}
