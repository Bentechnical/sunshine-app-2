// GET /api/admin/activity?days=7
// Recent volunteer sign-ups and cancellations, newest first.
//
// WHY THIS EXISTS: on the spreadsheets PDs used before the app, sign-ups were visible at a glance —
// you opened the sheet and saw movement. In the app the same information is real but buried one
// click inside each visit, so a PD had to open every visit and hope to notice what changed. PD
// testing surfaced this as the single biggest piece of lost visibility.
//
// It reads `visit_registration_events` (Migration 42), which has been logging every registration
// change — with the actor, not just the subject — since it shipped. Nothing read it until now;
// this is what it was for.
//
// SCOPING mirrors the rest of the admin UI: PDs see events on visits assigned to them, admins see
// everything. Note this is "your visits", not "your region" — volunteers are deliberately not
// region-siloed, so a volunteer from another region signing up for your visit shows up here, which
// is correct and is the whole point of it being visible.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

const DEFAULT_DAYS = 7;
const MAX_EVENTS = 60;

export async function GET(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;
  const { userId, role } = check;

  try {
    const supabase = createSupabaseAdminClient();

    const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') || '', 10) || DEFAULT_DAYS, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // PD scoping is applied as a visit-id filter rather than by joining on region, because
    // `assigned_pd_id` is what every other PD-facing view scopes on. Fetching the ids first also
    // lets the query use the (visit_id, created_at DESC) index rather than sorting the table.
    let visitIds: number[] | null = null;
    if (role === 'pd') {
      const { data: myVisits } = await supabase
        .from('visits')
        .select('id')
        .eq('assigned_pd_id', userId);

      visitIds = (myVisits ?? []).map(v => v.id as number);
      // No visits means no activity — and an empty `.in()` would return everything, so return early.
      if (visitIds.length === 0) return NextResponse.json({ events: [], days });
    }

    let query = supabase
      .from('visit_registration_events')
      .select('id, visit_id, volunteer_id, event_type, actor_id, actor_role, reason, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_EVENTS);

    if (visitIds) query = query.in('visit_id', visitIds);

    const { data: events, error } = await query;

    if (error) {
      console.error('[admin/activity] Failed to load events:', error.message);
      return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 });
    }
    if (!events || events.length === 0) return NextResponse.json({ events: [], days });

    // Hydrate in bulk rather than per row: three queries regardless of how many events came back.
    const eventVisitIds = [...new Set(events.map(e => e.visit_id as number))];
    const personIds = [...new Set(
      events.flatMap(e => [e.volunteer_id as string, e.actor_id as string | null]).filter(Boolean) as string[]
    )];

    const [{ data: visits }, { data: people }, { data: confirmedRows }] = await Promise.all([
      supabase
        .from('visits')
        .select('id, title, guest_org_name, organization_id, visit_date, status, volunteer_slots, min_volunteers')
        .in('id', eventVisitIds),
      supabase
        .from('users')
        .select('id, first_name, last_name, org_name')
        .in('id', personIds),
      // Current staffing, so a withdrawal that drops a visit below its minimum looks different
      // from one that doesn't — without the PD having to open the visit to find out.
      supabase
        .from('visit_registrations')
        .select('visit_id')
        .in('visit_id', eventVisitIds)
        .eq('status', 'confirmed'),
    ]);

    const orgIds = [...new Set((visits ?? []).map(v => v.organization_id).filter(Boolean) as string[])];
    const { data: orgs } = orgIds.length
      ? await supabase.from('users').select('id, org_name').in('id', orgIds)
      : { data: [] as any[] };

    const orgName = new Map((orgs ?? []).map(o => [o.id as string, o.org_name as string | null]));
    const personName = new Map((people ?? []).map(p => [
      p.id as string,
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.org_name || 'Someone',
    ]));

    const confirmedCount = new Map<number, number>();
    for (const r of confirmedRows ?? []) {
      confirmedCount.set(r.visit_id as number, (confirmedCount.get(r.visit_id as number) ?? 0) + 1);
    }

    const visitById = new Map((visits ?? []).map(v => [v.id as number, v]));

    const hydrated = events.map(e => {
      const v = visitById.get(e.visit_id as number);
      const confirmed = confirmedCount.get(e.visit_id as number) ?? 0;
      const min = (v?.min_volunteers ?? v?.volunteer_slots ?? 0) as number;

      return {
        id: e.id,
        eventType: e.event_type,
        createdAt: e.created_at,
        volunteerId: e.volunteer_id,
        volunteerName: personName.get(e.volunteer_id as string) ?? 'A volunteer',
        actorId: e.actor_id,
        actorName: e.actor_id ? (personName.get(e.actor_id as string) ?? null) : null,
        actorRole: e.actor_role,
        // True when staff acted on someone's behalf. This is the distinction the events table was
        // built to record — without `actor_id` a withdrawal and a removal are indistinguishable.
        byStaff: !!e.actor_id && e.actor_id !== e.volunteer_id,
        isOwnAction: e.actor_id === userId,
        reason: e.reason,
        visit: v
          ? {
              id: v.id,
              label: v.guest_org_name || orgName.get(v.organization_id as string) || v.title || 'Visit',
              date: v.visit_date,
              status: v.status,
              confirmed,
              min,
              max: v.volunteer_slots,
              belowMin: confirmed < min,
            }
          : null,
      };
    });

    return NextResponse.json({ events: hydrated, days });
  } catch (err: any) {
    console.error('[admin/activity] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
