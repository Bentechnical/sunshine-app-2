'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, ChevronDown, ChevronRight, Repeat, MapPin, Calendar } from 'lucide-react';
import { format, isFuture, parseISO } from 'date-fns';

interface AvailabilitySlot {
  id: number;
  volunteer_id: string;
  start_time: string;
  end_time: string;
  rrule?: string;
  recurrence_id?: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
}

interface VolunteerInfo {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  city?: string;
  postal_code?: string;
}

interface GroupedAvailability {
  volunteer: VolunteerInfo;
  totalSlots: number;
  futureSlots: number;
  nextAvailability?: string;
  recurringPatterns: RecurringPattern[];
  oneTimeSlots: AvailabilitySlot[];
}

interface RecurringPattern {
  recurrence_id: string;
  rrule?: string;
  slots: AvailabilitySlot[];
  patternDescription: string;
  futureCount: number;
}

export default function AdminAvailabilities() {
  const [groupedData, setGroupedData] = useState<GroupedAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedVolunteers, setExpandedVolunteers] = useState<Set<string>>(new Set());
  const [expandedPatterns, setExpandedPatterns] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'totalSlots' | 'nextAvailability' | 'city'>('name');
  const [showOnlyWithFutureSlots, setShowOnlyWithFutureSlots] = useState(true);

  useEffect(() => {
    loadAvailabilities();
  }, []);

  const loadAvailabilities = async () => {
    try {
      setLoading(true);

      // Fetch all availability data with volunteer info
      const response = await fetch('/api/admin/availabilities');
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch availabilities');
      }

      const processed = processAvailabilityData(result.data);
      setGroupedData(processed);
    } catch (error) {
      console.error('Error loading availabilities:', error);
    } finally {
      setLoading(false);
    }
  };

  const processAvailabilityData = (data: any[]): GroupedAvailability[] => {
    const volunteerMap = new Map<string, GroupedAvailability>();

    data.forEach((item) => {
      const volunteerId = item.volunteer_id;

      if (!volunteerMap.has(volunteerId)) {
        volunteerMap.set(volunteerId, {
          volunteer: {
            id: item.volunteer.id,
            first_name: item.volunteer.first_name,
            last_name: item.volunteer.last_name,
            email: item.volunteer.email,
            city: item.volunteer.city,
            postal_code: item.volunteer.postal_code,
          },
          totalSlots: 0,
          futureSlots: 0,
          recurringPatterns: [],
          oneTimeSlots: [],
        });
      }

      const grouped = volunteerMap.get(volunteerId)!;
      grouped.totalSlots++;

      const isFutureSlot = isFuture(parseISO(item.start_time));
      if (isFutureSlot) {
        grouped.futureSlots++;

        // Track next availability
        if (!grouped.nextAvailability || item.start_time < grouped.nextAvailability) {
          grouped.nextAvailability = item.start_time;
        }
      }

      // Group by recurrence pattern
      if (item.recurrence_id) {
        // Create a pattern key based on day of week and time (not recurrence_id)
        const patternKey = generatePatternKey(item);
        let pattern = grouped.recurringPatterns.find(p => p.recurrence_id === patternKey);

        if (!pattern) {
          pattern = {
            recurrence_id: patternKey, // Use pattern key instead of actual recurrence_id
            rrule: item.rrule,
            slots: [],
            patternDescription: generatePatternDescription(item),
            futureCount: 0,
          };
          grouped.recurringPatterns.push(pattern);
        }
        pattern.slots.push(item);
        if (isFutureSlot) pattern.futureCount++;
      } else {
        grouped.oneTimeSlots.push(item);
      }
    });

    // Sort recurring patterns by day of week (Monday=1, Sunday=7)
    volunteerMap.forEach(grouped => {
      grouped.recurringPatterns.sort((a, b) => {
        const dayA = parseInt(a.recurrence_id.split('-')[0]);
        const dayB = parseInt(b.recurrence_id.split('-')[0]);
        if (dayA !== dayB) return dayA - dayB;

        // If same day, sort by start time
        const timeA = a.recurrence_id.split('-')[1];
        const timeB = b.recurrence_id.split('-')[1];
        return timeA.localeCompare(timeB);
      });
    });

    return Array.from(volunteerMap.values());
  };

  const generatePatternKey = (slot: AvailabilitySlot): string => {
    // Use UTC to avoid DST issues when grouping patterns
    const date = parseISO(slot.start_time);
    const endDate = parseISO(slot.end_time);

    // Extract UTC components to avoid DST shifts
    const startTimeUTC = date.getUTCHours().toString().padStart(2, '0') + ':' + date.getUTCMinutes().toString().padStart(2, '0');
    const endTimeUTC = endDate.getUTCHours().toString().padStart(2, '0') + ':' + endDate.getUTCMinutes().toString().padStart(2, '0');
    const dayOfWeekUTC = date.getUTCDay() === 0 ? 7 : date.getUTCDay(); // Convert Sunday(0) to 7, keep 1-6 as is

    // Create a unique key based on day of week and time (UTC-based to avoid DST grouping issues)
    return `${dayOfWeekUTC}-${startTimeUTC}-${endTimeUTC}`;
  };

  const generatePatternDescription = (slot: AvailabilitySlot): string => {
    const startTime = format(parseISO(slot.start_time), 'h:mm a');
    const endTime = format(parseISO(slot.end_time), 'h:mm a');
    const dayOfWeek = format(parseISO(slot.start_time), 'EEEE');

    // Simple pattern description - could be enhanced with rrule parsing
    return `${dayOfWeek}s ${startTime}-${endTime}`;
  };

  const toggleExpanded = (volunteerId: string) => {
    setExpandedVolunteers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(volunteerId)) {
        newSet.delete(volunteerId);
      } else {
        newSet.add(volunteerId);
      }
      return newSet;
    });
  };

  const togglePattern = (patternId: string) => {
    setExpandedPatterns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(patternId)) {
        newSet.delete(patternId);
      } else {
        newSet.add(patternId);
      }
      return newSet;
    });
  };

  const filteredAndSortedData = () => {
    let filtered = groupedData;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(group =>
        group.volunteer.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.volunteer.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.volunteer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.volunteer.city?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter to only show volunteers with future slots
    if (showOnlyWithFutureSlots) {
      filtered = filtered.filter(group => group.futureSlots > 0);
    }

    // Sort the data
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return `${a.volunteer.last_name} ${a.volunteer.first_name}`.localeCompare(
            `${b.volunteer.last_name} ${b.volunteer.first_name}`
          );
        case 'totalSlots':
          return b.totalSlots - a.totalSlots;
        case 'nextAvailability':
          if (!a.nextAvailability) return 1;
          if (!b.nextAvailability) return -1;
          return a.nextAvailability.localeCompare(b.nextAvailability);
        case 'city':
          return (a.volunteer.city || '').localeCompare(b.volunteer.city || '');
        default:
          return 0;
      }
    });

    return filtered;
  };

  const renderVolunteerRow = (group: GroupedAvailability) => {
    const isExpanded = expandedVolunteers.has(group.volunteer.id);

    return (
      <div key={group.volunteer.id} className="border border-gray-200 rounded-lg mb-3">
        {/* Collapsed Row */}
        <div
          className="p-4 cursor-pointer hover:bg-gray-50"
          onClick={() => toggleExpanded(group.volunteer.id)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6 flex-1">
              {/* Volunteer Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-3">
                  <div className="font-medium text-gray-900">
                    {group.volunteer.first_name} {group.volunteer.last_name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {group.volunteer.email}
                  </div>
                  {group.volunteer.city && (
                    <div className="flex items-center text-sm text-gray-500">
                      <MapPin className="w-3 h-3 mr-1" />
                      {group.volunteer.city}
                      {group.volunteer.postal_code && (
                        <span className="ml-1">({group.volunteer.postal_code})</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>

            <div className="flex items-center">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </div>
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="border-t border-gray-200 p-4 bg-gray-50">
            <div className="space-y-4">
              {/* Recurring Patterns */}
              {group.recurringPatterns.filter(pattern => pattern.futureCount > 0).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                    <Repeat className="w-4 h-4 mr-2" />
                    Recurring Patterns ({group.recurringPatterns.filter(pattern => pattern.futureCount > 0).length})
                  </h4>
                  <div className="space-y-2">
                    {group.recurringPatterns.filter(pattern => pattern.futureCount > 0).map(pattern => {
                      const patternKey = `${group.volunteer.id}-${pattern.recurrence_id}`;
                      const isPatternExpanded = expandedPatterns.has(patternKey);
                      return (
                        <div key={pattern.recurrence_id} className="bg-white rounded border">
                          <div
                            className="p-3 cursor-pointer hover:bg-gray-50"
                            onClick={() => togglePattern(patternKey)}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex-1">
                                <div className="font-medium text-sm">{pattern.patternDescription}</div>
                                <div className="text-xs text-gray-500">
                                  {pattern.futureCount} future instances • {pattern.slots.length} total
                                </div>
                              </div>
                              <div className="flex items-center">
                                {isPatternExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-400" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Expanded Pattern Details */}
                          {isPatternExpanded && (
                            <div className="border-t border-gray-200 p-3 bg-gray-50">
                              <div className="space-y-1">
                                {pattern.slots
                                  .filter(slot => isFuture(parseISO(slot.start_time)))
                                  .sort((a, b) => a.start_time.localeCompare(b.start_time))
                                  .map((slot) => (
                                    <div key={slot.id} className="text-sm text-gray-600 flex justify-between">
                                      <span>{format(parseISO(slot.start_time), 'EEE MMM d, yyyy')}</span>
                                      <span>{format(parseISO(slot.start_time), 'h:mm a')} - {format(parseISO(slot.end_time), 'h:mm a')}</span>
                                    </div>
                                  ))}
                                {pattern.slots.filter(slot => isFuture(parseISO(slot.start_time))).length === 0 && (
                                  <div className="text-sm text-gray-500 italic">No future instances</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* One-time Slots */}
              {group.oneTimeSlots.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                    <Calendar className="w-4 h-4 mr-2" />
                    Individual Slots ({group.oneTimeSlots.filter(slot => isFuture(parseISO(slot.start_time))).length} future)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {group.oneTimeSlots
                      .filter(slot => isFuture(parseISO(slot.start_time)))
                      .slice(0, 6) // Show first 6 future slots
                      .map(slot => (
                        <div key={slot.id} className="bg-white p-2 rounded border text-sm">
                          <div className="font-medium">
                            {format(parseISO(slot.start_time), 'MMM d, yyyy')}
                          </div>
                          <div className="text-gray-600">
                            {format(parseISO(slot.start_time), 'h:mm a')} - {format(parseISO(slot.end_time), 'h:mm a')}
                          </div>
                        </div>
                      ))}
                    {group.oneTimeSlots.filter(slot => isFuture(parseISO(slot.start_time))).length > 6 && (
                      <div className="bg-gray-100 p-2 rounded border text-sm text-gray-600 flex items-center justify-center">
                        +{group.oneTimeSlots.filter(slot => isFuture(parseISO(slot.start_time))).length - 6} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Volunteer Availabilities</h2>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search volunteers by name, email, or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex items-center space-x-4">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="name">Sort by Name</option>
              <option value="totalSlots">Sort by Total Slots</option>
              <option value="nextAvailability">Sort by Next Available</option>
              <option value="city">Sort by City</option>
            </select>

            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={showOnlyWithFutureSlots}
                onChange={(e) => setShowOnlyWithFutureSlots(e.target.checked)}
                className="mr-2"
              />
              Future availability only
            </label>

            <Button onClick={loadAvailabilities} variant="outline" size="sm">
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        {!loading && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">{filteredAndSortedData().length}</div>
                <div className="text-sm text-gray-600">Volunteers</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {filteredAndSortedData().reduce((sum, group) => sum + group.futureSlots, 0)}
                </div>
                <div className="text-sm text-gray-600">Future Slots</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {filteredAndSortedData().reduce((sum, group) => sum + group.recurringPatterns.length, 0)}
                </div>
                <div className="text-sm text-gray-600">Recurring Patterns</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  {filteredAndSortedData().filter(group => group.nextAvailability).length}
                </div>
                <div className="text-sm text-gray-600">Available This Week</div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading availabilities...</span>
        </div>
      )}

      {/* Data Display */}
      {!loading && (
        <div className="space-y-3">
          {filteredAndSortedData().length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No availabilities found matching your criteria.</p>
            </div>
          ) : (
            filteredAndSortedData().map(renderVolunteerRow)
          )}
        </div>
      )}
    </div>
  );
}