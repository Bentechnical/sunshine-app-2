'use client';

import { useEffect, useState, useRef } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { Plus, Trash2, Clock, Calendar, CheckCircle, AlertCircle, Circle, History } from 'lucide-react';
import { format, isToday, isTomorrow, isYesterday } from 'date-fns';
import { createAvailabilityDateTime } from '@/utils/dateUtils';
import { formatTimeRange, toEasternTime } from '@/utils/timeZone';
import CustomTimePicker from './CustomTimePicker';
import { RRule } from 'rrule';
import { v4 as uuidv4 } from 'uuid';

interface TimeRange {
  id: string;
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
}

interface DayAvailability {
  day: string;
  dayIndex: number;
  enabled: boolean;
  timeRanges: TimeRange[];
}

interface TemplateStyleAvailabilityProps {
  userId: string;
}

type TabType = 'template' | 'slots';

const RECURRING_WEEKS = 12; // Generate 12 weeks of recurring slots

const DAYS = [
  { name: 'Monday', short: 'Mon', index: 1 },
  { name: 'Tuesday', short: 'Tue', index: 2 },
  { name: 'Wednesday', short: 'Wed', index: 3 },
  { name: 'Thursday', short: 'Thu', index: 4 },
  { name: 'Friday', short: 'Fri', index: 5 },
  { name: 'Saturday', short: 'Sat', index: 6 },
  { name: 'Sunday', short: 'Sun', index: 0 },
];

export default function TemplateStyleAvailability({ userId }: TemplateStyleAvailabilityProps) {
  const supabase = useSupabaseClient();
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('template');
  const [availabilitySlots, setAvailabilitySlots] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [hasConflicts, setHasConflicts] = useState(false);
  const saveMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize availability structure
  useEffect(() => {
    const initAvailability = DAYS.map(day => ({
      day: day.name,
      dayIndex: day.index,
      enabled: false,
      timeRanges: []
    }));
    setAvailability(initAvailability);
    loadExistingAvailability();
    loadAllAvailabilitySlots();
  }, [userId]); // loadExistingAvailability and loadAllAvailabilitySlots are stable async functions

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveMessageTimeoutRef.current) {
        clearTimeout(saveMessageTimeoutRef.current);
      }
    };
  }, []);

  // Load all availability slots for the slots tab
  const loadAllAvailabilitySlots = async () => {
    try {
      // Get start of current week (Monday) to show entire week context
      const now = new Date();
      const currentWeekStart = new Date(now);
      const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday is 6 days from Monday
      currentWeekStart.setDate(now.getDate() - daysFromMonday);
      currentWeekStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('appointment_availability')
        .select('*')
        .eq('volunteer_id', userId)
        .gte('start_time', currentWeekStart.toISOString()) // From start of current week
        .order('start_time');

      if (error) {
        console.error('Error loading availability slots:', error);
        return;
      }

      // Get appointment status for each slot
      const slots = data || [];
      if (slots.length > 0) {
        const slotIds = slots.map(slot => slot.id);
        const { data: appointments, error: aptError } = await supabase
          .from('appointments')
          .select('availability_id, status')
          .eq('volunteer_id', userId)
          .in('availability_id', slotIds)
          .in('status', ['pending', 'confirmed']);

        if (aptError) {
          console.error('Error loading appointment statuses:', aptError);
        } else {
          // Add status to each slot
          const appointmentMap = new Map(
            (appointments || []).map(apt => [apt.availability_id, apt.status])
          );

          const slotsWithStatus = slots.map(slot => {
            const slotStart = new Date(slot.start_time);
            const isPast = slotStart < now;
            return {
              ...slot,
              appointmentStatus: appointmentMap.get(slot.id) || 'available',
              isPast: isPast
            };
          });

          setAvailabilitySlots(slotsWithStatus);
          return;
        }
      }

      // Add isPast flag even when no appointments
      const slotsWithPastFlag = slots.map(slot => {
        const slotStart = new Date(slot.start_time);
        const isPast = slotStart < now;
        return {
          ...slot,
          appointmentStatus: 'available',
          isPast: isPast
        };
      });

      setAvailabilitySlots(slotsWithPastFlag);
    } catch (error) {
      console.error('Error loading availability slots:', error);
    }
  };

  // Load existing availability from database (recurring slots)
  const loadExistingAvailability = async () => {
    try {
      // Get one example of each recurring pattern by grouping by recurrence_id
      // This ensures we only get the template pattern, not all 12 weeks of instances
      // Exclude slots that have appointments to avoid showing "cleared" availability
      const { data, error } = await supabase
        .from('appointment_availability')
        .select(`
          *,
          appointments!left (
            id,
            status
          )
        `)
        .eq('volunteer_id', userId)
        .not('recurrence_id', 'is', null) // Only load recurring slots
        .gte('start_time', new Date().toISOString()) // Only load future slots
        .order('start_time')
        .limit(100); // Get more to ensure we capture all patterns

      if (error) {
        console.error('Error loading availability:', error);
        return;
      }

      if (!data || data.length === 0) {
        return;
      }

      // Filter out slots that have appointments (these are protected and shouldn't show in template)
      const availableSlots = data.filter(slot => {
        const hasAppointments = slot.appointments && slot.appointments.length > 0;
        return !hasAppointments;
      });

      // Group by recurrence_id to get unique patterns, then take earliest occurrence of each
      const recurrenceGroups = new Map<string, any>();

      availableSlots.forEach(slot => {
        const recurrenceId = slot.recurrence_id;

        if (!recurrenceGroups.has(recurrenceId)) {
          recurrenceGroups.set(recurrenceId, slot);
        } else {
          // Keep the earliest occurrence for each pattern
          const existing = recurrenceGroups.get(recurrenceId);
          if (new Date(slot.start_time) < new Date(existing.start_time)) {
            recurrenceGroups.set(recurrenceId, slot);
          }
        }
      });

      const uniquePatterns = Array.from(recurrenceGroups.values());

      // Group by day of week and deduplicate time ranges
      const groupedByDay: { [key: number]: Set<string> } = {};

      uniquePatterns.forEach(slot => {
        const startDate = new Date(slot.start_time);
        const endDate = new Date(slot.end_time);

        // Skip invalid dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          console.warn('Invalid date found in slot:', slot);
          return;
        }

        const dayOfWeek = startDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

        // Convert UTC database times back to Eastern Time for template display
        // Use our centralized timezone utility to ensure consistency
        const easternStartTime = toEasternTime(startDate);
        const easternEndTime = toEasternTime(endDate);

        // Format as HH:MM for template (24-hour format)
        // Since toEasternTime already converted to proper timezone, just format directly
        const startTime = easternStartTime.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit'
        });

        const endTime = easternEndTime.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit'
        });

        // Skip invalid time ranges
        if (!startTime || !endTime || startTime === 'NaN:Na' || endTime === 'NaN:Na') {
          return;
        }

        const timeRangeKey = `${startTime}-${endTime}`;

        if (!groupedByDay[dayOfWeek]) {
          groupedByDay[dayOfWeek] = new Set();
        }
        groupedByDay[dayOfWeek].add(timeRangeKey);
      });

      // Convert Sets back to arrays for processing, removing duplicates
      const cleanedGroupedByDay: { [key: number]: string[] } = {};
      Object.keys(groupedByDay).forEach(dayKey => {
        const dayIndex = Number(dayKey);
        cleanedGroupedByDay[dayIndex] = Array.from(groupedByDay[dayIndex]);
      });

      // Convert to our availability structure
      setAvailability(prev => {
        return prev.map(dayAvail => {
          const dayTimeRanges = cleanedGroupedByDay[dayAvail.dayIndex];

          if (!dayTimeRanges || dayTimeRanges.length === 0) {
            // Keep day disabled if no time ranges
            return {
              ...dayAvail,
              enabled: false,
              timeRanges: []
            };
          }

          const timeRanges: TimeRange[] = dayTimeRanges
            .map((timeRangeKey, index) => {
              const [startTime, endTime] = timeRangeKey.split('-');

              // Skip invalid time ranges
              if (!startTime || !endTime || startTime === 'undefined' || endTime === 'undefined') {
                return null;
              }

              // Additional validation - ensure times are valid
              if (startTime.length !== 5 || endTime.length !== 5) {
                return null;
              }

              return {
                id: `${dayAvail.dayIndex}-${index}`, // Template ID
                startTime,
                endTime,
              };
            })
            .filter((range): range is TimeRange => range !== null);

          return {
            ...dayAvail,
            enabled: timeRanges.length > 0,
            timeRanges: timeRanges.sort((a, b) => a.startTime.localeCompare(b.startTime))
          };
        });
      });

      // Validate after loading data
      setTimeout(() => {
        validateAvailability();
      }, 200);
    } catch (error) {
      console.error('Error loading availability:', error);
    }
  };

  // Toggle day availability
  const toggleDay = (dayIndex: number) => {
    setAvailability(prev =>
      prev.map(day => {
        if (day.dayIndex === dayIndex) {
          const newEnabled = !day.enabled;
          return {
            ...day,
            enabled: newEnabled,
            timeRanges: newEnabled && day.timeRanges.length === 0
              ? [{ id: Date.now().toString(), startTime: '09:00', endTime: '17:00' }]
              : newEnabled ? day.timeRanges : []
          };
        }
        return day;
      })
    );
  };

  // Add time range to a day
  const addTimeRange = (dayIndex: number) => {
    setAvailability(prev =>
      prev.map(day => {
        if (day.dayIndex === dayIndex) {
          const lastRange = day.timeRanges[day.timeRanges.length - 1];
          const defaultStart = lastRange ? lastRange.endTime : '09:00';
          const defaultEnd = lastRange ?
            String(Math.min(parseInt(lastRange.endTime.split(':')[0]) + 2, 17)).padStart(2, '0') + ':00' :
            '17:00';

          return {
            ...day,
            timeRanges: [
              ...day.timeRanges,
              {
                id: Date.now().toString(),
                startTime: defaultStart,
                endTime: defaultEnd
              }
            ]
          };
        }
        return day;
      })
    );
    // Validate after state update
    setTimeout(validateAvailability, 0);
  };

  // Remove time range
  const removeTimeRange = (dayIndex: number, rangeId: string) => {
    setAvailability(prev => {
      const updated = prev.map(day => {
        if (day.dayIndex === dayIndex) {
          const afterRanges = day.timeRanges.filter(range => range.id !== rangeId);

          return {
            ...day,
            timeRanges: afterRanges,
            enabled: afterRanges.length > 0 // Auto-disable if no ranges left
          };
        }
        return day;
      });

      return updated;
    });

    // Only validate if there are still multiple ranges that could conflict
    setTimeout(() => {
      // Re-check current availability state for validation need
      setAvailability(currentAvailability => {
        const needsValidation = currentAvailability.some(day => day.enabled && day.timeRanges.length > 1);
        if (needsValidation) {
          validateAvailability();
        } else {
          // Clear any existing validation errors since no conflicts are possible
          setValidationErrors({});
          setHasConflicts(false);
        }
        return currentAvailability; // No changes to state
      });
    }, 0);
  };

  // Round time to nearest 15 minutes
  // Detect overlapping time ranges within a day
  const detectOverlaps = (timeRanges: TimeRange[]): { [rangeId: string]: string } => {
    const conflicts: { [rangeId: string]: string } = {};

    for (let i = 0; i < timeRanges.length; i++) {
      for (let j = i + 1; j < timeRanges.length; j++) {
        const range1 = timeRanges[i];
        const range2 = timeRanges[j];

        // Convert times to minutes for easier comparison
        const start1 = timeToMinutes(range1.startTime);
        const end1 = timeToMinutes(range1.endTime);
        const start2 = timeToMinutes(range2.startTime);
        const end2 = timeToMinutes(range2.endTime);

        // Check for overlap or duplicate
        const hasOverlap = start1 < end2 && start2 < end1;
        const isDuplicate = start1 === start2 && end1 === end2;

        if (hasOverlap || isDuplicate) {
          const conflictMsg = isDuplicate
            ? `Duplicate time range: ${range2.startTime}-${range2.endTime}`
            : `Overlaps with ${range2.startTime}-${range2.endTime}`;

          conflicts[range1.id] = conflictMsg;
          conflicts[range2.id] = isDuplicate
            ? `Duplicate time range: ${range1.startTime}-${range1.endTime}`
            : `Overlaps with ${range1.startTime}-${range1.endTime}`;
        }
      }
    }

    return conflicts;
  };

  // Convert HH:MM time to minutes since midnight
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Validate all availability and update conflicts
  const validateAvailability = () => {
    const allErrors: { [key: string]: string } = {};
    let conflictsFound = false;

    // Skip validation if any time ranges are invalid (start >= end)
    const hasInvalidRanges = availability.some(dayAvail =>
      dayAvail.enabled && dayAvail.timeRanges.some(range => {
        const startMinutes = timeToMinutes(range.startTime);
        const endMinutes = timeToMinutes(range.endTime);
        return startMinutes >= endMinutes;
      })
    );

    if (hasInvalidRanges) {
      return;
    }

    availability.forEach(dayAvail => {
      if (dayAvail.enabled && dayAvail.timeRanges.length > 1) {
        const dayConflicts = detectOverlaps(dayAvail.timeRanges);
        Object.assign(allErrors, dayConflicts);
        if (Object.keys(dayConflicts).length > 0) {
          conflictsFound = true;
        }
      }
    });

    setValidationErrors(allErrors);
    setHasConflicts(conflictsFound);
  };

  // Round time to nearest 15 minutes
  const roundToNearestQuarter = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const roundedMinutes = Math.round(minutes / 15) * 15;

    if (roundedMinutes === 60) {
      return `${String(Math.min(hours + 1, 23)).padStart(2, '0')}:00`;
    }

    return `${String(hours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
  };

  // Calculate minimum end time (1 hour after start time)
  const getMinimumEndTime = (startTime: string) => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + 60; // Add 1 hour

    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;

    // Don't go beyond 9 PM (21:00)
    if (endHours > 21) {
      return '21:00';
    }

    return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
  };

  // Update time range
  const updateTimeRange = (dayIndex: number, rangeId: string, field: 'startTime' | 'endTime', value: string) => {
    // Round to nearest 15 minutes
    const roundedValue = roundToNearestQuarter(value);

    setAvailability(prev =>
      prev.map(day => {
        if (day.dayIndex === dayIndex) {
          return {
            ...day,
            timeRanges: day.timeRanges.map(range => {
              if (range.id === rangeId) {
                const updated = { ...range, [field]: roundedValue };

                // Ensure valid time range (start < end) with minimum 1-hour duration
                const startMinutes = timeToMinutes(updated.startTime);
                const endMinutes = timeToMinutes(updated.endTime);

                if (field === 'startTime') {
                  // When changing start time, ensure end time is at least 1 hour later
                  const minEndMinutes = startMinutes + 60;
                  if (endMinutes <= startMinutes || endMinutes < minEndMinutes) {
                    const minHours = Math.floor(minEndMinutes / 60);
                    const minMins = minEndMinutes % 60;
                    // Don't go beyond 9 PM
                    if (minHours <= 21) {
                      updated.endTime = `${String(minHours).padStart(2, '0')}:${String(minMins).padStart(2, '0')}`;
                    } else {
                      // If minimum end time would exceed 9 PM, adjust start time instead
                      updated.startTime = '20:00';
                      updated.endTime = '21:00';
                    }
                  }
                } else if (field === 'endTime') {
                  // When changing end time, ensure it's at least 1 hour after start
                  const minEndMinutes = startMinutes + 60;
                  if (endMinutes <= startMinutes || endMinutes < minEndMinutes) {
                    const minHours = Math.floor(minEndMinutes / 60);
                    const minMins = minEndMinutes % 60;
                    updated.endTime = `${String(minHours).padStart(2, '0')}:${String(minMins).padStart(2, '0')}`;
                  }
                }

                return updated;
              }
              return range;
            })
          };
        }
        return day;
      })
    );
    // Validate after state update
    setTimeout(validateAvailability, 0);
  };

  // Save availability to database with recurring slots
  const saveAvailability = async () => {
    // Run validation immediately and check conflicts synchronously
    const allErrors: { [key: string]: string } = {};
    let conflictsFound = false;

    availability.forEach(dayAvail => {
      if (dayAvail.enabled && dayAvail.timeRanges.length > 1) {
        const dayConflicts = detectOverlaps(dayAvail.timeRanges);
        Object.assign(allErrors, dayConflicts);
        if (Object.keys(dayConflicts).length > 0) {
          conflictsFound = true;
        }
      }
    });

    // Check for conflicts before saving
    if (conflictsFound) {
      alert('Cannot save availability with time conflicts. Please resolve overlapping time ranges first.');
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      // Helper function to check which availability slots have appointments
      const getBookedAvailabilityIds = async (): Promise<Set<number>> => {
        const { data: appointments, error } = await supabase
          .from('appointments')
          .select('availability_id')
          .eq('volunteer_id', userId)
          // Check for ALL appointment statuses, not just pending/confirmed
          // This prevents foreign key violations from any referenced slots
          .not('availability_id', 'is', null);

        if (error) {
          console.error('Error checking booked appointments:', error);
          return new Set();
        }

        return new Set(
          (appointments || [])
            .map(apt => {
              // Handle both string and number availability_id values
              const id = typeof apt.availability_id === 'string'
                ? parseInt(apt.availability_id, 10)
                : Number(apt.availability_id);
              return id;
            })
            .filter(id => Number.isFinite(id) && id > 0)
        );
      };

      // Get all existing availability slots for this user
      const { data: existingSlots, error: fetchError } = await supabase
        .from('appointment_availability')
        .select('id')
        .eq('volunteer_id', userId);

      if (fetchError) throw fetchError;

      const bookedIds = await getBookedAvailabilityIds();
      const existingIds = (existingSlots || []).map(slot => Number(slot.id));
      const deletableIds = existingIds.filter(id => !bookedIds.has(id));

      // Track counts for accurate messaging
      const originalTotalCount = existingIds.length;
      const deletedCount = deletableIds.length;
      const protectedCount = existingIds.length - deletableIds.length;

      // Only delete availability slots that don't have appointments
      if (deletableIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('appointment_availability')
          .delete()
          .in('id', deletableIds);

        if (deleteError) throw deleteError;
      }

      // Get existing slots that have appointments (the ones we need to avoid conflicts with)
      const { data: bookedSlots, error: conflictError } = await supabase
        .from('appointment_availability')
        .select(`
          id,
          start_time,
          end_time,
          appointments!inner (
            id,
            status
          )
        `)
        .eq('volunteer_id', userId)
        .gte('start_time', new Date().toISOString()) // Only future slots
        .in('appointments.status', ['pending', 'confirmed']); // Only slots with active appointments

      if (conflictError) {
        console.warn('Could not fetch booked slots for conflict detection:', conflictError);
      }

      // Create array of existing booked time slots for overlap checking
      const existingBookedSlots = (bookedSlots || []).map(slot => ({
        start: new Date(slot.start_time),
        end: new Date(slot.end_time),
        original: slot
      }));

      // Prepare new slots to insert with recurring logic
      const slotsToInsert: any[] = [];
      const skippedConflicts: any[] = [];

      // IMPORTANT: Work entirely in Eastern Time to avoid browser timezone issues
      // Get current time in Eastern Time
      const nowEastern = toEasternTime(new Date());

      // Start from tomorrow (in Eastern Time) to create availability as soon as possible
      const startDateEastern = new Date(nowEastern);
      startDateEastern.setDate(nowEastern.getDate() + 1); // Start from tomorrow in Eastern
      startDateEastern.setHours(0, 0, 0, 0);

      // Find the Monday of the week containing our start date (all in Eastern Time)
      const startMonday = new Date(startDateEastern);
      const dayOfWeek = startDateEastern.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysToGoBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday goes back 6, others go back (day - 1)
      startMonday.setDate(startDateEastern.getDate() - daysToGoBack);
      startMonday.setHours(0, 0, 0, 0);

      availability.forEach(dayAvail => {
        if (dayAvail.enabled && dayAvail.timeRanges.length > 0) {
          dayAvail.timeRanges.forEach(range => {
            // Create a unique recurrence_id for each day+time pattern
            const recurrenceId = uuidv4();

            // Create the first occurrence for this day/time combination (in Eastern Time)
            const firstOccurrence = new Date(startMonday);

            // dayIndex: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
            // To get from Monday (startMonday) to the target day:
            // Monday (1) -> 0 days, Tuesday (2) -> 1 day, Wednesday (3) -> 2 days, etc.
            // Sunday (0) -> 6 days (go to next Sunday)
            const daysFromMonday = dayAvail.dayIndex === 0 ? 6 : dayAvail.dayIndex - 1;
            firstOccurrence.setDate(startMonday.getDate() + daysFromMonday);

            // Skip this occurrence if it's before our minimum start date (tomorrow in Eastern)
            if (firstOccurrence < startDateEastern) {
              firstOccurrence.setDate(firstOccurrence.getDate() + 7); // Move to next week
            }

            // Use RRule to generate recurring DATES only (without times)
            // Pass firstOccurrence directly to maintain Eastern Time context
            const rule = new RRule({
              freq: RRule.WEEKLY,
              dtstart: firstOccurrence, // Use the Eastern Time date directly
              count: RECURRING_WEEKS, // Generate 12 weeks of slots
            });

            const occurrenceDates = rule.all();

            // Add all occurrences to the insert batch, but skip conflicts
            occurrenceDates.forEach(occurrenceDate => {
              // createAvailabilityDateTime expects a Date where .getFullYear(), .getMonth(), .getDate()
              // return Eastern Time values. Since we started with Eastern Time dates and RRule
              // maintains the timezone context, this should work correctly.
              const occurrenceStart = createAvailabilityDateTime(occurrenceDate, range.startTime);
              const occurrenceEnd = createAvailabilityDateTime(occurrenceDate, range.endTime);

              // Check if this new slot overlaps with any existing booked slots
              const hasConflict = existingBookedSlots.some(existingSlot => {
                // Check for time overlap: start1 < end2 && start2 < end1
                const newStart = occurrenceStart.getTime();
                const newEnd = occurrenceEnd.getTime();
                const existingStart = existingSlot.start.getTime();
                const existingEnd = existingSlot.end.getTime();

                return newStart < existingEnd && existingStart < newEnd;
              });

              if (hasConflict) {
                // Skip this occurrence due to conflict
                skippedConflicts.push({
                  start_time: occurrenceStart.toISOString(),
                  end_time: occurrenceEnd.toISOString(),
                  day: dayAvail.day,
                  time_range: `${range.startTime}-${range.endTime}`
                });
              } else {
                // No conflict, add to insert batch
                slotsToInsert.push({
                  volunteer_id: userId,
                  start_time: occurrenceStart.toISOString(),
                  end_time: occurrenceEnd.toISOString(),
                  recurrence_id: recurrenceId
                });
              }
            });
          });
        }
      });

      // Insert new recurring slots
      if (slotsToInsert.length > 0) {

        const { error: insertError } = await supabase
          .from('appointment_availability')
          .insert(slotsToInsert);

        if (insertError) throw insertError;

        // Calculate the final state for accurate messaging
        const newSlotsCount = slotsToInsert.length;
        // Final count is just the new slots + protected slots (old deletable slots are gone)
        const finalTotalCount = newSlotsCount + protectedCount;

        let message: string;

        // Determine the appropriate message based on what changed
        if (originalTotalCount === 0) {
          // First time setting up availability
          if (skippedConflicts.length > 0) {
            message = `Availability created! ${newSlotsCount} slots scheduled over ${RECURRING_WEEKS} weeks. ${skippedConflicts.length} slots skipped due to existing appointments.`;
          } else {
            message = `Availability created! ${newSlotsCount} slots scheduled over ${RECURRING_WEEKS} weeks.`;
          }
        } else {
          // Generic update message for any changes
          let baseMessage = '';
          if (protectedCount > 0) {
            baseMessage = `Availability updated successfully! ${finalTotalCount} total slots, ${protectedCount} with existing appointments preserved.`;
          } else {
            baseMessage = `Availability updated successfully! ${finalTotalCount} total slots.`;
          }

          if (skippedConflicts.length > 0) {
            message = `${baseMessage} ${skippedConflicts.length} slots skipped due to existing appointments.`;
          } else {
            message = baseMessage;
          }
        }

        setSaveMessage({
          type: 'success',
          text: message
        });
      } else {
        // No new slots being created
        if (originalTotalCount > 0) {
          if (protectedCount > 0) {
            setSaveMessage({
              type: 'success',
              text: `Availability cleared! Removed ${deletedCount} slots. (${protectedCount} slots with appointments were preserved)`
            });
          } else {
            setSaveMessage({
              type: 'success',
              text: 'All availability cleared successfully.'
            });
          }
        } else {
          setSaveMessage({
            type: 'success',
            text: 'No availability slots to save.'
          });
        }
      }

      // Clear success message after 5 seconds (clear any existing timeout first)
      if (saveMessageTimeoutRef.current) {
        clearTimeout(saveMessageTimeoutRef.current);
      }
      saveMessageTimeoutRef.current = setTimeout(() => setSaveMessage(null), 5000);

      // Reload all slots for the slots tab
      loadAllAvailabilitySlots();

    } catch (error) {
      console.error('Error saving availability:', error);
      setSaveMessage({ type: 'error', text: 'Error saving availability. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete individual slot
  const deleteSlot = async (slotId: number, appointmentStatus?: string, isPast?: boolean) => {
    // Check if slot is in the past
    if (isPast) {
      alert('Cannot delete past time slots.');
      return;
    }

    // Check if slot has an appointment
    if (appointmentStatus && appointmentStatus !== 'available') {
      const statusText = appointmentStatus === 'confirmed' ? 'confirmed appointment' : 'pending appointment request';
      alert(`Cannot delete this time slot because it has a ${statusText}. Please cancel the appointment first.`);
      return;
    }

    if (!confirm('Are you sure you want to remove this time slot?')) return;

    try {
      // Double-check for appointments before deletion
      const { data: appointments, error: checkError } = await supabase
        .from('appointments')
        .select('id, status')
        .eq('availability_id', slotId)
        .eq('volunteer_id', userId)
        .in('status', ['pending', 'confirmed'])
        .limit(1);

      if (checkError) throw checkError;

      if (appointments && appointments.length > 0) {
        const appointment = appointments[0];
        const statusText = appointment.status === 'confirmed' ? 'confirmed appointment' : 'pending appointment request';
        alert(`Cannot delete this time slot because it has a ${statusText}. Please cancel the appointment first.`);
        return;
      }

      const { error } = await supabase
        .from('appointment_availability')
        .delete()
        .eq('id', slotId);

      if (error) throw error;

      // Update local state immediately
      setAvailabilitySlots(prev => prev.filter(slot => slot.id !== slotId));
    } catch (error) {
      console.error('Error deleting slot:', error);
      alert('Error deleting time slot. Please try again.');
    }
  };

  return (
    <div className="flex flex-col bg-white h-full min-h-0">
      {/* Tab Navigation Header - Sticky */}
      <div className="flex-shrink-0 px-4 py-3 border-b bg-white sticky top-0 z-10">
        <div className="flex justify-between items-center">
          <div className="flex space-x-0">
            <button
              onClick={() => setActiveTab('template')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'template'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Set Weekly Availability
            </button>
            <button
              onClick={() => setActiveTab('slots')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'slots'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Modify Specific Dates
            </button>
          </div>

          {/* Save Changes button - invisible on slots tab for consistent sizing */}
          <button
            onClick={saveAvailability}
            disabled={isSaving || activeTab === 'slots' || hasConflicts}
            className={`px-3 py-1.5 text-sm rounded flex items-center gap-2 transition-all ${
              activeTab === 'template'
                ? hasConflicts
                  ? 'bg-red-600 text-white cursor-not-allowed opacity-75'
                  : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                : 'invisible'
            }`}
            title={hasConflicts ? 'Resolve time conflicts before saving' : ''}
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : hasConflicts ? (
              'Fix Conflicts First'
            ) : (
              'Save Changes'
            )}
          </button>
        </div>

        {saveMessage && (
          <div className={`mt-2 p-2 rounded text-sm ${
            saveMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {saveMessage.text}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Explanatory prompt - full width, part of scrollable content */}
        <div className="flex-shrink-0 px-4 py-3 bg-amber-50 border-b border-amber-200">
          <p className="text-sm text-amber-800">
            {activeTab === 'template' ? (
              <>
                <strong>Setting your availability:</strong> This will create appointment slots for the next 12 weeks.
                Individuals will be able to request appointments during these times.
              </>
            ) : (
              <>
                <strong>Managing specific dates:</strong> Remove individual time slots for holidays, conflicts, or other exceptions.
                Changes are applied immediately.
              </>
            )}
          </p>
        </div>

        <div className="p-3 sm:p-4">
          <div className="max-w-4xl mx-auto">
            {activeTab === 'template' ? (
              // Weekly Template Tab Content
              <div className="space-y-4">
                {availability.map((dayAvail) => {
              const dayInfo = DAYS.find(d => d.index === dayAvail.dayIndex);

              return (
                <div key={dayAvail.dayIndex} className="border rounded-lg">
                  {/* Day Header */}
                  <div className="bg-gray-50 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id={`day-${dayAvail.dayIndex}`}
                        checked={dayAvail.enabled}
                        onChange={() => toggleDay(dayAvail.dayIndex)}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`day-${dayAvail.dayIndex}`} className="text-lg font-medium cursor-pointer">
                        <span className="hidden sm:inline">{dayInfo?.name}</span>
                        <span className="sm:hidden">{dayInfo?.short}</span>
                      </label>
                    </div>

                    {dayAvail.enabled && (
                      <button
                        onClick={() => addTimeRange(dayAvail.dayIndex)}
                        className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Add Time</span>
                      </button>
                    )}
                  </div>

                  {/* Time Ranges */}
                  {dayAvail.enabled && (
                    <div className="p-2 sm:p-4 space-y-3">
                      {dayAvail.timeRanges.length === 0 ? (
                        <div className="text-gray-500 text-center py-4 flex items-center justify-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>Click "Add Time" to set available hours</span>
                        </div>
                      ) : (
                        dayAvail.timeRanges.map((range) => {
                          const hasError = validationErrors[range.id];
                          return (
                          <div key={range.id} className="space-y-2">
                            <div className={`flex items-center gap-2 p-2 sm:p-3 rounded-lg ${
                              hasError ? 'bg-red-50 border-2 border-red-200' : 'bg-gray-50'
                            }`}>
                              <div className="flex-1 flex items-center gap-1 sm:gap-2 min-w-0">
                                <div className="relative flex-1 min-w-0">
                                  <CustomTimePicker
                                    value={range.startTime}
                                    onChange={(value) => updateTimeRange(dayAvail.dayIndex, range.id, 'startTime', value)}
                                    className="w-full"
                                    maxTime="20:00" // Latest start time to allow 1 hour before 9 PM
                                  />
                                </div>
                                <span className="text-gray-500 flex-shrink-0 text-sm">to</span>
                                <div className="relative flex-1 min-w-0">
                                  <CustomTimePicker
                                    value={range.endTime}
                                    onChange={(value) => updateTimeRange(dayAvail.dayIndex, range.id, 'endTime', value)}
                                    className="w-full"
                                    minTime={getMinimumEndTime(range.startTime)}
                                  />
                                </div>
                              </div>

                              {dayAvail.timeRanges.length > 1 && (
                                <button
                                  onClick={() => removeTimeRange(dayAvail.dayIndex, range.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors flex-shrink-0"
                                  title="Remove time range"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            {/* Error message - now outside the flex container */}
                            {hasError && (
                              <div className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded mx-2">
                                {hasError}
                              </div>
                            )}
                          </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Unavailable State */}
                  {!dayAvail.enabled && (
                    <div className="p-4 text-center text-gray-500 bg-gray-25">
                      <span>Unavailable</span>
                    </div>
                  )}
                </div>
              );
              })}
            </div>
            ) : (
              // Individual Slots Tab Content
              renderSlotsTab()
            )}

            {/* Bottom padding for mobile layout */}
            <div className="h-24"></div>
          </div>
        </div>
      </div>
    </div>
  );

  // Render the slots management tab
  function renderSlotsTab() {
    // Helper functions for slots tab
    const groupSlotsByWeek = () => {
      const weeks: { [key: string]: any[] } = {};

      availabilitySlots.forEach(slot => {
        const date = new Date(slot.start_time);
        const startOfWeek = new Date(date);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday as start of week
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);

        const weekKey = startOfWeek.toISOString().split('T')[0];
        if (!weeks[weekKey]) {
          weeks[weekKey] = [];
        }
        weeks[weekKey].push(slot);
      });

      // Sort slots within each week
      Object.keys(weeks).forEach(weekKey => {
        weeks[weekKey].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      });

      return weeks;
    };

    const formatSlotTime = (startTime: string, endTime: string) => {
      return formatTimeRange(startTime, endTime);
    };

    const formatSlotDate = (dateString: string) => {
      const date = new Date(dateString);
      const dayName = format(date, 'EEEE');
      const monthDay = format(date, 'MMM d');

      if (isToday(date)) return `${dayName}, ${monthDay} (Today)`;
      if (isTomorrow(date)) return `${dayName}, ${monthDay} (Tomorrow)`;
      if (isYesterday(date)) return `${dayName}, ${monthDay} (Yesterday)`;

      return `${dayName}, ${monthDay}`;
    };

    const weekGroups = groupSlotsByWeek();
    const sortedWeekKeys = Object.keys(weekGroups).sort();

    if (availabilitySlots.length === 0) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="text-center text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium mb-2">No availability slots this week</h3>
            <p className="text-sm">Set up your weekly template first to create time slots for this week and beyond.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {sortedWeekKeys.map(weekKey => {
          const weekStart = new Date(weekKey);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);

          return (
            <div key={weekKey} className="border rounded-lg overflow-hidden bg-white shadow-sm">
              {/* Week Header - More Prominent */}
              <div className="bg-blue-50 px-3 py-2 border-b-2 border-blue-100">
                <h3 className="font-semibold text-blue-900 text-sm">
                  Week of {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
                </h3>
              </div>

              {/* Week's Slots - Compact Single Lines */}
              <div className="divide-y divide-gray-100">
                {weekGroups[weekKey].map(slot => {
                  const status = slot.appointmentStatus || 'available';
                  const isBooked = status !== 'available';
                  const isPast = slot.isPast || false;
                  const isDisabled = isBooked || isPast;

                  // Status styling
                  const getStatusConfig = () => {
                    if (isPast) {
                      return {
                        icon: History,
                        color: 'text-gray-500',
                        bg: 'bg-gray-100',
                        label: status === 'available' ? 'Past' : status === 'confirmed' ? 'Past (Confirmed)' : 'Past (Requested)'
                      };
                    }

                    switch (status) {
                      case 'confirmed':
                        return {
                          icon: CheckCircle,
                          color: 'text-green-600',
                          bg: 'bg-green-50',
                          label: 'Confirmed'
                        };
                      case 'pending':
                        return {
                          icon: AlertCircle,
                          color: 'text-amber-600',
                          bg: 'bg-amber-50',
                          label: 'Requested'
                        };
                      default:
                        return {
                          icon: Circle,
                          color: 'text-blue-600',
                          bg: 'bg-blue-50',
                          label: 'Available'
                        };
                    }
                  };

                  const statusConfig = getStatusConfig();
                  const StatusIcon = statusConfig.icon;

                  return (
                    <div key={slot.id} className={`px-3 py-2 flex items-center justify-between transition-colors ${
                      isPast ? 'bg-gray-25 opacity-75' : isBooked ? 'bg-gray-25' : 'hover:bg-gray-50'
                    }`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-medium text-gray-900 truncate">
                            {formatSlotDate(slot.start_time)}
                          </span>
                          <span className="text-gray-500">•</span>
                          <span className="text-gray-600 whitespace-nowrap">
                            {formatSlotTime(slot.start_time, slot.end_time)}
                          </span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          statusConfig.bg
                        } ${statusConfig.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          <span>{statusConfig.label}</span>
                        </div>

                        {/* Delete Button */}
                        <button
                          onClick={() => deleteSlot(slot.id, status, isPast)}
                          disabled={isDisabled}
                          className={`p-1.5 rounded transition-colors group flex-shrink-0 ${
                            isDisabled
                              ? 'text-gray-400 cursor-not-allowed'
                              : 'text-red-600 hover:bg-red-50'
                          }`}
                          title={isPast
                            ? 'Cannot delete past time slots'
                            : isBooked
                            ? `Cannot delete - slot has ${status === 'confirmed' ? 'confirmed appointment' : 'appointment request'}`
                            : 'Remove this time slot'
                          }
                        >
                          <Trash2 className={`w-4 h-4 transition-transform ${
                            isDisabled ? '' : 'group-hover:scale-110'
                          }`} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}