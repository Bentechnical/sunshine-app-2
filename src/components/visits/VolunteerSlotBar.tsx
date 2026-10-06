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
  // The numeric label is redundant wherever a StaffingStatus line already spells the
  // counts out in words — the segments themselves encode confirmed/min/max.
  showLabel?: boolean;
  // Admin/PD only: below the minimum AND close enough to matter, so the bar reads as
  // an alert rather than as progress.
  urgent?: boolean;
}

export function VolunteerSlotBar({ confirmed, min, max, showMinimum = false, showLabel = true, urgent = false }: SlotBarProps) {
  const state = getStaffingState(confirmed, min, max);
  const fillClass =
    state !== 'below_min' ? 'bg-green-500' :
    urgent               ? 'bg-amber-500' :
                           'bg-blue-500';
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
      {showLabel && <span className="text-xs text-gray-600 whitespace-nowrap">{label}</span>}
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
  // Volunteers: while anyone is waitlisted, open spots are held for the waitlist.
  // Admin/PD: an open spot with anyone waiting is a promotion the PD has to make by hand.
  waitlisted?: number;
  // Admin/PD: below the minimum and inside the urgent window, so the shortfall needs chasing
  // now rather than being the normal state of a visit that is still months out.
  urgent?: boolean;
  // Bumps the line from supporting text to the card's headline verdict.
  prominent?: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Admin/PD colour contract: green means nothing to do, amber means the PD has to act,
// grey means not yet actionable. A card should only ever show one of these.
const ADMIN_TONE = {
  ok: 'text-green-700',
  act: 'text-amber-700',
  idle: 'text-gray-500',
};

// Orgs never see the minimum itself, only softer wording around it.
export function StaffingStatus({ confirmed, min, max, audience, registered = false, waitlisted = 0, urgent = false, prominent = false }: StaffingStatusProps) {
  const state = getStaffingState(confirmed, min, max);
  const open = max - confirmed;
  const size = prominent ? 'text-sm' : 'text-xs';

  if (audience === 'admin') {
    const line = (tone: string, text: string, icon: 'check' | 'dot' | null) => (
      <span className={`inline-flex items-center gap-1.5 ${size} font-semibold ${tone}`}>
        {icon === 'check' && <Check size={prominent ? 14 : 12} className="shrink-0" />}
        {icon === 'dot' && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
        {text}
      </span>
    );

    // A spot open with someone waiting outranks the visit's own health: the visit may well
    // be going ahead, but there is still a promotion sitting in the PD's queue.
    if (waitlisted > 0 && state !== 'full') {
      return line(ADMIN_TONE.act, `Promote from waitlist · ${waitlisted} waiting`, 'dot');
    }
    if (state === 'below_min') {
      const needed = min - confirmed;
      return urgent
        ? line(ADMIN_TONE.act, `Needs ${plural(needed, 'more dog')} to go ahead`, 'dot')
        : line(ADMIN_TONE.idle, `Needs ${plural(needed, 'more dog')} to go ahead`, null);
    }
    if (state === 'full') {
      return line(ADMIN_TONE.ok, waitlisted > 0 ? `Full · ${waitlisted} on waitlist` : `Full · ${plural(confirmed, 'dog')}`, 'check');
    }
    return line(ADMIN_TONE.ok, `Going ahead · ${plural(open, 'spot')} open`, 'check');
  }

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
        {registered ? 'Full' : 'Full · join the waitlist'}
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
