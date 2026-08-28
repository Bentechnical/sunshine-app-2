// src/app/api/admin/assign-org-pd/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { addAttendeeToEvent, removeAttendeeFromEvent } from '@/utils/googleCalendar';

export async function POST(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { org_id, pd_id, cascade_visits } = await req.json();

    if (!org_id) {
      return NextResponse.json({ error: 'Missing org_id' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Validate pd_id if provided (must be an active PD)
    if (pd_id) {
      const { data: pd, error: pdErr } = await supabase
        .from('users')
        .select('id')
        .eq('id', pd_id)
        .eq('role', 'pd')
        .eq('status', 'approved')
        .single();

      if (pdErr || !pd) {
        return NextResponse.json({ error: 'PD not found or not approved' }, { status: 400 });
      }
    }

    // Read old PD before updating (needed for calendar attendee swap)
    let oldPdId: string | null = null;
    if (cascade_visits) {
      const { data: orgData } = await supabase
        .from('users')
        .select('assigned_pd_id')
        .eq('id', org_id)
        .single();
      oldPdId = orgData?.assigned_pd_id ?? null;
    }

    // Update the org's assigned PD
    const { error: orgError } = await supabase
      .from('users')
      .update({ assigned_pd_id: pd_id ?? null })
      .eq('id', org_id)
      .eq('role', 'organization');

    if (orgError) {
      console.error('[assign-org-pd] Failed to update org:', orgError.message);
      return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
    }

    // Optionally cascade to all active visits for this org
    let visits_updated = 0;
    if (cascade_visits) {
      const { data: updated, error: visitError } = await supabase
        .from('visits')
        .update({ assigned_pd_id: pd_id ?? null })
        .eq('organization_id', org_id)
        .in('status', ['pending_review', 'approved'])
        .select('id, google_calendar_event_id, status');

      if (visitError) {
        console.error('[assign-org-pd] Failed to cascade to visits:', visitError.message);
        // Don't fail the whole request — org was updated
      } else {
        visits_updated = updated?.length ?? 0;

        // Swap PD attendees on approved calendar events
        const approvedWithEvents = (updated ?? []).filter(
          (v: any) => v.google_calendar_event_id && v.status === 'approved'
        );
        if (approvedWithEvents.length > 0) {
          let oldPdEmail: string | null = null;
          let newPdEmail: string | null = null;

          if (oldPdId) {
            const { data: oldPd } = await supabase.from('users').select('email').eq('id', oldPdId).single();
            oldPdEmail = oldPd?.email ?? null;
          }
          if (pd_id) {
            const { data: newPd } = await supabase.from('users').select('email').eq('id', pd_id).single();
            newPdEmail = newPd?.email ?? null;
          }

          for (const v of approvedWithEvents) {
            if (oldPdEmail) removeAttendeeFromEvent(v.google_calendar_event_id, oldPdEmail).catch(() => {});
            if (newPdEmail) addAttendeeToEvent(v.google_calendar_event_id, newPdEmail).catch(() => {});
          }
        }
      }
    }

    console.log(`[assign-org-pd] Org ${org_id} → PD ${pd_id ?? 'unassigned'}, cascade: ${cascade_visits}, visits updated: ${visits_updated}`);

    return NextResponse.json({ success: true, visits_updated });
  } catch (err: any) {
    console.error('[assign-org-pd] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
