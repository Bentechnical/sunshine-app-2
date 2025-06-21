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
  const [events, setEvents] = useState<AvailabilityEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<AvailabilityEvent | null>(null);
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
      if (error) console.error('Error fetching availability:', error);
      else if (data) {
        const fetchedEvents = data.map((row: any) => ({
          id: String(row.id),
          title: row.recurrence_id ? 'Weekly Availabiliy' : 'Available',
          start: row.start_time,
          end: row.end_time,
          volunteer_id: row.volunteer_id,
          recurrence_id: row.recurrence_id || null,
          color: row.recurrence_id ? '#212df3' : '#2196F3',
          textColor: 'white',
        }));
        setEvents(fetchedEvents);
      }
    };
    fetchAvailability();
  }, [userId]);

  const handleDateSelect = async (selectInfo: any) => {
    try {
      const startTime = selectInfo.startStr;
      const endTime = selectInfo.endStr;
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
    const eventId = clickInfo.event.id;
    const eventData = events.find((e) => e.id === eventId);
    if (!eventData) return;
    setSelectedEvent({ ...eventData });
    setShowEventModal(true);
  };

  const deleteEvent = async (deleteSeries: boolean) => {
    if (!selectedEvent) return;
    try {
      if (selectedEvent.recurrence_id && deleteSeries) {
        const { error } = await supabase
          .from('appointment_availability')
          .delete()
          .eq('recurrence_id', selectedEvent.recurrence_id);
        if (error) throw error;
        setEvents((prev) => prev.filter((evt) => evt.recurrence_id !== selectedEvent.recurrence_id));
      } else {
        const { error } = await supabase
          .from('appointment_availability')
          .delete()
          .eq('id', Number(selectedEvent.id));
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
    const insertPayload = occurrences.map((dt) => ({
      volunteer_id: userId,
      start_time: dt.toISOString(),
      end_time: new Date(dt.getTime() + duration).toISOString(),
      recurrence_id: recurrenceId,
    }));
    try {
      const { data: newEvents, error: insertError } = await supabase
        .from('appointment_availability')
        .insert(insertPayload)
        .select();
      if (insertError) throw insertError;
      const { error: deleteError } = await supabase
        .from('appointment_availability')
        .delete()
        .eq('id', Number(selectedEvent.id));
      if (deleteError) throw deleteError;
      setEvents((prev) => [
        ...prev.filter((evt) => evt.id !== selectedEvent.id),
        ...newEvents.map((row: any) => ({
          id: String(row.id),
          title: 'Recurring Availability',
          start: row.start_time,
          end: row.end_time,
          volunteer_id: row.volunteer_id,
          recurrence_id: row.recurrence_id || null,
          color: '#212df3',
          textColor: 'white',
        })),
      ]);
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
    <div className="flex flex-col lg:h-[90vh] rounded-xl border border-gray-200 shadow-sm bg-white">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-lg font-semibold">Your Availability</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="fc-slide-fade">
          <FullCalendar
            key={slideKey}
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"            
            views={{
              timeGridThreeDay: {
                type: 'timeGrid',
                duration: { days: 3 },
                buttonText: '3 day',
              },
              timeGridFiveDay: {
                type: 'timeGrid',
                duration: { days: 5 },
                buttonText: '5 day',
              },
            }}
            selectable
            editable
            events={events}
            select={handleDateSelect}
            eventClick={handleEventClick}
            eventResize={handleEventResize}
            height="auto"
            slotMinTime="09:00:00"
            slotMaxTime="18:00:00"
            allDaySlot={false}
            selectConstraint={{ startTime: '09:00:00', endTime: '18:00:00' }}
            eventConstraint={{ startTime: '09:00:00', endTime: '18:00:00' }}
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
            {!selectedEvent.recurrence_id && (
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
              {!selectedEvent.recurrence_id && repeatWeeks > 1 && (
                <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={makeEventRecurringInDB}>
                  Save
                </button>
              )}
              <button className="px-4 py-2 bg-gray-400 rounded" onClick={() => { setShowEventModal(false); setSelectedEvent(null); }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
