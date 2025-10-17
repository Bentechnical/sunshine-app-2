// src/components/dog/DogProfile.tsx
'use client';

import React, { useState, useEffect } from 'react';
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshAvailability = async (volunteerId: string) => {
    const { data, error } = await supabase
      .from('appointment_availability')
      .select('*')
      .eq('volunteer_id', volunteerId)
      .eq('is_hidden', false)
      .gt('start_time', new Date().toISOString())
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error refreshing availability:', error);
    } else {
      setAvailability(data || []);
    }
  };

  useEffect(() => {
    async function fetchDogData() {
      const { data: dogData } = await supabase.from('dogs').select('*').eq('id', dogId).single();
      if (!dogData) return setLoading(false);
      setDog(dogData);

      const { data: volunteerData } = await supabase
        .from('users')
        .select('first_name')
        .eq('id', dogData.volunteer_id)
        .single();
      if (volunteerData) setVolunteerName(volunteerData.first_name);

      await refreshAvailability(dogData.volunteer_id);
      setLoading(false);
    }

    fetchDogData();
  }, [dogId]);

  useEffect(() => {
    document.body.style.overflow = showBookingModal ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [showBookingModal]);

  useEffect(() => {
  if (dog && !showBookingModal) {
    refreshAvailability(dog.volunteer_id);
  }
}, [dog, showBookingModal]);

  

  function openBookingModal(slot: Availability) {
    setBookingSlot(slot);
    setBookingTime('');
    setBookingFeedback(null);
    setBookingStep('input');
    setComputedBookingStart(null);
    setComputedBookingEnd(null);
    setShowBookingModal(true);
  }

  function parseTimeInput(input: string) {
    // Normalize the input: remove extra spaces, convert to lowercase
    const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');
    
    // Handle various time formats with flexible regex patterns
    const patterns = [
      // 11am, 11:30am, 11:00am, 11 AM, 11:30 AM, 11:00 AM
      /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/,
      // 11:30 a.m., 11 a.m., 11:00 a.m.
      /^(\d{1,2})(?::(\d{2}))?\s*a\.?m\.?$/,
      // 11:30 p.m., 11 p.m., 11:00 p.m.
      /^(\d{1,2})(?::(\d{2}))?\s*p\.?m\.?$/,
      // 11:30, 11:00 (assume AM if no period specified)
      /^(\d{1,2}):(\d{2})$/,
      // 11 (assume AM if no period specified)
      /^(\d{1,2})$/,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        let hour = parseInt(match[1], 10);
        const minute = match[2] ? parseInt(match[2], 10) : 0;
        let period = match[3]; // Get the period if specified
        
        // Handle edge cases
        if (hour < 1 || hour > 12 || minute < 0 || minute > 59) continue;
        
        // Smart default: AM for 8-12, PM for 1-7
        if (!period) {
          period = (hour >= 8 && hour <= 12) ? 'am' : 'pm';
        }
        
        // Convert to 24-hour format
        if (period === 'pm' && hour !== 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;
        
        return { hour, minute };
      }
    }
    
    return null;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatTime(iso: string) {
    const originalDate = new Date(iso);
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Create reference time using today's date but original UTC hours/minutes
    // This ensures DST adjustments are applied correctly
    const referenceTime = new Date();
    referenceTime.setUTCHours(originalDate.getUTCHours(), originalDate.getUTCMinutes(), 0, 0);

    return referenceTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: userTimezone
    });
  }

  function handleNext() {
    if (!bookingSlot) return;
    const parsed = parseTimeInput(bookingTime);
    if (!parsed) return setBookingFeedback('Please enter a valid time (e.g., "11am", "11:30 AM", "2:00pm")');

    // Create appointment time using the slot's date but user's input time
    // Parse the slot's date to preserve the correct day
    const slotDate = new Date(bookingSlot.start_time);

    // Create the user's requested time using the slot's date
    const start = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), parsed.hour, parsed.minute, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    if (start < new Date(bookingSlot.start_time) || end > new Date(bookingSlot.end_time)) {
      return setBookingFeedback('Time is outside the available window.');
    }

    setComputedBookingStart(start);
    setComputedBookingEnd(end);
    setBookingStep('summary');
    setBookingFeedback(null);
  }

  async function handleBookingSubmitSummary() {
    if (!bookingSlot || !computedBookingStart || !computedBookingEnd || !user) return;

    setIsSubmitting(true);

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

    if (error || !data?.length) {
      setBookingFeedback('Failed to book this appointment.');
      setIsSubmitting(false);
      return;
    }

    const appointmentId = data[0].id;

    const { error: hideError } = await supabase
      .from('appointment_availability')
      .update({ is_hidden: true })
      .eq('id', bookingSlot.id);

    if (hideError) {
      console.error('Failed to update is_hidden:', hideError);
    }

    await refreshAvailability(bookingSlot.volunteer_id);

    await fetch('/api/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'individual',
    requestId: appointmentId,
    dogId: dog!.id,
    availabilityId: bookingSlot.id, // ✅ Include this
  }),
});

await fetch('/api/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'volunteer',
    requestId: appointmentId,
    dogId: dog!.id,
    availabilityId: bookingSlot.id, // ✅ Include this
  }),
});


    setIsSubmitting(false);
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
    <div className="flex flex-col gap-4 h-auto lg:h-[90vh] px-4 pb-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-y-6 lg:gap-6 flex-1">
        {/* Left Column - Dog Info */}
        <div className="col-span-1 bg-white shadow-lg rounded-lg p-4 flex flex-col">
          <div className="mb-4">
            <button
              className="text-lg text-[#0e62ae] font-semibold hover:underline"
              onClick={onBack}
            >
              ← Back to Dogs
            </button>
          </div>
          <div className="relative aspect-square w-full overflow-hidden rounded-lg">
            <img
              src={dog.dog_picture_url || '/images/default_dog.png'}
              alt={dog.dog_name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          <h3 className="text-xl font-bold mt-3">{dog.dog_name}</h3>
          <p className="text-gray-700">
            {dog.dog_breed} | Age: {dog.dog_age ?? 'Unknown'}
          </p>
          <p className="text-gray-600 mt-2">{dog.dog_bio}</p>
          <p className="text-gray-800 mt-2">
            <strong>Volunteer:</strong> {volunteerName || 'Unknown'}
          </p>
        </div>

        {/* Right Column - Availability */}
        <div className="col-span-2 bg-white shadow-lg rounded-lg p-4 max-h-[90vh] overflow-y-auto">
          <h3 className="text-xl font-semibold mb-4">Available Appointments</h3>
          {availability.length === 0 ? (
            <p className="text-gray-500">No availability at the moment.</p>
          ) : (
            <ul className="space-y-4 pr-1">
              {availability.map((slot) => (
                <li key={slot.id} className="border p-3 rounded-md shadow-sm">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div className="flex-1">
                      <p><strong>Date:</strong> {formatDate(slot.start_time)}</p>
                      <p><strong>Time:</strong> {formatTime(slot.start_time)} – {formatTime(slot.end_time)}</p>
                    </div>
                    <button
                      onClick={() => openBookingModal(slot)}
                      className="lg:self-start bg-[#0e62ae] text-white px-4 py-2 rounded hover:bg-blue-700 w-full lg:w-auto"
                    >
                      Book This Slot
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Booking Modal */}
      {showBookingModal && bookingSlot && (
        <div className="fixed top-0 left-0 lg:left-[256px] w-full lg:w-[calc(100vw-256px)] h-[100dvh] bg-black bg-opacity-50 z-50 flex items-center justify-center">

          <div className="bg-white p-6 rounded-md max-w-md w-full">
            {bookingStep === 'input' && (
              <>
                <h3 className="text-xl font-semibold mb-4">Request a Meeting</h3>
                <p><strong>Available Window:</strong><br />{formatDate(bookingSlot.start_time)}<br />{formatTime(bookingSlot.start_time)} – {formatTime(bookingSlot.end_time)}</p>
                <div className="mt-4">
                  <label className="block mb-1 font-semibold">Enter Start Time</label>
                  <input
                    type="text"
                    placeholder="e.g., 11am, 2:30 PM, 3:00pm"
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="border p-2 w-full"
                  />
                </div>
                {bookingFeedback && <p className="mt-2 text-sm text-red-600">{bookingFeedback}</p>}
                <div className="mt-6 flex justify-end space-x-2">
                  <button onClick={closeModal} className="bg-gray-400 text-white px-4 py-2 rounded">Cancel</button>
                  <button
                    onClick={handleNext}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Next
                  </button>
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
                  <button
                    onClick={() => setBookingStep('input')}
                    disabled={isSubmitting}
                    className="bg-gray-400 text-white px-4 py-2 rounded"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleBookingSubmitSummary}
                    disabled={isSubmitting}
                    className={`bg-blue-600 text-white px-4 py-2 rounded flex items-center justify-center ${
                      isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-700'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Processing...
                      </>
                    ) : (
                      'Submit'
                    )}
                  </button>
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
