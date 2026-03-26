'use client';

import React from 'react';
import DogDirectory from '../dog/DogDirectory';
import DogProfile from '../dog/DogProfile';

interface MeetWithDogProps {
  selectedDogId: string | null;
  setSelectedDogId: React.Dispatch<React.SetStateAction<string | null>>;
  onGoToChat: () => void;
}

export default function MeetWithDog({ selectedDogId, setSelectedDogId, onGoToChat }: MeetWithDogProps) {
  const handleSelectDog = (id: string) => {
    setSelectedDogId(id);
  };

  return (
    <div>
      {selectedDogId ? (
        <DogProfile
          key={selectedDogId}
          dogId={selectedDogId}
          onBack={() => setSelectedDogId(null)}
          onGoToChat={onGoToChat}
        />
      ) : (
        <DogDirectory onSelectDog={handleSelectDog} />
      )}
    </div>
  );
}
