'use client';

import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { Plus, Trash2, Clock } from 'lucide-react';
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

interface CalendlyStyleAvailabilityProps {
  userId: string;
}

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

export default function CalendlyStyleAvailability({ userId }: CalendlyStyleAvailabilityProps) {
  const supabase = useSupabaseClient();
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
  }, [userId]);

  // Load existing availability from database (recurring slots)
  const loadExistingAvailability = async () => {
    try {
      const { data, error } = await supabase
        .from('appointment_availability')
        .select('*')
        .eq('volunteer_id', userId)
        .not('recurrence_id', 'is', null) // Only load recurring slots
        .order('start_time');

      if (error) {
        console.error('Error loading availability:', error);
        return;
      }

      if (!data || data.length === 0) return;

      // Group by day of week and time range to create template
      const groupedByDay: { [key: number]: Set<string> } = {};

      data.forEach(slot => {
        const date = new Date(slot.start_time);
        const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const startTime = date.toTimeString().slice(0, 5); // HH:MM
        const endTime = new Date(slot.end_time).toTimeString().slice(0, 5); // HH:MM
        const timeRangeKey = `${startTime}-${endTime}`;

        if (!groupedByDay[dayOfWeek]) {
          groupedByDay[dayOfWeek] = new Set();
        }
        groupedByDay[dayOfWeek].add(timeRangeKey);
      });

      // Convert to our availability structure
      setAvailability(prev => {
        return prev.map(dayAvail => {
          const dayTimeRanges = groupedByDay[dayAvail.dayIndex];

          if (!dayTimeRanges || dayTimeRanges.size === 0) {
            return dayAvail;
          }

          const timeRanges: TimeRange[] = Array.from(dayTimeRanges).map((timeRangeKey, index) => {
            const [startTime, endTime] = timeRangeKey.split('-');
            return {
              id: `${dayAvail.dayIndex}-${index}`, // Template ID
              startTime,
              endTime,
            };
          });

          return {
            ...dayAvail,
            enabled: true,
            timeRanges: timeRanges.sort((a, b) => a.startTime.localeCompare(b.startTime))
          };
        });
      });
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
  };

  // Remove time range
  const removeTimeRange = (dayIndex: number, rangeId: string) => {
    setAvailability(prev =>
      prev.map(day => {
        if (day.dayIndex === dayIndex) {
          const newTimeRanges = day.timeRanges.filter(range => range.id !== rangeId);
          return {
            ...day,
            timeRanges: newTimeRanges,
            enabled: newTimeRanges.length > 0 // Auto-disable if no ranges left
          };
        }
        return day;
      })
    );
  };

  // Update time range
  const updateTimeRange = (dayIndex: number, rangeId: string, field: 'startTime' | 'endTime', value: string) => {
    setAvailability(prev =>
      prev.map(day => {
        if (day.dayIndex === dayIndex) {
          return {
            ...day,
            timeRanges: day.timeRanges.map(range => {
              if (range.id === rangeId) {
                const updated = { ...range, [field]: value };

                // Ensure end time is after start time
                if (field === 'startTime' && updated.startTime >= updated.endTime) {
                  const startHour = parseInt(updated.startTime.split(':')[0]);
                  updated.endTime = `${String(Math.min(startHour + 1, 23)).padStart(2, '0')}:00`;
                } else if (field === 'endTime' && updated.endTime <= updated.startTime) {
                  const endHour = parseInt(updated.endTime.split(':')[0]);
                  updated.startTime = `${String(Math.max(endHour - 1, 0)).padStart(2, '0')}:00`;
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
  };

  // Save availability to database with recurring slots
  const saveAvailability = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      // Helper function to check which availability slots have appointments
      const getBookedAvailabilityIds = async (): Promise<Set<number>> => {
        const { data: appointments, error } = await supabase
          .from('appointments')
          .select('availability_id')
          .eq('volunteer_id', userId)
          .in('status', ['pending', 'confirmed']);

        if (error) {
          console.error('Error checking booked appointments:', error);
          return new Set();
        }

        return new Set(
          (appointments || [])
            .map(apt => Number(apt.availability_id))
            .filter(id => Number.isFinite(id))
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

      // Only delete availability slots that don't have appointments
      if (deletableIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('appointment_availability')
          .delete()
          .in('id', deletableIds);

        if (deleteError) throw deleteError;
      }

      // Warn user about slots that couldn't be deleted
      const protectedCount = existingIds.length - deletableIds.length;
      if (protectedCount > 0) {
        console.log(`Protected ${protectedCount} availability slots that have appointments booked`);
      }

      // Prepare new slots to insert with recurring logic
      const slotsToInsert: any[] = [];
      const recurrenceId = uuidv4(); // Single recurrence ID for all slots from this save
      const now = new Date();

      // Start from next Monday to avoid conflicts with current week
      const nextMonday = new Date(now);
      const daysUntilMonday = (1 + 7 - now.getDay()) % 7 || 7;
      nextMonday.setDate(now.getDate() + daysUntilMonday);
      nextMonday.setHours(0, 0, 0, 0);

      availability.forEach(dayAvail => {
        if (dayAvail.enabled && dayAvail.timeRanges.length > 0) {
          dayAvail.timeRanges.forEach(range => {
            // Create the first occurrence for this day/time combination
            const firstOccurrence = new Date(nextMonday);

            // Adjust for the specific day of week (0=Sunday, 1=Monday, etc.)
            const dayOffset = dayAvail.dayIndex === 0 ? 6 : dayAvail.dayIndex - 1; // Convert to Monday=0 based
            firstOccurrence.setDate(nextMonday.getDate() + dayOffset);

            // Set the time
            const [startHour, startMin] = range.startTime.split(':').map(Number);
            const [endHour, endMin] = range.endTime.split(':').map(Number);

            const startDateTime = new Date(firstOccurrence);
            startDateTime.setHours(startHour, startMin, 0, 0);

            const endDateTime = new Date(firstOccurrence);
            endDateTime.setHours(endHour, endMin, 0, 0);

            // Use RRule to generate recurring slots
            const rule = new RRule({
              freq: RRule.WEEKLY,
              dtstart: startDateTime,
              count: RECURRING_WEEKS, // Generate 12 weeks of slots
            });

            const occurrences = rule.all();

            // Add all occurrences to the insert batch
            occurrences.forEach(occurrenceStart => {
              const occurrenceEnd = new Date(occurrenceStart.getTime() + (endDateTime.getTime() - startDateTime.getTime()));

              slotsToInsert.push({
                volunteer_id: userId,
                start_time: occurrenceStart.toISOString(),
                end_time: occurrenceEnd.toISOString(),
                recurrence_id: recurrenceId
              });
            });
          });
        }
      });

      // Insert new recurring slots
      if (slotsToInsert.length > 0) {
        console.log(`Creating ${slotsToInsert.length} recurring availability slots over ${RECURRING_WEEKS} weeks`);

        const { error: insertError } = await supabase
          .from('appointment_availability')
          .insert(slotsToInsert);

        if (insertError) throw insertError;

        let message = `Availability saved! Created ${slotsToInsert.length} slots over ${RECURRING_WEEKS} weeks.`;
        if (protectedCount > 0) {
          message += ` (${protectedCount} existing slots with appointments were preserved)`;
        }

        setSaveMessage({
          type: 'success',
          text: message
        });
      } else {
        setSaveMessage({
          type: 'success',
          text: 'All availability cleared successfully.'
        });
      }

      // Clear success message after 5 seconds
      setTimeout(() => setSaveMessage(null), 5000);

    } catch (error) {
      console.error('Error saving availability:', error);
      setSaveMessage({ type: 'error', text: 'Error saving availability. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col bg-white h-full max-h-screen">
      <div className="flex-shrink-0 px-4 py-3 border-b bg-white">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Set Your Weekly Availability</h2>
          <button
            onClick={saveAvailability}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
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

      <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="space-y-4">
            {availability.map((dayAvail) => {
              const dayInfo = DAYS.find(d => d.index === dayAvail.dayIndex);

              return (
                <div key={dayAvail.dayIndex} className="border rounded-lg overflow-hidden">
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
                    <div className="p-4 space-y-3">
                      {dayAvail.timeRanges.length === 0 ? (
                        <div className="text-gray-500 text-center py-4 flex items-center justify-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>Click "Add Time" to set available hours</span>
                        </div>
                      ) : (
                        dayAvail.timeRanges.map((range) => (
                          <div key={range.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <div className="flex-1 flex items-center gap-2">
                              <input
                                type="time"
                                value={range.startTime}
                                onChange={(e) => updateTimeRange(dayAvail.dayIndex, range.id, 'startTime', e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <span className="text-gray-500">to</span>
                              <input
                                type="time"
                                value={range.endTime}
                                onChange={(e) => updateTimeRange(dayAvail.dayIndex, range.id, 'endTime', e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>

                            {dayAvail.timeRanges.length > 1 && (
                              <button
                                onClick={() => removeTimeRange(dayAvail.dayIndex, range.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                title="Remove time range"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))
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

          {/* Help Text */}
          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">How recurring availability works:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Toggle days on/off using the checkboxes</li>
              <li>• Add multiple time ranges per day (e.g., 9AM-12PM, 2PM-5PM)</li>
              <li>• When you save, the system creates {RECURRING_WEEKS} weeks of future slots</li>
              <li>• Individuals can book appointments from your available time slots</li>
              <li>• Updating your availability replaces all future slots with new ones</li>
            </ul>
            <div className="mt-3 text-xs text-blue-700 bg-blue-100 p-2 rounded">
              <strong>Note:</strong> Each save creates approximately {RECURRING_WEEKS} slots per time range.
              For example, "Tuesdays 1-5pm" creates {RECURRING_WEEKS} individual booking slots.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}