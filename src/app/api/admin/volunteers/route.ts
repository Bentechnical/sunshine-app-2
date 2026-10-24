// GET /api/admin/volunteers?q=<search>            — volunteer search for admin assignment
// GET /api/admin/volunteers?scope=list&region=<…> — the Manage Volunteers table
//
// The list mode exists because that screen used to build itself from /api/admin/approved-users,
// which returns every approved user of every role with ~48 columns plus three joins — measured at
// 1,864 bytes per user — to render seven columns for volunteers only. At a few hundred volunteers
// that is close to a megabyte of JSON, most of it discarded on arrival.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { getComplianceStatus } from '@/utils/compliance';

export async function GET(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  if (req.nextUrl.searchParams.get('scope') === 'list') {
    return listVolunteers(req, check.userId, check.role);
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return NextResponse.json({ volunteers: [] });
  }

  const supabase = createSupabaseAdminClient();

  // Split query into words — each word must match first or last name (handles "Michael Torres")
  const words = q.split(/\s+/).filter(Boolean);
  let nameQuery = supabase
    .from('users')
    .select('id, first_name, last_name, email, dogs!volunteer_id(dog_name)')
    .eq('role', 'volunteer')
    .eq('status', 'approved');
  for (const word of words) {
    nameQuery = nameQuery.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%`);
  }
  const { data: byName, error: nameErr } = await nameQuery
    .order('first_name', { ascending: true })
    .limit(20);

  if (nameErr) {
    console.error('[GET /api/admin/volunteers] Supabase error:', nameErr);
    return NextResponse.json({ error: 'Failed to fetch volunteers' }, { status: 500 });
  }

  // Also search by dog name and merge (deduplicated)
  const { data: byDog } = await supabase
    .from('dogs')
    .select('volunteer_id, dog_name, users!inner(id, first_name, last_name, email, status, role)')
    .ilike('dog_name', `%${q}%`)
    .eq('users.role', 'volunteer')
    .eq('users.status', 'approved')
    .limit(20);

  // Collect volunteer IDs from dog search not already in byName
  const nameIds = new Set((byName ?? []).map(u => u.id));
  const extraIds = [...new Set(
    (byDog ?? [])
      .map((d: any) => d.volunteer_id)
      .filter((id: string) => !nameIds.has(id))
  )];

  let extra: any[] = [];
  if (extraIds.length > 0) {
    const { data } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, dogs!volunteer_id(dog_name)')
      .in('id', extraIds);
    extra = data ?? [];
  }

  const combined = [...(byName ?? []), ...extra];
  const volunteers = combined.map(u => ({
    id: u.id,
    first_name: u.first_name ?? '',
    last_name: u.last_name ?? '',
    email: u.email ?? '',
    dogs: (Array.isArray(u.dogs) ? u.dogs : u.dogs ? [u.dogs] : []).map((d: any) => ({ dog_name: d.dog_name ?? '' })),
  }));

  return NextResponse.json({ volunteers });
}

// ─── List mode ────────────────────────────────────────────────────────────────

/**
 * The Manage Volunteers table.
 *
 * Two things keep the payload small:
 *
 *   * Region is filtered **server-side**. Previously the fetch was unfiltered and the region
 *     dropdown filtered in the browser, so a PD with 30 volunteers still downloaded every
 *     volunteer in the organisation — their load time scaled with Sunshine's total size rather
 *     than their own region's.
 *   * Compliance is returned as **statuses only** for every row, with the full reviewable record
 *     attached only to volunteers actually awaiting review. The table renders two badges per row;
 *     only the Review button needs document URLs, dates, comments and rejection reasons, and by
 *     definition that set is a short work queue.
 *
 * `region` accepts a region id, 'unassigned', or 'all'. When omitted the server decides — a PD
 * gets their own region, an admin gets everything — so the first load needs no round trip to
 * discover which region the caller owns. The choice is echoed back as `applied_region`.
 */
async function listVolunteers(
  req: NextRequest,
  callerId: string,
  callerRole: 'admin' | 'pd',
) {
  const supabase = createSupabaseAdminClient();
  const requested = req.nextUrl.searchParams.get('region');

  let appliedRegion = requested;
  if (!appliedRegion) {
    if (callerRole === 'pd') {
      const { data: own } = await supabase
        .from('pd_regions')
        .select('id')
        .eq('owner_pd_id', callerId)
        .eq('is_active', true)
        .maybeSingle();
      appliedRegion = own ? String(own.id) : 'all';
    } else {
      appliedRegion = 'all';
    }
  }

  let query = supabase
    .from('users')
    .select(`
      id, first_name, last_name, email, city,
      assigned_region_id, region_assignment_method, volunteer_tier,
      vsc_document_url, vsc_renewal_due, vsc_verification_status
    `)
    .eq('role', 'volunteer')
    .eq('status', 'approved')
    .eq('profile_complete', true)
    .order('last_name', { ascending: true });

  if (appliedRegion === 'unassigned') {
    query = query.is('assigned_region_id', null);
  } else if (appliedRegion !== 'all') {
    const regionId = parseInt(appliedRegion, 10);
    if (isNaN(regionId)) {
      return NextResponse.json({ error: 'Invalid region' }, { status: 400 });
    }
    query = query.eq('assigned_region_id', regionId);
  }

  const { data: users, error } = await query;
  if (error) {
    console.error('[GET /api/admin/volunteers?scope=list] Supabase error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch volunteers' }, { status: 500 });
  }

  const ids = (users ?? []).map(u => u.id);
  const { data: dogs } = ids.length
    ? await supabase
        .from('dogs')
        .select(`
          volunteer_id, dog_name, dog_breed, dog_bio, dog_picture_url, dog_age,
          vaccine_record_url, vaccine_date_issued, vaccine_expiry_date,
          vaccine_verification_status, vaccine_upload_comment, vaccine_rejection_reason
        `)
        .in('volunteer_id', ids)
    : { data: [] };

  const dogByVolunteer = new Map((dogs ?? []).map(d => [d.volunteer_id, d]));

  const rows = (users ?? []).map(u => {
    const dog = dogByVolunteer.get(u.id) ?? null;
    return {
      id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      city: u.city,
      assigned_region_id: u.assigned_region_id ?? null,
      region_assignment_method: u.region_assignment_method ?? null,
      volunteer_tier: u.volunteer_tier ?? null,
      vsc_status: getComplianceStatus(u.vsc_document_url, u.vsc_renewal_due, u.vsc_verification_status),
      vaccine_status: dog
        ? getComplianceStatus(dog.vaccine_record_url, dog.vaccine_expiry_date, dog.vaccine_verification_status)
        : ('missing' as const),
      vsc_verification_status: u.vsc_verification_status ?? null,
      vaccine_verification_status: dog?.vaccine_verification_status ?? null,
    };
  });

  // Full record + dog profile, only for the rows that can open the review modal.
  //
  // Fetched in a second, narrow query rather than widening the select above: the heavy compliance
  // columns (document urls, comments, rejection reasons, verifier ids) would otherwise be paid for
  // on every row to serve a handful. The pending set is a work queue, so it stays short.
  const pendingIds = (users ?? [])
    .filter(u => u.vsc_verification_status === 'pending_review'
      || dogByVolunteer.get(u.id)?.vaccine_verification_status === 'pending_review')
    .map(u => u.id);

  const details: Record<string, unknown> = {};

  if (pendingIds.length > 0) {
    const [{ data: fullUsers }, { data: fullDogs }] = await Promise.all([
      supabase
        .from('users')
        .select(`
          id, vsc_document_url, vsc_date_issued, vsc_renewal_due, vsc_verification_status,
          vsc_verified_at, vsc_verified_by, vsc_upload_comment, vsc_rejection_reason
        `)
        .in('id', pendingIds),
      supabase
        .from('dogs')
        .select(`
          volunteer_id, vaccine_verified_at, vaccine_verified_by
        `)
        .in('volunteer_id', pendingIds),
    ]);

    const fullUserById = new Map((fullUsers ?? []).map(u => [u.id, u]));
    const fullDogById = new Map((fullDogs ?? []).map(d => [d.volunteer_id, d]));

    const verifierIds = [...new Set([
      ...(fullUsers ?? []).map(u => u.vsc_verified_by),
      ...(fullDogs ?? []).map(d => d.vaccine_verified_by),
    ].filter(Boolean) as string[])];

    const verifierNames = new Map<string, string>();
    if (verifierIds.length > 0) {
      const { data: people } = await supabase
        .from('users').select('id, first_name, last_name').in('id', verifierIds);
      for (const v of people ?? []) verifierNames.set(v.id, `${v.first_name} ${v.last_name}`);
    }
    const nameOf = (id: string | null | undefined) => (id ? verifierNames.get(id) ?? null : null);

    for (const id of pendingIds) {
      const u = fullUserById.get(id);
      const dog = dogByVolunteer.get(id) ?? null;
      const dogExtra = fullDogById.get(id);
      const row = rows.find(r => r.id === id)!;

      details[id] = {
        dog: dog ? {
          dog_name: dog.dog_name, dog_breed: dog.dog_breed, dog_bio: dog.dog_bio,
          dog_picture_url: dog.dog_picture_url, dog_age: dog.dog_age,
        } : null,
        compliance: {
          vsc: {
            status: row.vsc_status,
            document_url: u?.vsc_document_url ?? null,
            date_issued: u?.vsc_date_issued ?? null,
            renewal_due: u?.vsc_renewal_due ?? null,
            verification_status: u?.vsc_verification_status ?? null,
            verified_at: u?.vsc_verified_at ?? null,
            verified_by: u?.vsc_verified_by ?? null,
            verified_by_name: nameOf(u?.vsc_verified_by),
            upload_comment: u?.vsc_upload_comment ?? null,
            rejection_reason: u?.vsc_rejection_reason ?? null,
          },
          vaccine: {
            status: row.vaccine_status,
            document_url: dog?.vaccine_record_url ?? null,
            date_issued: dog?.vaccine_date_issued ?? null,
            expiry_date: dog?.vaccine_expiry_date ?? null,
            dog_name: dog?.dog_name ?? null,
            verification_status: dog?.vaccine_verification_status ?? null,
            verified_at: dogExtra?.vaccine_verified_at ?? null,
            verified_by: dogExtra?.vaccine_verified_by ?? null,
            verified_by_name: nameOf(dogExtra?.vaccine_verified_by),
            upload_comment: dog?.vaccine_upload_comment ?? null,
            rejection_reason: dog?.vaccine_rejection_reason ?? null,
          },
        },
      };
    }
  }

  return NextResponse.json({ volunteers: rows, details, applied_region: appliedRegion });
}
