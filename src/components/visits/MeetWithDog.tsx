'use client';

import React from 'react';
import DogDirectory from '../dog/DogDirectory';
import DogProfile from '../dog/DogProfile';

interface MeetWithDogProps {
  selectedDogId: string | null;
  setSelectedDogId: React.Dispatch<React.SetStateAction<string | null>>;
}

export default function MeetWithDog({ selectedDogId, setSelectedDogId }: MeetWithDogProps) {
  console.log('MeetWithDog props:', { selectedDogId, setSelectedDogId });
  return (
    <div>
      {selectedDogId ? (
        <DogProfile dogId={selectedDogId} onBack={() => setSelectedDogId(null)} />
      ) : (
        <DogDirectory onSelectDog={setSelectedDogId} />
      )}
    </div>
  );
}
