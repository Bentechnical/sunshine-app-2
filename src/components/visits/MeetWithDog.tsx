'use client';

import React, { useState } from 'react';
import DogDirectory from '../dog/DogDirectory';
import DogProfile from '../dog/DogProfile';

export default function MeetWithDog() {
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);

  return (
    <div>
      {selectedDogId ? (
        <DogProfile
          key={selectedDogId}
          dogId={selectedDogId}
          onBack={() => setSelectedDogId(null)}
        />
      ) : (
        <DogDirectory onSelectDog={(id) => setSelectedDogId(id)} />
      )}
    </div>
  );
}
