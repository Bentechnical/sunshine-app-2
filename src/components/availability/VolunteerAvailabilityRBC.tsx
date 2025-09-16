// src/components/availability/VolunteerAvailabilityRBC.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { Calendar, momentLocalizer, View, Event } from 'react-big-calendar';
import moment from 'moment';
import { RRule } from 'rrule';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);

interface AvailabilityEvent extends Event {
  id: string;
  title: string;
  start: Date;
  end: Date;
  volunteer_id: string;
  recurrence_id?: string | null;
  booked?: boolean;
  requested?: boolean;
  resource?: any;
}

interface VolunteerAvailabilityProps {
  userId: string;
}

export default function VolunteerAvailabilityRBC({ userId }: VolunteerAvailabilityProps) {
  const supabase = useSupabaseClient();
  const [events, setEvents] = useState<AvailabilityEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<AvailabilityEvent | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState<number>(1);
  const [currentView, setCurrentView] = useState<View>('week');

  useEffect(() => {
    const fetchAvailability = async () => {
      const { data, error } = await supabase
        .from('appointment_availability')
        .select('*')
        .eq('volunteer_id', userId);

      if (error) {
        console.error('Error fetching availability:', error);
        return;
      }

      const availabilityRows = data || [];
      const availabilityIds = availabilityRows.map((r: any) => Number(r.id)).filter((n: any) => Number.isFinite(n));

      let confirmedIdSet = new Set<number>();
      let pendingIdSet = new Set<number>();

      if (availabilityIds.length > 0) {
        const { data: appts, error: apptErr } = await supabase
          .from('appointments')
          .select('availability_id, status, volunteer_id')
          .eq('volunteer_id', userId)
          .in('availability_id', availabilityIds)
          .in('status', ['pending', 'confirmed']);

        if (apptErr) {
          console.error('Error fetching appointments for availability:', apptErr);
        } else {
          for (const a of appts || []) {
            const idNum = Number(a.availability_id);
            if (!Number.isFinite(idNum)) continue;
            if (a.status === 'confirmed') confirmedIdSet.add(idNum);
            if (a.status === 'pending') pendingIdSet.add(idNum);
          }
        }
      }

      const fetchedEvents: AvailabilityEvent[] = availabilityRows.map((row: any) => {
        const isRecurring = Boolean(row.recurrence_id);
        const idNum = Number(row.id);
        const isBooked = confirmedIdSet.has(idNum);
        const isRequested = pendingIdSet.has(idNum) && !isBooked;

        return {
          id: String(row.id),
          title: isRecurring ? 'Weekly Availability' : isBooked ? 'Booked' : isRequested ? 'Requested' : 'Available',
          start: new Date(row.start_time),
          end: new Date(row.end_time),
          volunteer_id: row.volunteer_id,
          recurrence_id: row.recurrence_id || null,
          booked: isBooked,
          requested: isRequested,
          resource: {
            isRecurring,
            isBooked,
            isRequested,
          }
        };
      });

      setEvents(fetchedEvents);
    };

    fetchAvailability();
  }, [userId, supabase]);

  const handleSelectSlot = useCallback(async ({ start, end }: { start: Date; end: Date }) => {
    try {
      const startTime = start.toISOString();
      const endTime = end.toISOString();

      const { data, error } = await supabase
        .from('appointment_availability')
        .insert([{ volunteer_id: userId, start_time: startTime, end_time: endTime }])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        const newRow = data[0];
        const newEvent: AvailabilityEvent = {
          id: String(newRow.id),
          title: 'Available',
          start: new Date(newRow.start_time),
          end: new Date(newRow.end_time),
          volunteer_id: newRow.volunteer_id,
          recurrence_id: newRow.recurrence_id || null,
          resource: {
            isRecurring: false,
            isBooked: false,
            isRequested: false,
          }
        };
        setEvents(prev => [...prev, newEvent]);
      }
    } catch (err) {
      console.error('Error creating event:', err);
    }
  }, [userId, supabase]);

  const handleSelectEvent = useCallback((event: AvailabilityEvent) => {
    setSelectedEvent(event);
    setShowEventModal(true);
  }, []);

  const handleEventResize = useCallback(async ({ event, start, end }: { event: AvailabilityEvent; start: Date; end: Date }) => {
    try {
      const { error } = await supabase
        .from('appointment_availability')
        .update({
          start_time: start.toISOString(),
          end_time: end.toISOString()
        })
        .eq('id', Number(event.id));

      if (error) {
        console.error('Error updating event duration:', error);
        return;
      }

      setEvents(prev =>
        prev.map(evt =>
          evt.id === event.id
            ? { ...evt, start, end }
            : evt
        )
      );
    } catch (err) {
      console.error('Error handling event resize:', err);
    }
  }, [supabase]);

  const handleEventDrop = useCallback(async ({ event, start, end }: { event: AvailabilityEvent; start: Date; end: Date }) => {
    try {
      const { error } = await supabase
        .from('appointment_availability')
        .update({
          start_time: start.toISOString(),
          end_time: end.toISOString()
        })
        .eq('id', Number(event.id));

      if (error) {
        console.error('Error updating event time:', error);
        return;
      }

      setEvents(prev =>
        prev.map(evt =>
          evt.id === event.id
            ? { ...evt, start, end }
            : evt
        )
      );
    } catch (err) {
      console.error('Error handling event drop:', err);
    }
  }, [supabase]);

  const deleteEvent = async (deleteSeries: boolean) => {
    if (!selectedEvent) return;

    try {
      const isReferenced = async (availabilityIds: number[]): Promise<Set<number>> => {
        if (availabilityIds.length === 0) return new Set();
        const { data: appts, error: apptErr } = await supabase
          .from('appointments')
          .select('id, availability_id, status, volunteer_id')
          .eq('volunteer_id', userId)
          .in('availability_id', availabilityIds)
          .in('status', ['pending', 'confirmed']);

        if (apptErr) {
          console.error('Error checking appointments referencing availability:', apptErr);
          return new Set();
        }

        const set = new Set<number>();
        (appts || []).forEach((a: any) => {
          if (typeof a.availability_id === 'number') set.add(a.availability_id);
        });
        return set;
      };

      if (selectedEvent.recurrence_id && deleteSeries) {
        const { data: rows, error: fetchErr } = await supabase
          .from('appointment_availability')
          .select('id')
          .eq('recurrence_id', selectedEvent.recurrence_id);

        if (fetchErr) throw fetchErr;

        const ids: number[] = (rows || []).map((r: any) => Number(r.id)).filter((n) => Number.isFinite(n));
        const referenced = await isReferenced(ids);
        const deletableIds = ids.filter((id) => !referenced.has(id));

        if (deletableIds.length > 0) {
          const { error: delErr } = await supabase
            .from('appointment_availability')
            .delete()
            .in('id', deletableIds);

          if (delErr) throw delErr;
          setEvents(prev => prev.filter(evt => !deletableIds.includes(Number(evt.id))));
        }

        if (referenced.size > 0) {
          window.alert(
            `${referenced.size} instance(s) were not deleted because there are appointment(s) scheduled on them. ` +
            `Cancel those appointment(s) first to delete the remaining recurring availability.`
          );
        }
      } else {
        const idNum = Number(selectedEvent.id);
        const { data: appts } = await supabase
          .from('appointments')
          .select('id, status, volunteer_id')
          .eq('availability_id', idNum)
          .eq('volunteer_id', userId)
          .in('status', ['pending', 'confirmed'])
          .limit(1);

        const referenced = (appts || []).length > 0;

        if (referenced) {
          window.alert(
            'This availability has an appointment scheduled. Please cancel the appointment before deleting this slot.'
          );
        } else {
          const { error } = await supabase
            .from('appointment_availability')
            .delete()
            .eq('id', idNum);

          if (error) throw error;
          setEvents(prev => prev.filter(evt => evt.id !== selectedEvent.id));
        }
      }
    } catch (err) {
      console.error('Error deleting event:', err);
    } finally {
      setSelectedEvent(null);
      setShowEventModal(false);
    }
  };

  const makeEventRecurringInDB = async () => {
    if (!selectedEvent || selectedEvent.recurrence_id || repeatWeeks <= 1) return;

    const recurrenceId = uuidv4();
    const startDate = selectedEvent.start;
    const endDate = selectedEvent.end;
    const duration = endDate.getTime() - startDate.getTime();

    const rule = new RRule({
      freq: RRule.WEEKLY,
      dtstart: startDate,
      count: repeatWeeks,
    });

    const occurrences = rule.all();
    const occurrencesToInsert = occurrences.slice(1);

    const insertPayload = occurrencesToInsert.map((dt) => ({
      volunteer_id: userId,
      start_time: dt.toISOString(),
      end_time: new Date(dt.getTime() + duration).toISOString(),
      recurrence_id: recurrenceId,
    }));

    try {
      const { error: updateError } = await supabase
        .from('appointment_availability')
        .update({ recurrence_id: recurrenceId })
        .eq('id', Number(selectedEvent.id));

      if (updateError) throw updateError;

      const { data: newEvents, error: insertError } = await supabase
        .from('appointment_availability')
        .insert(insertPayload)
        .select();

      if (insertError) throw insertError;

      setEvents(prev => {
        const updatedExisting = prev.map(evt =>
          evt.id === selectedEvent.id
            ? {
                ...evt,
                recurrence_id: recurrenceId,
                title: 'Weekly Availability',
                resource: { ...evt.resource, isRecurring: true }
              }
            : evt
        );

        const appended: AvailabilityEvent[] = newEvents.map((row: any) => ({
          id: String(row.id),
          title: 'Weekly Availability',
          start: new Date(row.start_time),
          end: new Date(row.end_time),
          volunteer_id: row.volunteer_id,
          recurrence_id: row.recurrence_id || null,
          resource: {
            isRecurring: true,
            isBooked: false,
            isRequested: false,
          }
        }));

        return [...updatedExisting, ...appended];
      });
    } catch (err) {
      console.error('Error making event recurring:', err);
    } finally {
      setSelectedEvent(null);
      setShowEventModal(false);
    }
  };

  // Custom event style based on status
  const eventStyleGetter = useCallback((event: AvailabilityEvent) => {
    let backgroundColor = '#2196F3'; // Default blue

    if (event.resource?.isBooked) {
      backgroundColor = '#16a34a'; // Green for booked
    } else if (event.resource?.isRequested) {
      backgroundColor = '#f59e0b'; // Amber for requested
    } else if (event.resource?.isRecurring) {
      backgroundColor = '#212df3'; // Darker blue for recurring
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block'
      }
    };
  }, []);

  // Custom components for mobile responsiveness
  const components = {
    toolbar: (props: any) => {
      return (
        <div className="rbc-toolbar">
          <span className="rbc-btn-group">
            <button
              type="button"
              onClick={() => props.onNavigate('PREV')}
              className="rbc-btn rbc-btn-prev"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => props.onNavigate('TODAY')}
              className="rbc-btn rbc-btn-today"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => props.onNavigate('NEXT')}
              className="rbc-btn rbc-btn-next"
            >
              ›
            </button>
          </span>
          <span className="rbc-toolbar-label">{props.label}</span>
          <span className="rbc-btn-group hidden sm:flex">
            <button
              type="button"
              className={`rbc-btn ${currentView === 'day' ? 'rbc-active' : ''}`}
              onClick={() => {
                props.onView('day');
                setCurrentView('day');
              }}
            >
              Day
            </button>
            <button
              type="button"
              className={`rbc-btn ${currentView === 'week' ? 'rbc-active' : ''}`}
              onClick={() => {
                props.onView('week');
                setCurrentView('week');
              }}
            >
              Week
            </button>
          </span>
        </div>
      );
    }
  };

  return (
    <div className="flex flex-col bg-white h-full">
      <div className="px-4 py-3">
        <h2 className="text-lg font-semibold">Your Availability</h2>
      </div>

      <div className="flex-1 p-4">
        <div style={{ height: 'calc(100vh - 200px)' }}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            onEventResize={handleEventResize}
            onEventDrop={handleEventDrop}
            eventPropGetter={eventStyleGetter}
            selectable
            resizable
            popup
            views={['day', 'week']}
            defaultView="week"
            step={30}
            timeslots={2}
            min={new Date(2000, 1, 1, 9, 0, 0)} // 9 AM
            max={new Date(2000, 1, 1, 21, 0, 0)} // 9 PM
            components={components}
            formats={{
              timeGutterFormat: 'h:mm A',
              eventTimeRangeFormat: ({ start, end }, culture, localizer) =>
                localizer?.format(start, 'h:mm A', culture) + ' - ' +
                localizer?.format(end, 'h:mm A', culture),
            }}
          />
        </div>
      </div>

      {showEventModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-md max-w-md w-full mx-4 overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-semibold mb-4">Event Details</h3>
            <p className="text-sm">
              <strong>Start:</strong> {format(selectedEvent.start, 'EEE, MMM d · h:mm a')}<br />
              <strong>End:</strong> {format(selectedEvent.end, 'EEE, MMM d · h:mm a')}
            </p>
            <p className="mt-2 text-sm">
              <strong>Recurring?</strong> {selectedEvent.recurrence_id ? 'Yes' : 'No'}
            </p>

            {!selectedEvent.recurrence_id && !selectedEvent.booked && !selectedEvent.requested && (
              <div className="mt-4">
                <label htmlFor="repeatWeeks" className="block text-sm font-medium text-gray-700 mb-1">
                  Repeat this availability weekly for:
                </label>
                <select
                  id="repeatWeeks"
                  value={repeatWeeks}
                  onChange={(e) => setRepeatWeeks(Number(e.target.value))}
                  className="border border-gray-300 rounded px-3 py-2 text-sm w-full"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((week) => (
                    <option key={week} value={week}>
                      {week} week{week > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedEvent.booked || selectedEvent.requested ? (
              <div className="mt-6">
                <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                  This availability has an appointment scheduled or requested. To remove this time slot, please cancel the appointment first.
                </div>
                <div className="mt-4">
                  <button
                    className="px-4 py-2 bg-gray-400 text-white rounded"
                    onClick={() => { setShowEventModal(false); setSelectedEvent(null); }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
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

                {!selectedEvent.recurrence_id && !selectedEvent.booked && !selectedEvent.requested && repeatWeeks > 1 && (
                  <button
                    className="px-4 py-2 bg-blue-600 text-white rounded"
                    onClick={makeEventRecurringInDB}
                  >
                    Save Recurring
                  </button>
                )}

                <button
                  className="px-4 py-2 bg-gray-400 text-white rounded"
                  onClick={() => { setShowEventModal(false); setSelectedEvent(null); }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}