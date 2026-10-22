// GET /api/admin/volunteers/[id] — full volunteer detail for the admin/PD volunteer page.
//
// Deliberately a separate endpoint from /api/admin/approved-users, which returns every approved
// user of every role with ~45 columns and both legacy audience join tables. That one is for the
// list; this one is for a single profile and includes things the list has no use for (visit
// history, notes, exclusions).
//
// Not scoped by region: PDs have full visibility into all volunteers by design, since volunteers
// are encouraged to sign up for visits outside their own region and a profile is meant to let any
// PD judge the person. See docs/TECH_DEBT.md for the eventual view-all / edit-own-region idea.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { getComplianceStatus } from '@/utils/compliance';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { id: volunteerId } = await params;
    if (!volunteerId) {
      return NextResponse.json({ error: 'Invalid volunteer id' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: volunteer, error: volErr } = await supabase
      .from('users')
      .select(`
        id, first_name, last_name, email, phone_number, city, postal_code, physical_address,
        date_of_birth, pronouns, bio, profile_image, status, created_at,
        archived_at, is_browsable, assigned_region_id, region_assignment_method, volunteer_tier,
        vsc_document_url, vsc_date_issued, vsc_renewal_due, vsc_verification_status,
        vsc_verified_at, vsc_verified_by, vsc_upload_comment, vsc_rejection_reason
      `)
      .eq('id', volunteerId)
      .eq('role', 'volunteer')
      .maybeSingle();

    if (volErr) {
      console.error('[GET /api/admin/volunteers/[id]] Supabase error:', volErr.message);
      return NextResponse.json({ error: 'Failed to load volunteer' }, { status: 500 });
    }
    if (!volunteer) {
      return NextResponse.json({ error: 'Volunteer not found' }, { status: 404 });
    }

    // ── Parallel fetches that don't depend on each other ──────────────────────────────────────
    const [dogRes, regionRes, exclusionsRes, groupsRes, notesRes, registrationsRes] =
      await Promise.all([
        supabase
          .from('dogs')
          .select(`
            id, dog_name, dog_breed, dog_age, dog_bio, dog_picture_url, status,
            vaccine_record_url, vaccine_date_issued, vaccine_expiry_date, vaccine_cycle_years,
            vaccine_verification_status, vaccine_verified_at, vaccine_verified_by,
            vaccine_upload_comment, vaccine_rejection_reason, vaccine_supporting_urls
          `)
          .eq('volunteer_id', volunteerId)
          .maybeSingle(),

        volunteer.assigned_region_id
          ? supabase
              .from('pd_regions')
              .select('id, name, is_active, owner_pd_id')
              .eq('id', volunteer.assigned_region_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),

        supabase
          .from('volunteer_audience_exclusions')
          .select('group_id, note, created_at, created_by, audience_groups(slug, label)')
          .eq('volunteer_id', volunteerId),

        supabase
          .from('audience_groups')
          .select('id, slug, label, description, sort_order')
          .eq('is_active', true)
          .order('sort_order'),

        supabase
          .from('volunteer_notes')
          .select('id, note_text, created_at, author_id')
          .eq('volunteer_id', volunteerId)
          .order('created_at', { ascending: false }),

        // Registration history. Nested two levels only — visit_registrations → visits. Going a
        // third level to the org through an aliased FK is unreliable in PostgREST (same reason
        // GET /api/admin/visits/[id] fetches dogs separately), so org names are resolved below.
        supabase
          .from('visit_registrations')
          .select(`
            id, status, waitlist_position, created_at, cancelled_at,
            cancellation_reason, admin_note,
            visits(
              id, title, guest_org_name, organization_id, visit_date, start_time, end_time,
              address, status, assigned_pd_id
            )
          `)
          .eq('volunteer_id', volunteerId),
      ]);

    const dog = dogRes.data ?? null;

    // ── Compliance ────────────────────────────────────────────────────────────────────────────
    const compliance = {
      vsc: {
        status: getComplianceStatus(
          volunteer.vsc_document_url,
          volunteer.vsc_renewal_due,
          volunteer.vsc_verification_status,
        ),
        document_url: volunteer.vsc_document_url,
        date_issued: volunteer.vsc_date_issued,
        renewal_due: volunteer.vsc_renewal_due,
        verification_status: volunteer.vsc_verification_status ?? null,
        verified_at: volunteer.vsc_verified_at ?? null,
        verified_by: volunteer.vsc_verified_by ?? null,
        verified_by_name: null as string | null,
        upload_comment: volunteer.vsc_upload_comment ?? null,
        rejection_reason: volunteer.vsc_rejection_reason ?? null,
      },
      vaccine: {
        status: dog
          ? getComplianceStatus(
              dog.vaccine_record_url,
              dog.vaccine_expiry_date,
              dog.vaccine_verification_status,
            )
          : ('missing' as const),
        document_url: dog?.vaccine_record_url ?? null,
        date_issued: dog?.vaccine_date_issued ?? null,
        expiry_date: dog?.vaccine_expiry_date ?? null,
        dog_name: dog?.dog_name ?? null,
        verification_status: dog?.vaccine_verification_status ?? null,
        verified_at: dog?.vaccine_verified_at ?? null,
        verified_by: dog?.vaccine_verified_by ?? null,
        verified_by_name: null as string | null,
        upload_comment: dog?.vaccine_upload_comment ?? null,
        rejection_reason: dog?.vaccine_rejection_reason ?? null,
      },
    };

    // ── Resolve the user ids referenced by notes, exclusions and verifications in one query ───
    const nameIds = new Set<string>();
    if (volunteer.vsc_verified_by) nameIds.add(volunteer.vsc_verified_by);
    if (dog?.vaccine_verified_by) nameIds.add(dog.vaccine_verified_by);
    for (const n of notesRes.data ?? []) if (n.author_id) nameIds.add(n.author_id);
    for (const e of exclusionsRes.data ?? []) if (e.created_by) nameIds.add(e.created_by as string);

    const names = new Map<string, string>();
    if (nameIds.size > 0) {
      const { data: people } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('id', Array.from(nameIds));
      for (const p of people ?? []) names.set(p.id, `${p.first_name} ${p.last_name}`);
    }
    compliance.vsc.verified_by_name = volunteer.vsc_verified_by
      ? (names.get(volunteer.vsc_verified_by) ?? null)
      : null;
    compliance.vaccine.verified_by_name = dog?.vaccine_verified_by
      ? (names.get(dog.vaccine_verified_by) ?? null)
      : null;

    // ── Visit history ─────────────────────────────────────────────────────────────────────────
    const registrations = (registrationsRes.data ?? []).filter(r => r.visits);

    const orgIds = [...new Set(
      registrations.map(r => (r.visits as any).organization_id).filter(Boolean)
    )] as string[];
    const orgNames = new Map<string, string | null>();
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('users')
        .select('id, org_name')
        .in('id', orgIds);
      for (const o of orgs ?? []) orgNames.set(o.id, o.org_name ?? null);
    }

    const visits = registrations.map(r => {
      const v = r.visits as any;
      return {
        registration_id: r.id,
        registration_status: r.status as 'confirmed' | 'waitlisted' | 'cancelled',
        waitlist_position: r.waitlist_position ?? null,
        registered_at: r.created_at,
        cancelled_at: r.cancelled_at ?? null,
        cancellation_reason: r.cancellation_reason ?? null,
        admin_note: r.admin_note ?? null,
        visit_id: v.id,
        title: v.title ?? null,
        org_name: v.organization_id ? (orgNames.get(v.organization_id) ?? null) : (v.guest_org_name ?? null),
        visit_date: v.visit_date,
        start_time: v.start_time,
        end_time: v.end_time,
        address: v.address,
        visit_status: v.status as string,
      };
    }).sort((a, b) => b.visit_date.localeCompare(a.visit_date));

    // ── Stats ─────────────────────────────────────────────────────────────────────────────────
    //
    // Only the three figures the UI still shows, in the Visit History footer. "Attended" is
    // inferred — a confirmed registration on a visit marked complete — since there is no
    // attendance or no-show tracking; see docs/TECH_DEBT.md.
    //
    // A "withdrew" count used to live here. It was dropped deliberately: the data can't cleanly
    // separate a volunteer's own cancellation from a PD removal or an org cancelling the visit,
    // and a shaky reliability number is worse than none. It comes back, exact, with
    // visit_registration_events.
    const nowIso = new Date().toISOString();
    const stats = {
      attended: visits.filter(
        v => v.registration_status === 'confirmed' && v.visit_status === 'completed'
      ).length,
      upcoming: visits.filter(
        v => v.registration_status === 'confirmed'
          && v.visit_status === 'approved'
          && v.end_time > nowIso
      ).length,
      total_registrations: visits.length,
    };

    // ── Exclusions and notes ──────────────────────────────────────────────────────────────────
    const exclusions = (exclusionsRes.data ?? []).map((e: any) => ({
      group_id: e.group_id,
      slug: e.audience_groups?.slug ?? null,
      label: e.audience_groups?.label ?? null,
      note: e.note ?? null,
      created_at: e.created_at,
      created_by: e.created_by ?? null,
      created_by_name: e.created_by ? (names.get(e.created_by) ?? null) : null,
    }));

    const notes = (notesRes.data ?? []).map(n => ({
      id: n.id,
      note_text: n.note_text,
      created_at: n.created_at,
      author_id: n.author_id ?? null,
      author_name: n.author_id ? (names.get(n.author_id) ?? null) : null,
    }));

    const region = (regionRes as any).data ?? null;

    return NextResponse.json({
      volunteer: {
        id: volunteer.id,
        first_name: volunteer.first_name,
        last_name: volunteer.last_name,
        email: volunteer.email,
        phone: volunteer.phone_number,
        city: volunteer.city,
        postal_code: volunteer.postal_code,
        physical_address: volunteer.physical_address,
        date_of_birth: volunteer.date_of_birth,
        pronouns: volunteer.pronouns,
        bio: volunteer.bio,
        profile_image: volunteer.profile_image,
        status: volunteer.status,
        created_at: volunteer.created_at,
        archived_at: volunteer.archived_at,
        is_browsable: volunteer.is_browsable ?? true,
        volunteer_tier: volunteer.volunteer_tier ?? 'candidate',
        assigned_region_id: volunteer.assigned_region_id ?? null,
        region_assignment_method: volunteer.region_assignment_method ?? null,
        region_name: region?.name ?? null,
      },
      dog,
      compliance,
      exclusions,
      audience_groups: groupsRes.data ?? [],
      notes,
      stats,
      visits,
    });
  } catch (err: any) {
    console.error('[GET /api/admin/volunteers/[id]] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
