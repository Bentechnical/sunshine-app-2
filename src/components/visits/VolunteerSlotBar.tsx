import { Check } from 'lucide-react';
import { getStaffingState } from '@/utils/visitSlots';

// Above this many slots, segments get too thin to read; fall back to a continuous bar.
const MAX_SEGMENTS = 10;

interface SlotBarProps {
  confirmed: number;
  min: number;
  max: number;
  // Admin/PD views show where the minimum sits; orgs and volunteers never see it.
  showMinimum?: boolean;
}

export function VolunteerSlotBar({ confirmed, min, max, showMinimum = false }: SlotBarProps) {
  const state = getStaffingState(confirmed, min, max);
  const fillClass = state === 'below_min' ? 'bg-blue-500' : 'bg-green-500';
  const hasRange = min < max;
  const total = Math.max(max, confirmed);

  const label = showMinimum && hasRange
    ? `${confirmed}/${max} · min ${min}`
    : `${confirmed}/${max} spots filled`;

  return (
    <div className="flex items-center gap-2">
      {total <= MAX_SEGMENTS ? (
        <div className="flex-1 flex items-center gap-1">
          {Array.from({ length: total }).map((_, i) => {
            const filled = i < confirmed;
            const optional = i >= min;
            const emptyClass = optional ? 'bg-gray-100 ring-1 ring-inset ring-gray-200' : 'bg-gray-200';
            return (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full transition-colors ${filled ? fillClass : emptyClass} ${
                  showMinimum && hasRange && i === min ? 'ml-1.5' : ''
                }`}
              />
            );
          })}
        </div>
      ) : (
        <div className="relative flex-1 h-1.5 bg-gray-200 rounded-full">
          <div
            className={`h-full rounded-full transition-all ${fillClass}`}
            style={{ width: `${Math.min(100, (confirmed / max) * 100)}%` }}
          />
          {showMinimum && hasRange && (
            <div
              className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-gray-500 rounded-full"
              style={{ left: `${(min / max) * 100}%` }}
            />
          )}
        </div>
      )}
      <span className="text-xs text-gray-600 whitespace-nowrap">{label}</span>
    </div>
  );
}

type StaffingAudience = 'admin' | 'volunteer' | 'org';

interface StaffingStatusProps {
  confirmed: number;
  min: number;
  max: number;
  audience: StaffingAudience;
  // Volunteer already on this visit (confirmed or waitlisted): don't prompt them to join the waitlist.
  registered?: boolean;
  // Volunteers only: while anyone is waitlisted, open spots are held for the waitlist.
  waitlisted?: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Orgs never see the minimum itself, only softer wording around it.
export function StaffingStatus({ confirmed, min, max, audience, registered = false, waitlisted = 0 }: StaffingStatusProps) {
  const state = getStaffingState(confirmed, min, max);
  const open = max - confirmed;

  if (audience === 'volunteer' && waitlisted > 0 && state !== 'full') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
        {registered ? 'Waitlist open' : 'Waitlist open · join the waitlist'}
      </span>
    );
  }

  if (state === 'below_min') {
    const needed = min - confirmed;
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
        {audience === 'org'
          ? `Looking for ${plural(needed, 'more volunteer')}`
          : `Needs ${needed} more to go ahead`}
      </span>
    );
  }

  if (state === 'full') {
    if (audience === 'org') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
          <Check size={12} className="shrink-0" /> Fully booked
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500">
        {audience === 'volunteer' && !registered ? 'Full · join the waitlist' : 'Full'}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
      <Check size={12} className="shrink-0" />
      Going ahead · {plural(open, 'spot')} {audience === 'volunteer' ? 'left' : 'open'}
    </span>
  );
}
