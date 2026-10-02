import type { SupabaseClient } from '@supabase/supabase-js';

// Keeps visits.min_reached_at in sync with the confirmed headcount. Call after any
// change to confirmed registrations or to a visit's min/max. Waitlist changes don't
// affect it. The hourly visit-staffed-notifications cron reads this column.
export async function recalcVisitStaffing(supabase: SupabaseClient, visitId: number): Promise<void> {
  try {
    const { data: visit } = await supabase
      .from('visits')
      .select('min_volunteers, min_reached_at')
      .eq('id', visitId)
      .single();
    if (!visit) return;

    const { count } = await supabase
      .from('visit_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('visit_id', visitId)
      .eq('status', 'confirmed');

    const minMet = (count ?? 0) >= (visit.min_volunteers as number);

    if (minMet && !visit.min_reached_at) {
      await supabase.from('visits').update({ min_reached_at: new Date().toISOString() }).eq('id', visitId);
    } else if (!minMet && visit.min_reached_at) {
      await supabase.from('visits').update({ min_reached_at: null }).eq('id', visitId);
    }
  } catch (err) {
    console.error(`[recalcVisitStaffing] Failed for visit ${visitId}:`, err);
  }
}
