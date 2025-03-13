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
    const [availability, setAvailability] = useState<Availability[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useUser(); // currently logged-in user

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

            // Use the volunteer_id from the dog's record to fetch availability
            const volunteerId = dogData.volunteer_id;
            const { data: availData, error: availError } = await supabase
                .from('appointment_availability')
                .select('*')
                .eq('volunteer_id', volunteerId)
                .eq('is_hidden', false)  // Only show slots that are not hidden
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

    // Handle booking a slot by prompting the user for a 1-hour time slot within the availability window.
    async function handleBookSlot(slot: Availability) {
        // Prompt the user to enter a desired start time (HH:MM format)
        const userSelectedStart = prompt(
            `Enter the start time (HH:MM, 24-hour format) for a 1-hour booking within:\n${new Date(
                slot.start_time
            ).toLocaleTimeString()} - ${new Date(slot.end_time).toLocaleTimeString()}`
        );
        if (!userSelectedStart) return;

        const [hourStr, minuteStr] = userSelectedStart.split(':');
        const hour = parseInt(hourStr, 10);
        const minute = minuteStr ? parseInt(minuteStr, 10) : 0;

        // Create a booking start time using the date from slot.start_time with user-selected time.
        const slotStartDate = new Date(slot.start_time);
        const bookingStart = new Date(slotStartDate);
        bookingStart.setHours(hour, minute, 0, 0);

        // Booking duration is fixed to 1 hour.
        const bookingEnd = new Date(bookingStart.getTime() + 60 * 60 * 1000);

        // Validate the booking is within the availability window.
        if (
            bookingStart < new Date(slot.start_time) ||
            bookingEnd > new Date(slot.end_time)
        ) {
            alert('Selected time is outside the availability window.');
            return;
        }

        if (!user) {
            alert('You must be logged in as an individual to book a slot.');
            return;
        }

        // Insert a new appointment with status "pending"
        const { data, error } = await supabase
            .from('appointments')
            .insert([
                {
                    individual_id: user.id,
                    volunteer_id: slot.volunteer_id,
                    availability_id: slot.id,  // include the availability slot's ID here
                    start_time: bookingStart.toISOString(),
                    end_time: bookingEnd.toISOString(),
                    status: 'pending',
                },
            ])
            .select();

        if (error) {
            console.error('Error booking appointment:', error);
            alert('Failed to book appointment.');
            return;
        }

        alert('Your booking request has been submitted!');

        // Instead of deleting, update the availability row to hide it.
        const { error: updateError } = await supabase
            .from('appointment_availability')
            .update({ is_hidden: true })
            .eq('id', slot.id);

        if (updateError) {
            console.error('Error updating availability:', updateError);
        }

        // Update the local state to hide the booked slot.
        setAvailability((prev) => prev.filter((s) => s.id !== slot.id));
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
                <p className="text-gray-700">{dog.dog_breed} | Age: {dog.dog_age || 'Unknown'}</p>
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
                                <strong>Start:</strong> {new Date(slot.start_time).toLocaleString()}
                            </p>
                            <p>
                                <strong>End:</strong> {new Date(slot.end_time).toLocaleString()}
                            </p>
                            <button
                                className="bg-blue-600 text-white px-4 py-2 rounded mt-2"
                                onClick={() => handleBookSlot(slot)}
                            >
                                Book This Slot
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
