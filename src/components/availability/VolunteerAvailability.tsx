// src/components/availability/VolunteerAvailability.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { RRule } from 'rrule';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';

interface AvailabilityEvent {
  id: string;
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
  const supabase = useSupabaseClient();
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState<number>(1);
  const [slideKey, setSlideKey] = useState(0);
  const calendarRef = useRef<any>(null);

  useEffect(() => {
    const calendarApi = calendarRef.current?.getApi();
    if (!calendarApi) return;

    const updateView = () => {
      const width = window.innerWidth;
      if (width < 640) {
        calendarApi.changeView('timeGridThreeDay');
      } else if (width < 1024) {
        calendarApi.changeView('timeGridFiveDay');
      } else {
        calendarApi.changeView('timeGridWeek');
      }
    };

    updateView(); // Run once on mount
    window.addEventListener('resize', updateView);
    return () => window.removeEventListener('resize', updateView);
  }, []);

  useEffect(() => {
    const attachSlideAnimation = () => {
      const calendarEl = calendarRef.current?.el;
      if (!calendarEl) return;
      const nextButton = calendarEl.querySelector('.fc-next-button');
      const prevButton = calendarEl.querySelector('.fc-prev-button');
      const handleClick = () => setSlideKey((prev) => prev + 1);
      nextButton?.addEventListener('click', handleClick);
      prevButton?.addEventListener('click', handleClick);
      return () => {
        nextButton?.removeEventListener('click', handleClick);
        prevButton?.removeEventListener('click', handleClick);
      };
    };
    setTimeout(attachSlideAnimation, 0);
  }, []);

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
      // Determine which availability slots are booked by looking for appointments that reference them
      const availabilityIds = availabilityRows.map((r: any) => Number(r.id)).filter((n: any) => Number.isFinite(n));
      let bookedIdSet = new Set<number>();
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

      const fetchedEvents = availabilityRows.map((row: any) => {
        const isRecurring = Boolean(row.recurrence_id);
        const idNum = Number(row.id);
        const isBooked = confirmedIdSet.has(idNum);
        const isRequested = pendingIdSet.has(idNum) && !isBooked; // confirmed takes precedence
        // Colors: booked → green, requested → amber, else recurring → darker blue, else normal blue
        const baseColor = isBooked
          ? '#16a34a'
          : isRequested
          ? '#f59e0b'
          : isRecurring
          ? '#212df3'
          : '#2196F3';
        return {
          id: String(row.id),
          title: isRecurring ? 'Weekly Availability' : 'Available',
          start: row.start_time,
          end: row.end_time,
          volunteer_id: row.volunteer_id,
          recurrence_id: row.recurrence_id || null,
          booked: isBooked,
          requested: isRequested,
          color: baseColor,
          textColor: 'white',
        } as any;
      });

      setEvents(fetchedEvents);
    };
    fetchAvailability();
  }, [userId]);

  const handleDateSelect = async (selectInfo: any) => {
    try {
      const startTime = selectInfo.startStr;
      // Set default duration to 1 hour
      const startDate = new Date(startTime);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 hour
      const endTime = endDate.toISOString();
      
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
          start: newRow.start_time,
          end: newRow.end_time,
          volunteer_id: newRow.volunteer_id,
          recurrence_id: newRow.recurrence_id || null,
          color: '#2196F3',
          textColor: 'white',
        };
        setEvents((prev) => [...prev, newEvent]);
      }
    } catch (err) {
      console.error('Error creating event:', err);
    }
  };

  const handleEventClick = (clickInfo: any) => {
    console.log('Event click triggered:', clickInfo);
    const eventId = clickInfo.event.id;
    const eventData = events.find((e) => e.id === eventId);
    if (!eventData) {
      console.log('Event data not found for ID:', eventId);
      return;
    }
    console.log('Opening modal for event:', eventData);
    setSelectedEvent({ ...eventData });
    setShowEventModal(true);
  };

  // Custom event content with edit button when selected
  const handleEditClick = (eventId: string) => {
    const eventData = events.find((e) => e.id === eventId);
    if (eventData) {
      console.log('Edit button clicked - opening modal for event:', eventData);
      setSelectedEvent({ ...eventData });
      setShowEventModal(true);
    }
  };

  // Make the function available globally for inline onclick
  useEffect(() => {
    (window as any).handleEditClick = handleEditClick;
    return () => {
      delete (window as any).handleEditClick;
    };
  }, [events]);

  const deleteEvent = async (deleteSeries: boolean) => {
    if (!selectedEvent) return;
    try {
      // Helper: check if an availability id is referenced by any appointment
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
        // Load all availability ids in the series
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
          setEvents((prev) => prev.filter((evt) => !deletableIds.includes(Number(evt.id))));
        }

        if (referenced.size > 0) {
          window.alert(
            `${referenced.size} instance(s) were not deleted because there are appointment(s) scheduled on them. ` +
            `Cancel those appointment(s) first to delete the remaining recurring availability.`
          );
        }
      } else {
        // Single instance delete: block if referenced
        const idNum = Number(selectedEvent.id);
        const referenced = await (async () => {
          const { data: appts } = await supabase
            .from('appointments')
            .select('id, status, volunteer_id')
            .eq('availability_id', idNum)
            .eq('volunteer_id', userId)
            .in('status', ['pending', 'confirmed'])
            .limit(1);
          return (appts || []).length > 0;
        })();
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
          setEvents((prev) => prev.filter((evt) => evt.id !== selectedEvent.id));
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
    const startDate = new Date(selectedEvent.start);
    const endDate = new Date(selectedEvent.end);
    const duration = endDate.getTime() - startDate.getTime();
    const rule = new RRule({
      freq: RRule.WEEKLY,
      dtstart: startDate,
      count: repeatWeeks,
    });
    const occurrences = rule.all();
    // Skip the first occurrence because it is the currently selected event.
    const occurrencesToInsert = occurrences.slice(1);
    const insertPayload = occurrencesToInsert.map((dt) => ({
      volunteer_id: userId,
      start_time: dt.toISOString(),
      end_time: new Date(dt.getTime() + duration).toISOString(),
      recurrence_id: recurrenceId,
    }));
    try {
      // First, update the existing availability to attach it to the recurrence group
      const { error: updateError } = await supabase
        .from('appointment_availability')
        .update({ recurrence_id: recurrenceId })
        .eq('id', Number(selectedEvent.id));
      if (updateError) throw updateError;

      // Then insert the additional occurrences
      const { data: newEvents, error: insertError } = await supabase
        .from('appointment_availability')
        .insert(insertPayload)
        .select();
      if (insertError) throw insertError;
      setEvents((prev) => {
        const updatedExisting = prev.map((evt) =>
          evt.id === selectedEvent.id
            ? { ...evt, recurrence_id: recurrenceId, color: '#212df3', title: 'Weekly Availability' }
            : evt
        );
        const appended = newEvents.map((row: any) => ({
          id: String(row.id),
          title: 'Weekly Availability',
          start: row.start_time,
          end: row.end_time,
          volunteer_id: row.volunteer_id,
          recurrence_id: row.recurrence_id || null,
          color: '#212df3',
          textColor: 'white',
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

  const handleEventResize = async (resizeInfo: any) => {
    const event = resizeInfo.event;
    const newStart = event.startStr;
    const newEnd = event.endStr;
    try {
      const { error } = await supabase
        .from('appointment_availability')
        .update({ start_time: newStart, end_time: newEnd })
        .eq('id', Number(event.id));
      if (error) {
        console.error('Error updating event duration:', error);
        resizeInfo.revert();
      } else {
        setEvents((prev) =>
          prev.map((evt) => (evt.id === event.id ? { ...evt, start: newStart, end: newEnd } : evt))
        );
      }
    } catch (err) {
      console.error('Error handling event resize:', err);
      resizeInfo.revert();
    }
  };

  return (
    <div className="flex flex-col bg-white h-full">
      <div className="px-4 py-3" style={{ marginBottom: 0 }}>
        <h2 className="text-lg font-semibold">Your Availability</h2>
      </div>
      {/* Scroll container: header fixed, calendar grid scrolls within this port */}
      <div className="flex-1 p-0 md:p-4 md:overflow-y-auto">
        <div className="fc-slide-fade availability-scroll-port">
          <FullCalendar
            key={slideKey}
            ref={calendarRef}
            // FullCalendar configuration
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            views={{
              timeGridThreeDay: { type: 'timeGrid', duration: { days: 3 }, buttonText: '3 day' },
              timeGridFiveDay: { type: 'timeGrid', duration: { days: 5 }, buttonText: '5 day' }
            }}
            headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
            stickyHeaderDates
            editable
            selectable
            events={events}
            select={handleDateSelect}
            eventClick={handleEventClick}
            eventResize={handleEventResize}
            eventDragStart={(dragInfo) => {}}
            eventDrop={(dropInfo) => {
              const event = dropInfo.event;
              const newStart = event.startStr;
              const newEnd = event.endStr;
              supabase
                .from('appointment_availability')
                .update({ start_time: newStart, end_time: newEnd })
                .eq('id', Number(event.id))
                .then(({ error }) => {
                  if (error) {
                    console.error('Error updating event time:', error);
                    dropInfo.revert();
                  } else {
                    setEvents((prev) =>
                      prev.map((evt) => (evt.id === event.id ? { ...evt, start: newStart, end: newEnd } : evt))
                    );
                  }
                });
            }}
            height="auto"
            slotMinTime="09:00:00"
            slotMaxTime="21:00:00"
            allDaySlot={false}
            selectConstraint={{ startTime: '09:00:00', endTime: '21:00:00' }}
            eventConstraint={{ startTime: '09:00:00', endTime: '21:00:00' }}
            selectLongPressDelay={0}
            longPressDelay={100}
            eventContent={(arg) => {
              const props: any = (arg.event as any).extendedProps || {};
              const isRecurring = Boolean(props?.recurrence_id);
              const isBooked = Boolean(props?.booked);
              const isRequested = Boolean(props?.requested);
              if (isBooked) {
                return {
                  html:
                    '<div style="text-align:center;font-weight:700;font-size:0.78rem;line-height:1.1;padding-top:6px">Availability<br/>Booked</div>',
                };
              }
              if (isRequested) {
                return {
                  html:
                    '<div style="text-align:center;font-weight:700;font-size:0.78rem;line-height:1.1;padding-top:6px">Availability<br/>Requested</div>',
                };
              }
              if (isRecurring) {
                return {
                  html:
                    '<div style="text-align:center;font-weight:600;font-size:0.78rem;line-height:1.1;padding-top:6px">Availability<br/>Recurring</div>',
                };
              }
              return {
                html:
                  '<div style="text-align:center;font-weight:500;font-size:0.8rem;padding-top:6px">Available</div>',
              };
            }}
            datesSet={() => {
              const calendarContainer = document.querySelector('.fc') as HTMLElement | null;
              if (calendarContainer) {
                calendarContainer.classList.remove('fc-slide-fade');
                void calendarContainer.offsetWidth;
                calendarContainer.classList.add('fc-slide-fade');
              }
            }}
          />
        </div>
      </div>

      {showEventModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
          <div className="bg-white p-6 rounded-md max-w-md w-full overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-semibold mb-4">Event Details</h3>
            <p className="text-sm">
              <strong>Start:</strong> {format(new Date(selectedEvent.start), 'EEE, MMM d \u00b7 h:mm a')}<br />
              <strong>End:</strong> {format(new Date(selectedEvent.end), 'EEE, MMM d \u00b7 h:mm a')}
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
                  This availability has an appointment scheduled or requested. To remove this time slot, please cancel the appointment first. Then you can delete the availability.
                </div>
                <div className="mt-4">
                  <button className="px-4 py-2 bg-gray-400 rounded" onClick={() => { setShowEventModal(false); setSelectedEvent(null); }}>
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-col space-y-2">
                {selectedEvent.recurrence_id ? (
                  <>
                    <button className="px-4 py-2 bg-red-600 text-white rounded" onClick={() => deleteEvent(false)}>
                      Delete This Instance
                    </button>
                    <button className="px-4 py-2 bg-red-800 text-white rounded" onClick={() => deleteEvent(true)}>
                      Delete Entire Series
                    </button>
                  </>
                ) : (
                  <button className="px-4 py-2 bg-red-600 text-white rounded" onClick={() => deleteEvent(false)}>
                    Delete
                  </button>
                )}
                {!selectedEvent.recurrence_id && !selectedEvent.booked && !selectedEvent.requested && repeatWeeks > 1 && (
                  <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={makeEventRecurringInDB}>
                    Save
                  </button>
                )}
                <button className="px-4 py-2 bg-gray-400 rounded" onClick={() => { setShowEventModal(false); setSelectedEvent(null); }}>
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
