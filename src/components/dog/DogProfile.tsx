// src/components/dog/DogProfile.tsx

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { useUser } from '@clerk/clerk-react';

interface Dog {
  id: number;
  volunteer_id: string;
  dog_name: string;
  dog_breed: string;
  dog_age: number | null;
  dog_bio: string;
  dog_picture_url: string;
}

interface Availability {
  id: number;
  volunteer_id: string;
  start_time: string;
  end_time: string;
  is_hidden?: boolean;
}

interface DogProfileProps {
  dogId: string;
  onBack: () => void;
}

export default function DogProfile({ dogId, onBack }: DogProfileProps) {
  const supabase = useSupabaseClient();
  const { user } = useUser();

  const [dog, setDog] = useState<Dog | null>(null);
  const [volunteerName, setVolunteerName] = useState<string>('');
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);

  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<Availability | null>(null);
  const [bookingTime, setBookingTime] = useState('');
  const [bookingFeedback, setBookingFeedback] = useState<string | null>(null);
  const [bookingStep, setBookingStep] = useState<'input' | 'summary' | 'success'>('input');
  const [computedBookingStart, setComputedBookingStart] = useState<Date | null>(null);
  const [computedBookingEnd, setComputedBookingEnd] = useState<Date | null>(null);

  const fetchDogData = useCallback(async () => {
    setLoading(true);

    const { data: dogData, error: dogError } = await supabase
      .from('dogs')
      .select('*')
      .eq('id', dogId)
      .single();

    if (dogError || !dogData) {
      console.error('[DogProfile] Failed to fetch dog:', dogError);
      setLoading(false);
      return;
    }

    setDog(dogData);

    const { data: volunteerData } = await supabase
      .from('users')
      .select('first_name')
      .eq('id', dogData.volunteer_id)
      .single();

    if (volunteerData) {
      setVolunteerName(volunteerData.first_name);
    }

    const { data: availData } = await supabase
      .from('appointment_availability')
      .select('*')
      .eq('volunteer_id', dogData.volunteer_id)
      .eq('is_hidden', false)
      .gt('start_time', new Date().toISOString())
      .order('start_time', { ascending: true });

    setAvailability(availData || []);
    setLoading(false);
  }, [dogId, supabase]);

  useEffect(() => {
    fetchDogData();
  }, [fetchDogData]);

  function openBookingModal(slot: Availability) {
    setBookingSlot(slot);
    setBookingTime('');
    setBookingFeedback(null);
    setBookingStep('input');
    setComputedBookingStart(null);
    setComputedBookingEnd(null);
    setShowBookingModal(true);
  }

  function parseTimeInput(input: string): { hour: number; minute: number } | null {
    const cleaned = input.replace(/\s+/g, '').toLowerCase();
    const match = cleaned.match(/^(\d{1,2})(:?(\d{2}))?(am|pm)$/);
    if (!match) return null;

    let hour = parseInt(match[1], 10);
    const minute = match[3] ? parseInt(match[3], 10) : 0;
    const period = match[4];

    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;

    return { hour, minute };
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function handleNext() {
    if (!bookingSlot) return;

    const parsed = parseTimeInput(bookingTime);
    if (!parsed) {
      setBookingFeedback('Invalid time format. Use e.g., "11:30am"');
      return;
    }

    const start = new Date(bookingSlot.start_time);
    start.setHours(parsed.hour, parsed.minute, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    if (start < new Date(bookingSlot.start_time) || end > new Date(bookingSlot.end_time)) {
      setBookingFeedback('Time is outside the available window.');
      return;
    }

    setComputedBookingStart(start);
    setComputedBookingEnd(end);
    setBookingStep('summary');
    setBookingFeedback(null);
  }

  async function handleBookingSubmitSummary() {
    if (!bookingSlot || !computedBookingStart || !computedBookingEnd || !user) return;

    const { data, error } = await supabase
      .from('appointments')
      .insert([
        {
          individual_id: user.id,
          volunteer_id: bookingSlot.volunteer_id,
          availability_id: bookingSlot.id,
          start_time: computedBookingStart.toISOString(),
          end_time: computedBookingEnd.toISOString(),
          status: 'pending',
        },
      ])
      .select();

    if (error || !data || data.length === 0) {
      setBookingFeedback('Failed to book this appointment.');
      return;
    }

    const appointmentId = data[0].id;

    await supabase
      .from('appointment_availability')
      .update({ is_hidden: true })
      .eq('id', bookingSlot.id);

    setAvailability((prev) => prev.filter((s) => s.id !== bookingSlot.id));

    // Send email notifications
    const body = JSON.stringify({ requestId: appointmentId, dogId: dog!.id });

    await Promise.all([
      fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...JSON.parse(body), type: 'individual' }),
      }),
      fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...JSON.parse(body), type: 'volunteer' }),
      }),
    ]);

    setBookingStep('success');
  }

  function closeModal() {
    setShowBookingModal(false);
    setBookingSlot(null);
    setBookingStep('input');
    setBookingTime('');
    setBookingFeedback(null);
    setComputedBookingStart(null);
    setComputedBookingEnd(null);
  }

  if (loading) return <p>Loading...</p>;
  if (!dog) return <p>Dog not found.</p>;

  return (
    <div className="flex flex-col gap-4 h-full px-4 pb-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
        <button
          className="text-sm text-[#0e62ae] font-semibold hover:underline mb-2 lg:mb-0"
          onClick={onBack}
        >
          ← Back to Directory
        </button>
        <div className="lg:w-1/2 ml-auto">
          <h3 className="text-xl font-semibold pl-4">Available Appointments</h3>
        </div>
      </div>

      {/* Content Columns */}
      <div className="flex flex-col lg:flex-row gap-6 min-w-0">
        {/* Dog Info */}
        <div className="w-full lg:w-1/2 bg-white shadow-lg rounded-lg p-4">
          <img
            src={dog.dog_picture_url || '/images/default_dog.png'}
            alt={dog.dog_name}
            className="w-full h-60 object-cover rounded-md"
          />
          <h2 className="text-2xl font-bold mt-4">{dog.dog_name}</h2>
          <p className="text-gray-700">{dog.dog_breed}</p>
          <p className="text-sm text-gray-500 italic mb-2">with {volunteerName}</p>
          <p className="text-gray-600 text-sm mb-4">Age: {dog.dog_age || 'Unknown'}</p>
          <p className="text-gray-600">{dog.dog_bio}</p>
        </div>

        {/* Availability */}
        <div className="w-full lg:w-1/2 bg-white shadow-lg rounded-lg p-4">
          {availability.length === 0 ? (
            <p className="text-gray-500">No availability at the moment.</p>
          ) : (
            <ul className="space-y-4">
              {availability.map((slot) => (
                <li key={slot.id} className="border p-3 rounded-md shadow-sm">
                  <p><strong>Date:</strong> {formatDate(slot.start_time)}</p>
                  <p><strong>Time:</strong> {formatTime(slot.start_time)} – {formatTime(slot.end_time)}</p>
                  <button
                    onClick={() => openBookingModal(slot)}
                    className="mt-2 bg-[#0e62ae] text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Book This Slot
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Booking Modal */}
      {showBookingModal && bookingSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
          <div className="bg-white p-6 rounded-md max-w-md w-full">
            {bookingStep === 'input' && (
              <>
                <h3 className="text-xl font-semibold mb-4">Request a Meeting</h3>
                <p><strong>Available Window:</strong><br />{formatDate(bookingSlot.start_time)}<br />{formatTime(bookingSlot.start_time)} – {formatTime(bookingSlot.end_time)}</p>
                <div className="mt-4">
                  <label className="block mb-1 font-semibold">Enter Start Time</label>
                  <input
                    type="text"
                    placeholder="e.g., 11:30 AM"
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="border p-2 w-full"
                  />
                </div>
                {bookingFeedback && <p className="mt-2 text-sm text-red-600">{bookingFeedback}</p>}
                <div className="mt-6 flex justify-end space-x-2">
                  <button onClick={closeModal} className="bg-gray-400 text-white px-4 py-2 rounded">Cancel</button>
                  <button onClick={handleNext} className="bg-blue-600 text-white px-4 py-2 rounded">Next</button>
                </div>
              </>
            )}

            {bookingStep === 'summary' && computedBookingStart && computedBookingEnd && (
              <>
                <h3 className="text-xl font-semibold mb-4">Confirm Request</h3>
                <p>You are requesting a visit with <strong>{volunteerName}</strong> and <strong>{dog?.dog_name}</strong>.</p>
                <p className="mt-2"><strong>Requested Time:</strong><br />{formatTime(computedBookingStart.toISOString())} – {formatTime(computedBookingEnd.toISOString())}</p>
                {bookingFeedback && <p className="mt-2 text-sm text-red-600">{bookingFeedback}</p>}
                <div className="mt-6 flex justify-end space-x-2">
                  <button onClick={() => setBookingStep('input')} className="bg-gray-400 text-white px-4 py-2 rounded">Back</button>
                  <button onClick={handleBookingSubmitSummary} className="bg-blue-600 text-white px-4 py-2 rounded">Submit</button>
                </div>
              </>
            )}

            {bookingStep === 'success' && (
              <div className="flex flex-col items-center text-center">
                <div className="text-4xl text-green-600 mb-2">✅</div>
                <h3 className="text-xl font-semibold">Booking Submitted!</h3>
                <p className="text-gray-700 mt-2">We'll notify you once your appointment is confirmed.</p>
                <button onClick={closeModal} className="mt-6 bg-gray-500 text-white px-4 py-2 rounded">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
