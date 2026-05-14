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

/** Returns end-time options strictly after the given start time value */
export function endTimeOptions(startTime: string, stepMinutes: 15 | 30 = 15): TimeOption[] {
  return buildTimeOptions(stepMinutes).filter(o => o.value > startTime);
}
