'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
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
  const [dog, setDog] = useState<Dog | null>(null);
  const [volunteerName, setVolunteerName] = useState<string>('');
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  // Modal states and booking step
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<Availability | null>(null);
  const [bookingTime, setBookingTime] = useState(''); // free-text input
  const [bookingFeedback, setBookingFeedback] = useState<string | null>(null);
  const [bookingStep, setBookingStep] = useState<'input' | 'summary' | 'success'>('input');
  const [computedBookingStart, setComputedBookingStart] = useState<Date | null>(null);
  const [computedBookingEnd, setComputedBookingEnd] = useState<Date | null>(null);

  useEffect(() => {
    const fetchDogData = async () => {
      // Fetch the dog's profile
      const { data: dogData, error: dogError } = await supabase
        .from('dogs')
        .select('*')
        .eq('id', dogId)
        .single();

      if (dogError) {
        console.error('Error fetching dog:', dogError);
        setLoading(false);
        return;
      }

      setDog(dogData);

      // After getting dog data, fetch volunteer's first name from users table.
      const { data: volunteerData, error: volError } = await supabase
        .from('users')
        .select('first_name')
        .eq('id', dogData.volunteer_id)
        .single();
      if (volError) {
        console.error('Error fetching volunteer info:', volError);
      } else if (volunteerData) {
        setVolunteerName(volunteerData.first_name);
      }

      // Use the volunteer_id from the dog's record to fetch availability
      const volunteerId = dogData.volunteer_id;
      const { data: availData, error: availError } = await supabase
        .from('appointment_availability')
        .select('*')
        .eq('volunteer_id', volunteerId)
        .eq('is_hidden', false) // Only show slots that are not hidden
        .gt('start_time', new Date().toISOString()) // Only future slots
        .order('start_time', { ascending: true });

      if (availError) {
        console.error('Error fetching availability:', availError);
      } else {
        setAvailability(availData || []);
      }
      setLoading(false);
    };

    fetchDogData();
  }, [dogId]);

  // Opens the booking modal and resets state
  function openBookingModal(slot: Availability) {
    setBookingSlot(slot);
    setBookingTime('');
    setBookingFeedback(null);
    setBookingStep('input');
    setComputedBookingStart(null);
    setComputedBookingEnd(null);
    setShowBookingModal(true);
  }

  // Helper: Parse free-text time (e.g., "1130am", "11:30 AM") into hour and minute (24h)
  function parseTimeInput(input: string): { hour: number; minute: number } | null {
    const cleaned = input.replace(/\s+/g, '').toLowerCase();
    const match = cleaned.match(/^(\d{1,2})(:?(\d{2}))?(am|pm)$/);
    if (!match) return null;

    let hour = parseInt(match[1], 10);
    const minute = match[3] ? parseInt(match[3], 10) : 0;
    const period = match[4];

    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

    if (period === 'pm' && hour !== 12) {
      hour += 12;
    } else if (period === 'am' && hour === 12) {
      hour = 0;
    }

    return { hour, minute };
  }

  // Helper: Format a date for the available window (e.g., "Wednesday, March 19, 2025")
  function formatAvailableWindow(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // Helper: Format time without seconds (e.g., "10:00 AM")
  function formatTime(timeStr: string): string {
    return new Date(timeStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    });
  }

  // Called when user clicks "Next" on the input step.
  function handleNext() {
    if (!bookingSlot) return;

    const parsed = parseTimeInput(bookingTime);
    if (!parsed) {
      setBookingFeedback('Invalid time format. Please use a format like "11:30am" or "11:30 AM".');
      return;
    }

    const slotStartDate = new Date(bookingSlot.start_time);
    const bookingStart = new Date(slotStartDate);
    bookingStart.setHours(parsed.hour, parsed.minute, 0, 0);
    const bookingEnd = new Date(bookingStart.getTime() + 60 * 60 * 1000);

    if (bookingStart < new Date(bookingSlot.start_time) || bookingEnd > new Date(bookingSlot.end_time)) {
      setBookingFeedback('Selected time is outside the availability window.');
      return;
    }

    setComputedBookingStart(bookingStart);
    setComputedBookingEnd(bookingEnd);
    setBookingFeedback(null);
    setBookingStep('summary');
  }

  // Called when user clicks "Submit Request" on the summary step.
  async function handleBookingSubmitSummary() {
    if (!bookingSlot || !computedBookingStart || !computedBookingEnd) return;
    if (!user) {
      setBookingFeedback('You must be logged in as an individual to book a slot.');
      return;
    }

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

    if (error) {
      console.error('Error booking appointment:', error);
      setBookingFeedback('Failed to book appointment. Please try again.');
      return;
    }

    const { error: updateError } = await supabase
      .from('appointment_availability')
      .update({ is_hidden: true })
      .eq('id', bookingSlot.id);

    if (updateError) {
      console.error('Error updating availability:', updateError);
    }
    setAvailability((prev) => prev.filter((s) => s.id !== bookingSlot.id));
    setBookingStep('success');
  }

  // Closes the modal and resets all modal-related state.
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
    <div className="p-6">
      <button onClick={onBack} className="bg-gray-500 text-white px-4 py-2 rounded mb-4">
        ← Back to Dog Directory
      </button>
      <div className="flex flex-col items-center">
        <img
          src={dog.dog_picture_url || '/default-dog.png'}
          alt={dog.dog_name}
          className="w-60 h-60 object-cover rounded-lg"
        />
        <h2 className="text-2xl font-bold mt-4">{dog.dog_name}</h2>
        <p className="text-gray-700">
          {dog.dog_breed} | Age: {dog.dog_age || 'Unknown'}
        </p>
        <p className="text-gray-600 mt-2">{dog.dog_bio}</p>
      </div>
      <h3 className="text-xl font-semibold mt-6">Available Times</h3>
      {availability.length === 0 ? (
        <p>No availability at the moment.</p>
      ) : (
        <ul>
          {availability.map((slot) => (
            <li key={slot.id} className="border p-4 my-2 rounded">
              <p>
                <strong>Date:</strong> {formatAvailableWindow(slot.start_time)}
              </p>
              <p>
                <strong>Time:</strong> {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
              </p>
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded mt-2"
                onClick={() => openBookingModal(slot)}
              >
                Book This Slot
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Booking Modal */}
      {showBookingModal && bookingSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
          <div className="bg-white p-6 rounded-md max-w-md w-full">
            {bookingStep === 'input' && (
              <>
                <h3 className="text-xl font-semibold mb-4">Request a Meeting</h3>
                <p>
                  <strong>Available Window:</strong>
                  <br />
                  {formatAvailableWindow(bookingSlot.start_time)}
                  <br />
                  {formatTime(bookingSlot.start_time)} - {formatTime(bookingSlot.end_time)}
                </p>
                <div className="mt-4">
                  <label className="block mb-1">
                    <strong>Enter Start Time (e.g., 11:30 AM):</strong>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 1130am or 11:30 AM"
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="border p-2 w-full"
                  />
                </div>
                {bookingFeedback && (
                  <p className="mt-3 text-sm text-gray-700">{bookingFeedback}</p>
                )}
                <div className="mt-6 flex justify-end space-x-2">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-gray-400 text-white rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleNext}
                    className="px-4 py-2 bg-blue-600 text-white rounded"
                  >
                    Next
                  </button>
                </div>
              </>
            )}
            {bookingStep === 'summary' && computedBookingStart && computedBookingEnd && (
              <>
                <h3 className="text-xl font-semibold mb-4">Confirm Your Request</h3>
                <p className="mb-2">
                  You are requesting a visit with <strong>{volunteerName}</strong> and{' '}
                  <strong>{dog?.dog_name}</strong>.
                </p>
                <p>
                  <strong>Requested Meeting Time:</strong>
                  <br />
                  {computedBookingStart.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: 'numeric',
                    hour12: true,
                  })}{' '}
                  -{' '}
                  {computedBookingEnd.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: 'numeric',
                    hour12: true,
                  })}
                </p>
                <p className="mt-2">
                  <strong>Available Window:</strong>
                  <br />
                  {formatAvailableWindow(bookingSlot.start_time)}
                  <br />
                  {formatTime(bookingSlot.start_time)} - {formatTime(bookingSlot.end_time)}
                </p>
                {bookingFeedback && (
                  <p className="mt-3 text-sm text-gray-700">{bookingFeedback}</p>
                )}
                <div className="mt-6 flex justify-end space-x-2">
                  <button
                    onClick={() => setBookingStep('input')}
                    className="px-4 py-2 bg-gray-400 text-white rounded"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleBookingSubmitSummary}
                    className="px-4 py-2 bg-blue-600 text-white rounded"
                  >
                    Submit Request
                  </button>
                </div>
              </>
            )}
            {bookingStep === 'success' && (
              <div className="flex flex-col items-center">
                <div className="text-green-600 text-6xl">✅</div>
                <h3 className="text-xl font-semibold mt-4">Booking Request Submitted!</h3>
                <p className="mt-2 text-gray-700 text-center">
                  Your booking request has been submitted. We will notify you shortly.
                </p>
                <button
                  onClick={closeModal}
                  className="mt-6 px-4 py-2 bg-gray-500 text-white rounded"
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
