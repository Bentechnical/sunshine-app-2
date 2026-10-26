// src/components/admin/AdminActivityFeed.tsx
// "Recent activity" — who signed up and who cancelled, across the visits you're responsible for.
//
// This replaces something PDs lost in the move off spreadsheets. On a sheet, sign-ups were ambient:
// you opened it and saw movement. In the app the same facts were real but buried one click inside
// each visit, so noticing a cancellation meant opening every visit and hoping to spot it. PD
// testing named this as the biggest piece of missing visibility.
//
// So this is deliberately an *awareness* surface, not a work queue — "what moved", not "what you
// must do". Visits needing action already have their own section above, and duplicating them here
// would make both easier to ignore.
//
// Grouped by day rather than carrying unread state. "Today / Yesterday / Tuesday" answers "what's
// new since I last looked" well enough to not be worth a per-user `last_seen` column, and it reads
// correctly whether someone checks hourly or weekly.

'use client';

import { useEffect, useState } from 'react';
import { Activity, ChevronRight, UserMinus, UserPlus, ArrowUp, Clock, CalendarX } from 'lucide-react';

const MAX_ROWS = 12;

type EventType =
  | 'signed_up' | 'waitlisted' | 'promoted'
  | 'withdrew' | 'removed_by_staff' | 'visit_cancelled';

interface ActivityEvent {
  id: number;
  eventType: EventType;
  createdAt: string;
  volunteerName: string;
  actorName: string | null;
  byStaff: boolean;
  isOwnAction: boolean;
  visit: {
    id: number;
    label: string;
    date: string;
    confirmed: number;
    min: number;
    max: number;
    belowMin: boolean;
  } | null;
}

interface Props {
  onOpenVisit: (id: number) => void;
}

const EVENT_STYLE: Record<EventType, { icon: typeof UserPlus; tone: string }> = {
  signed_up:        { icon: UserPlus,  tone: 'text-green-600' },
  waitlisted:       { icon: Clock,     tone: 'text-amber-600' },
  promoted:         { icon: ArrowUp,   tone: 'text-blue-600' },
  withdrew:         { icon: UserMinus, tone: 'text-red-500' },
  removed_by_staff: { icon: UserMinus, tone: 'text-red-500' },
  visit_cancelled:  { icon: CalendarX, tone: 'text-gray-500' },
};

/**
 * Phrased so the subject of the sentence is the person it happened to, except where staff acted —
 * there the actor leads, because "who did this" is the thing a PD needs to see. That distinction
 * is only expressible because the events table records `actor_id` separately from `volunteer_id`.
 */
function describe(e: ActivityEvent): string {
  const who = e.volunteerName;
  switch (e.eventType) {
    case 'signed_up':
      return e.byStaff ? `${e.actorName ?? 'Staff'} added ${who}` : `${who} signed up`;
    case 'waitlisted':
      return e.byStaff ? `${e.actorName ?? 'Staff'} waitlisted ${who}` : `${who} joined the waitlist`;
    case 'promoted':
      return `${who} moved off the waitlist`;
    case 'withdrew':
      return `${who} withdrew`;
    case 'removed_by_staff':
      return `${e.actorName ?? 'Staff'} removed ${who}`;
    case 'visit_cancelled':
      return `${who} was released — visit cancelled`;
    default:
      return who;
  }
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-CA', { weekday: 'long' });
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

function visitDateLabel(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export default function AdminActivityFeed({ onOpenVisit }: Props) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [days, setDays] = useState(7);
  const [showAll, setShowAll] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/activity?days=7')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(json => {
        if (cancelled) return;
        setEvents(json.events ?? []);
        setDays(json.days ?? 7);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (failed) return null;

  const visible = showAll ? (events ?? []) : (events ?? []).slice(0, MAX_ROWS);

  // Day headers are emitted inline as the list is walked, rather than by bucketing first — it
  // keeps a single flat list for the DOM and the ordering can't drift from the data.
  let lastDay: string | null = null;

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-5 pt-4 pb-3 flex items-center gap-2">
        <Activity size={16} className="text-[#0e62ae]" />
        <h2 className="text-sm font-semibold text-gray-800">Recent activity</h2>
        <span className="ml-auto text-xs text-gray-400">Last {days} days</span>
      </div>

      {events === null && (
        <p className="px-5 pb-4 text-sm text-gray-400">Loading…</p>
      )}

      {events !== null && events.length === 0 && (
        <p className="px-5 pb-4 text-sm text-gray-500">
          No sign-ups or cancellations in the last {days} days.
        </p>
      )}

      {events !== null && events.length > 0 && (
        <ul className="border-t border-gray-100 divide-y divide-gray-100">
          {visible.map(e => {
            const { icon: Icon, tone } = EVENT_STYLE[e.eventType] ?? EVENT_STYLE.signed_up;
            const header = dayLabel(e.createdAt);
            const showHeader = header !== lastDay;
            lastDay = header;

            return (
              <li key={e.id}>
                {showHeader && (
                  <p className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {header}
                  </p>
                )}
                <button
                  onClick={() => e.visit && onOpenVisit(e.visit.id)}
                  disabled={!e.visit}
                  className="w-full text-left px-5 py-2.5 hover:bg-gray-50 flex items-center gap-3 group disabled:hover:bg-transparent"
                >
                  <Icon size={15} className={`${tone} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    {/* Your own actions are muted rather than hidden: you don't need telling what
                        you just did, but a PD covering for someone else does need to see it. */}
                    <p className={`text-sm truncate ${e.isOwnAction ? 'text-gray-500' : 'text-gray-900'}`}>
                      {describe(e)}
                    </p>
                    {e.visit && (
                      <p className="text-xs text-gray-500 truncate">
                        {e.visit.label} · {visitDateLabel(e.visit.date)}
                      </p>
                    )}
                  </div>
                  {e.visit && (
                    <span
                      className={`text-xs font-semibold shrink-0 tabular-nums ${
                        e.visit.belowMin ? 'text-red-600' : 'text-gray-400'
                      }`}
                      title={e.visit.belowMin ? 'Below minimum dogs' : 'Dogs confirmed'}
                    >
                      {e.visit.confirmed}/{e.visit.max}
                    </span>
                  )}
                  <span className="text-xs text-gray-300 shrink-0 w-14 text-right">{timeLabel(e.createdAt)}</span>
                  <ChevronRight size={15} className="text-gray-300 group-hover:text-blue-400 shrink-0" />
                </button>
              </li>
            );
          })}

          {!showAll && events.length > MAX_ROWS && (
            <li>
              <button onClick={() => setShowAll(true)}
                className="w-full px-5 py-2.5 text-sm font-semibold text-[#0e62ae] hover:bg-gray-50 text-left">
                Show {events.length - MAX_ROWS} more
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
