'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase/client';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { RRule } from 'rrule';
import { v4 as uuidv4 } from 'uuid';

interface AvailabilityEvent {
  id: string; // Cast integer PK to string
  title: string;
  start: string;
  end: string;
  volunteer_id: string;
  recurrence_id?: string | null;
  color?: string;
  textColor?: string;
}

interface VolunteerAvailabilityProps {
  userId: string;
}

export default function VolunteerAvailability({ userId }: VolunteerAvailabilityProps) {
  const [events, setEvents] = useState<AvailabilityEvent[]>([]);
  // State for editing or deleting events
  const [selectedEvent, setSelectedEvent] = useState<AvailabilityEvent | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  // Recurrence controls
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('weekly');

  //-----------------------------------
  // 1) Fetch existing availability
  //-----------------------------------
  useEffect(() => {
    const fetchAvailability = async () => {
      const { data, error } = await supabase
        .from('appointment_availability')
        .select('*')
        .eq('volunteer_id', userId);

      if (error) {
        console.error('Error fetching availability:', error);
      } else if (data) {
        const fetchedEvents = data.map((row: any) => ({
          id: String(row.id), // Convert int -> string
          title: row.recurrence_id ? 'Recurring Appointment' : 'Available',
          start: row.start_time,
          end: row.end_time,
          volunteer_id: row.volunteer_id,
          recurrence_id: row.recurrence_id || null,
          // Color logic: recurring = green, single = blue
          color: row.recurrence_id ? '#212df3' : '#2196F3',
          textColor: 'white',
        }));
        setEvents(fetchedEvents);
      }
    };

    fetchAvailability();
  }, [userId]);

  //--------------------------------------
  // 2) Create a SINGLE, non-recurring event
  //    on date select
  //--------------------------------------
  const handleDateSelect = async (selectInfo: any) => {
    try {
      const startTime = selectInfo.startStr;
      const endTime = selectInfo.endStr;

      // Insert single event
      const { data, error } = await supabase
        .from('appointment_availability')
        .insert([
          {
            volunteer_id: userId,
            start_time: startTime,
            end_time: endTime,
          }
        ])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        const newRow = data[0];
        const newEvent: AvailabilityEvent = {
          id: String(newRow.id),
          title: 'Available',
          start: newRow.start_time,
          end: newRow.end_time,
          volunteer_id: newRow.volunteer_id,
          recurrence_id: newRow.recurrence_id || null,
          color: '#2196F3', // Blue for single
          textColor: 'white',
        };
        setEvents((prev) => [...prev, newEvent]);
      }
    } catch (err) {
      console.error('Error creating event:', err);
    }
  };

  //-----------------------------------------
  // 3) Click an event -> open modal
  //-----------------------------------------
  const handleEventClick = (clickInfo: any) => {
    const eventId = clickInfo.event.id;
    const eventData = events.find((e) => e.id === eventId);

    if (!eventData) {
      console.warn('Clicked event not found in local state.');
      return;
    }
    setSelectedEvent({ ...eventData });
    setMakeRecurring(false); // reset if previously used
    setShowEventModal(true);
  };

  //-----------------------------------------
  // 4) Delete single event or entire series
  //-----------------------------------------
  const deleteEvent = async (deleteSeries: boolean) => {
    if (!selectedEvent) return;

    try {
      if (selectedEvent.recurrence_id && deleteSeries) {
        // Delete entire series
        const { error } = await supabase
          .from('appointment_availability')
          .delete()
          .eq('recurrence_id', selectedEvent.recurrence_id);

        if (error) throw error;

        // Remove them from local state
        setEvents((prev) =>
          prev.filter((evt) => evt.recurrence_id !== selectedEvent.recurrence_id)
        );
      } else {
        // Delete just this event
        const { error } = await supabase
          .from('appointment_availability')
          .delete()
          .eq('id', Number(selectedEvent.id)); // DB expects integer

        if (error) throw error;

        setEvents((prev) => prev.filter((evt) => evt.id !== selectedEvent.id));
      }
    } catch (err) {
      console.error('Error deleting event:', err);
    } finally {
      setSelectedEvent(null);
      setShowEventModal(false);
    }
  };

  //-----------------------------------------------------
  // 5) Convert single event -> recurring
  //    - Insert all repeating rows, including the original date
  //    - Then delete the original single row to avoid duplication
  //-----------------------------------------------------
  const makeEventRecurringInDB = async () => {
    if (!selectedEvent) return;

    // If it already has a recurrence_id, it's already recurring
    if (selectedEvent.recurrence_id) {
      console.warn('Event is already recurring!');
      return;
    }

    // We'll create an entire series including the original date/time
    const recurrenceId = uuidv4();
    const startDate = new Date(selectedEvent.start);
    const endDate = new Date(selectedEvent.end);
    const duration = endDate.getTime() - startDate.getTime();

    // We'll limit to 26 occurrences (~6 months if weekly)
    const rule = new RRule({
      freq: frequency === 'daily' ? RRule.DAILY : RRule.WEEKLY,
      dtstart: startDate,
      count: 26,
    });

    const occurrences = rule.all();

    // Build the DB payload
    const insertPayload = occurrences.map((dt) => ({
      volunteer_id: userId,
      start_time: dt.toISOString(),
      end_time: new Date(dt.getTime() + duration).toISOString(),
      recurrence_id: recurrenceId,
    }));

    try {
      // 1) Insert the entire recurring series
      const { data: newEvents, error: insertError } = await supabase
        .from('appointment_availability')
        .insert(insertPayload)
        .select();

      if (insertError) throw insertError;

      // 2) Delete the original single event row to prevent duplicates
      //    (We do this because the first inserted row will match the same date/time.)
      const { error: deleteError } = await supabase
        .from('appointment_availability')
        .delete()
        .eq('id', Number(selectedEvent.id)); // was single
      if (deleteError) throw deleteError;

      // 3) Update local state
      //    First, remove the old single event
      setEvents((prev) => prev.filter((evt) => evt.id !== selectedEvent.id));

      //    Then add the newly inserted rows as "Recurring Appointment"
      if (newEvents) {
        const recurringEvents: AvailabilityEvent[] = newEvents.map((row: any) => ({
          id: String(row.id),
          title: 'Recurring Availability',
          start: row.start_time,
          end: row.end_time,
          volunteer_id: row.volunteer_id,
          recurrence_id: row.recurrence_id || null,
          color: '#212df3', // Green
          textColor: 'white',
        }));

        setEvents((prev) => [...prev, ...recurringEvents]);
      }

    } catch (err) {
      console.error('Error making event recurring:', err);
    } finally {
      // Close modal
      setSelectedEvent(null);
      setShowEventModal(false);
    }
  };

  //------------------------------------------------------
  // 6) Handle event resize to update the duration in the DB
  //------------------------------------------------------
  const handleEventResize = async (resizeInfo: any) => {
    const event = resizeInfo.event;
    const newStart = event.startStr;
    const newEnd = event.endStr;

    try {
      const { error } = await supabase
        .from('appointment_availability')
        .update({
          start_time: newStart,
          end_time: newEnd,
        })
        .eq('id', Number(event.id)); // DB expects integer

      if (error) {
        console.error('Error updating event duration:', error);
        // Revert change if there's an error
        resizeInfo.revert();
      } else {
        // Update local state with new times
        setEvents((prev) =>
          prev.map((evt) =>
            evt.id === event.id ? { ...evt, start: newStart, end: newEnd } : evt
          )
        );
      }
    } catch (err) {
      console.error('Error handling event resize:', err);
      resizeInfo.revert();
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Your Availability</h2>

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        selectable
        editable
        events={events}
        select={handleDateSelect}
        eventClick={handleEventClick}
        eventResize={handleEventResize}
        height="auto"
      />

      {/* Event Details Modal */}
      {showEventModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
          <div className="bg-white p-6 rounded-md max-w-md w-full">
            <h3 className="text-xl font-semibold mb-4">Event Details</h3>
            <p>
              <strong>Start:</strong> {selectedEvent.start}
              <br />
              <strong>End:</strong> {selectedEvent.end}
            </p>
            <p className="mt-2">
              <strong>Recurring?</strong> {selectedEvent.recurrence_id ? 'Yes' : 'No'}
            </p>

            {/* If not recurring yet, user can choose to make it recurring */}
            {!selectedEvent.recurrence_id && (
              <div className="mt-4">
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={makeRecurring}
                    onChange={(e) => setMakeRecurring(e.target.checked)}
                  />
                  Convert to recurring?
                </label>

                {makeRecurring && (
                  <div className="mt-3">
                    <label className="mr-2">Frequency:</label>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly')}
                      className="border p-1"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-col space-y-2">
              {selectedEvent.recurrence_id ? (
                <>
                  <button
                    className="px-4 py-2 bg-red-600 text-white rounded"
                    onClick={() => deleteEvent(false)}
                  >
                    Delete This Instance
                  </button>
                  <button
                    className="px-4 py-2 bg-red-800 text-white rounded"
                    onClick={() => deleteEvent(true)}
                  >
                    Delete Entire Series
                  </button>
                </>
              ) : (
                <button
                  className="px-4 py-2 bg-red-600 text-white rounded"
                  onClick={() => deleteEvent(false)}
                >
                  Delete
                </button>
              )}

              {makeRecurring && !selectedEvent.recurrence_id && (
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded"
                  onClick={makeEventRecurringInDB}
                >
                  Make Recurring
                </button>
              )}

              <button
                className="px-4 py-2 bg-gray-400 rounded"
                onClick={() => {
                  setShowEventModal(false);
                  setSelectedEvent(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
