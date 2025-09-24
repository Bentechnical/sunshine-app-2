'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Clock } from 'lucide-react';

interface CustomTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  minTime?: string; // Minimum selectable time (e.g., "10:00")
  maxTime?: string; // Maximum selectable time (e.g., "20:00")
}

export default function CustomTimePicker({ value, onChange, className = '', minTime, maxTime }: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownListRef = useRef<HTMLDivElement>(null);

  // Convert time string to minutes for comparison
  const timeToMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Generate time options in 15-minute increments (9 AM to 9 PM)
  const generateTimeOptions = () => {
    const options = [];
    const minMinutes = minTime ? timeToMinutes(minTime) : 9 * 60; // Default 9 AM
    const maxMinutes = maxTime ? timeToMinutes(maxTime) : 21 * 60; // Default 9 PM

    for (let hour = 9; hour <= 21; hour++) { // 9 AM (9) to 9 PM (21)
      for (let minute = 0; minute < 60; minute += 15) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const timeInMinutes = timeToMinutes(timeString);

        // Only include times within the specified range
        if (timeInMinutes >= minMinutes && timeInMinutes <= maxMinutes) {
          const displayTime = formatTimeDisplay(timeString);
          options.push({ value: timeString, display: displayTime });
        }
      }
    }
    return options;
  };

  // Format time for display (12-hour format)
  const formatTimeDisplay = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const timeOptions = generateTimeOptions();
  const selectedOption = timeOptions.find(option => option.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  // Scroll to selected option when dropdown opens
  useEffect(() => {
    if (isOpen && dropdownListRef.current && value) {
      const selectedButton = dropdownListRef.current.querySelector(`[data-value="${value}"]`) as HTMLElement;
      if (selectedButton) {
        selectedButton.scrollIntoView({
          behavior: 'auto',
          block: 'center'
        });
      }
    }
  }, [isOpen, value]);

  const handleSelect = (timeValue: string) => {
    onChange(timeValue);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors bg-white flex items-center justify-between text-left min-h-[40px]"
      >
        <span className="flex items-center gap-1 min-w-0">
          <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm truncate">
            {selectedOption ? selectedOption.display : 'Select time'}
          </span>
        </span>
        <ChevronDown className={`w-3 h-3 sm:w-4 sm:h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg overflow-y-auto" style={{ height: '200px' }} ref={dropdownListRef}>
          <div className="py-1">
            {timeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                data-value={option.value}
                onClick={() => handleSelect(option.value)}
                className={`w-full px-3 py-3 sm:py-2 text-left hover:bg-blue-50 hover:text-blue-600 transition-colors text-sm ${
                  option.value === value ? 'bg-blue-100 text-blue-600' : 'text-gray-900'
                }`}
              >
                {option.display}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}