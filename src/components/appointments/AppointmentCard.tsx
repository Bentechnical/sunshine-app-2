// src/components/appointments/AppointmentCard.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Mail, Dog, CheckCircle, XCircle, AlertCircle, MapPin, Loader2 } from 'lucide-react';

export interface Appointment {
  id: number;
  individual_id: string;
  volunteer_id: string;
  start_time: string;
  end_time: string;
  status: string;
  cancellation_reason?: string;
  availability_id?: number;
  volunteer?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    city?: string;
    dogs?: {
      id: number;
      dog_name: string;
      dog_picture_url: string;
      dog_breed?: string;
    }[];
  };
  individual?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    physical_address?: string;
    city?: string;
    visit_recipient_type?: string;
    dependant_name?: string;
    relationship_to_recipient?: string;
  };
}

interface AppointmentCardProps {
  appointment: Appointment;
  role: string;
  onApprove: (appointmentId: number) => void;
  onDecline: (appointmentId: number) => void;
  onCancelClick: (appointment: Appointment) => void;
  cancelButtonDisabled: (appointment: Appointment) => boolean;
  isProcessing?: boolean;
}

function formatDate(timeStr: string): string {
  return new Date(timeStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(timeStr: string): string {
  return new Date(timeStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'confirmed':
      return {
        label: 'Confirmed',
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: CheckCircle,
        iconColor: 'text-green-600'
      };
    case 'pending':
      return {
        label: 'Pending',
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        icon: AlertCircle,
        iconColor: 'text-yellow-600'
      };
    case 'canceled':
      return {
        label: 'Canceled',
        color: 'bg-red-100 text-red-800 border-red-200',
        icon: XCircle,
        iconColor: 'text-red-600'
      };
    default:
      return {
        label: status,
        color: 'bg-gray-100 text-gray-800 border-gray-200',
        icon: AlertCircle,
        iconColor: 'text-gray-600'
      };
  }
}

const AppointmentCard: React.FC<AppointmentCardProps> = ({
  appointment,
  role,
  onApprove,
  onDecline,
  onCancelClick,
  cancelButtonDisabled,
  isProcessing = false,
}) => {
  // State for slide-up animation when card is removed
  const [isRemoving, setIsRemoving] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [hasProcessed, setHasProcessed] = useState(false);

  // Handle card removal animation - only when processing is complete and status changed
  useEffect(() => {
    if (isProcessing && !hasProcessed) {
      setHasProcessed(true);
    }
    
    // Only animate removal if we were processing and now we're not (meaning action completed)
    if (!isProcessing && hasProcessed && !isRemoving) {
      // Add a delay to show the loading state clearly
      const timer = setTimeout(() => {
        setIsRemoving(true);
        // Start slide-up animation after showing loading state
        setTimeout(() => {
          setIsVisible(false);
        }, 300); // Longer delay for better UX
      }, 500); // Show completion state briefly before removal
      
      return () => clearTimeout(timer);
    }
  }, [isProcessing, hasProcessed, isRemoving]);

  // Reset animation state when appointment changes
  useEffect(() => {
    setHasProcessed(false);
    setIsRemoving(false);
    setIsVisible(true);
  }, [appointment.id]);

  let displayName = '';
  let dogName: string | undefined = undefined;
  let dogPictureUrl: string | undefined = undefined;
  let dogBreed: string | undefined = undefined;
  let location: string | undefined = undefined;
  let dependantInfo: string | undefined = undefined;

  const isPast = new Date(appointment.end_time) <= new Date();
  const statusConfig = getStatusConfig(appointment.status);
  const StatusIcon = statusConfig.icon;

  if (role === 'individual') {
    const volunteer = appointment.volunteer;
    if (volunteer) {
      displayName = volunteer.first_name;
      if (volunteer.dogs) {
        // Handle both array and single object formats
        const dog = Array.isArray(volunteer.dogs) ? volunteer.dogs[0] : volunteer.dogs;
        if (dog) {
          dogName = dog.dog_name;
          dogPictureUrl = dog.dog_picture_url;
          dogBreed = dog.dog_breed;

        }
      }
    }
    // For individuals, show their own location
    const individual = appointment.individual;
    if (individual?.physical_address) {
      location = individual.physical_address;
    } else if (individual?.city) {
      location = individual.city;
    }
    // Check for dependant info
    if (individual?.visit_recipient_type === 'other' && individual?.dependant_name) {
      dependantInfo = `${individual.dependant_name} (${individual.relationship_to_recipient || 'dependant'})`;
    }
  } else if (role === 'volunteer' || role === 'admin') {
    const requester = appointment.individual;
    if (requester) {
      displayName = `${requester.first_name} ${requester.last_name}`;
      // For volunteers, show the individual's location
      if (requester.physical_address) {
        location = requester.physical_address;
      } else if (requester.city) {
        location = requester.city;
      }
      // Check for dependant info
      if (requester.visit_recipient_type === 'other' && requester.dependant_name) {
        dependantInfo = `${requester.dependant_name} (${requester.relationship_to_recipient || 'dependant'})`;
      }
    }
    if (appointment.volunteer?.dogs) {
      // Handle both array and single object formats
      const dog = Array.isArray(appointment.volunteer.dogs) ? appointment.volunteer.dogs[0] : appointment.volunteer.dogs;
      if (dog) {
        dogName = dog.dog_name;
        dogPictureUrl = dog.dog_picture_url;
        dogBreed = dog.dog_breed;
        
      }
    }
  }

  return (
    <div 
      className={`bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all duration-500 ease-in-out overflow-hidden relative ${
        isRemoving ? 'transform -translate-y-2 opacity-0 scale-95' : 'transform translate-y-0 opacity-100 scale-100'
      } ${!isVisible ? 'hidden' : ''}`}
    >
      {/* Loading overlay */}
      {isProcessing && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">Processing...</p>
          </div>
        </div>
      )}
      
      {/* Success overlay - briefly show when processing completes */}
      {!isProcessing && hasProcessed && !isRemoving && (
        <div className="absolute inset-0 bg-green-50/90 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
          <div className="text-center">
            <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-green-700">Success!</p>
          </div>
        </div>
      )}
      {/* Header with status */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${statusConfig.color}`}>
              <StatusIcon className={`w-4 h-4 mr-1.5 ${statusConfig.iconColor}`} />
              {statusConfig.label}
            </div>
            {isPast && (
              <span className="text-sm text-gray-500">Past</span>
            )}
          </div>

        </div>
      </div>

      {/* Main content */}
      <div className="px-6 py-4">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Dog image - shown first on mobile, right side on desktop */}
          {dogPictureUrl && (
            <div className="lg:order-2 lg:w-48 lg:flex-shrink-0">
              <div className="relative aspect-square w-40 h-40 mx-auto lg:w-full lg:h-auto overflow-hidden rounded-lg border border-gray-200">
                <img
                  src={dogPictureUrl || '/images/default_dog.png'}
                  alt={dogName || 'Dog'}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/images/default_dog.png';
                  }}
                />
              </div>
            </div>
          )}

          {/* Left column - Details */}
          <div className="flex-1 lg:order-1">
            {/* Date and Time */}
            <div className="flex items-center space-x-4 mb-4">
              <div className="flex items-center text-gray-600">
                <Calendar className="w-4 h-4 mr-2" />
                <span className="font-medium text-sm sm:text-base">{formatDate(appointment.start_time)}</span>
              </div>
              <div className="flex items-center text-gray-600">
                <Clock className="w-4 h-4 mr-2" />
                <span className="font-medium text-sm sm:text-base">{formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}</span>
              </div>
            </div>

            {/* Dog info */}
            {dogName && (
              <div className="flex items-center space-x-3 mb-4 p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center text-blue-800">
                  <div>
                    <span className="font-medium">{dogName}</span>
                    {dogBreed && (
                      <span className="text-sm text-blue-600 ml-2">({dogBreed})</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Contact info */}
            {displayName && !isPast && (
              <div className="space-y-2 mb-4">
                <div className="flex items-center text-gray-700">
                  <User className="w-4 h-4 mr-2 text-gray-500" />
                  <span className="font-medium">{role === 'individual' ? 'Volunteer' : 'Requester'}:</span>
                  <span className="ml-2">{displayName}</span>
                </div>
                {dependantInfo && (
                  <div className="flex items-center text-gray-600">
                    <User className="w-4 h-4 mr-2 text-gray-500" />
                    <span className="text-sm">Visit for: {dependantInfo}</span>
                  </div>
                )}
              </div>
            )}

            {/* Location info */}
            {location && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center text-gray-700">
                  <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                  <div>
                    <span className="text-sm font-medium text-gray-600">
                      {role === 'individual' ? 'Your Location' : 'Requester\'s Location'}:
                    </span>
                    <span className="ml-2 text-sm">{location}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Cancellation reason */}
            {appointment.status === 'canceled' && appointment.cancellation_reason && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">
                  <strong>Cancellation Reason:</strong> {appointment.cancellation_reason}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-gray-100">
              {role === 'individual' && !isPast && (
                <button
                  onClick={() => onCancelClick(appointment)}
                  disabled={isProcessing}
                  className={`w-full sm:w-auto px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center ${
                    isProcessing
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    appointment.status === 'pending' ? 'Cancel Request' : 'Cancel Appointment'
                  )}
                </button>
              )}
              
              {role === 'volunteer' && appointment.status === 'pending' && !isPast && (
                <>
                  <button
                    onClick={() => onApprove(appointment.id)}
                    disabled={isProcessing}
                    className={`w-full sm:w-auto px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center ${
                      isProcessing
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Confirm Visit
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => onDecline(appointment.id)}
                    disabled={isProcessing}
                    className={`w-full sm:w-auto px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center ${
                      isProcessing
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 mr-2" />
                        Deny Request
                      </>
                    )}
                  </button>
                </>
              )}
              
              {role === 'volunteer' && appointment.status === 'confirmed' && !isPast && (
                <button
                  onClick={() => onCancelClick(appointment)}
                  disabled={cancelButtonDisabled(appointment) || isProcessing}
                  className={`w-full sm:w-auto px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center ${
                    cancelButtonDisabled(appointment) || isProcessing
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancel Appointment
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppointmentCard;
