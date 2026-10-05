// scripts/scenarioInspect.ts
//
// READ-ONLY inspection of the current database. Writes nothing.
//
// Purpose: before building the PD-testing scenario seeder, establish what is actually in
// DevDB — which PD accounts and regions exist, who is assigned where, what visits exist and
// which PD they're scoped to, and which records would block the scenario (e.g. volunteers who
// cannot register because their compliance docs aren't 'approved').
//
// Usage:
//   npx tsx scripts/scenarioInspect.ts
//   npx tsx scripts/scenarioInspect.ts --verbose   (list every row, not just summaries)
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const VERBOSE = process.argv.includes('--verbose');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const db = createClient(url, key);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const h1 = (s: string) => console.log(`\n${'='.repeat(78)}\n${s}\n${'='.repeat(78)}`);
const h2 = (s: string) => console.log(`\n--- ${s} ---`);
const pad = (s: unknown, n: number) => String(s ?? '—').slice(0, n).padEnd(n);

function daysFromNow(iso: string | null): string {
  if (!iso) return '—';
  const d = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (d === 0) return 'today';
  return d > 0 ? `+${d}d` : `${d}d`;
}

function tally<T>(rows: T[], keyFn: (r: T) => string): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, r) => {
    const k = keyFn(r);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

const problems: string[] = [];
const flag = (s: string) => { problems.push(s); };

// ---------------------------------------------------------------------------
// Types (only the fields this script reads)
// ---------------------------------------------------------------------------

type User = {
  id: string; first_name: string; last_name: string; email: string;
  role: string; status: string; org_name: string | null; fee_tier: string | null;
  is_admin_managed: boolean | null; assigned_region_id: number | null;
  region_assignment_method: string | null;
  vsc_document_url: string | null; vsc_verification_status: string | null;
  vsc_date_issued: string | null; vsc_renewal_due: string | null;
  location_lat: number | null; location_lng: number | null; postal_code: string | null;
};

type Dog = {
  id: number; volunteer_id: string; dog_name: string; status: string;
  vaccine_record_url: string | null; vaccine_verification_status: string | null;
  vaccine_expiry_date: string | null;
};

type Region = {
  id: number; name: string; owner_pd_id: string | null; is_active: boolean;
};

type Place = {
  region_id: number; place_name: string; place_type: string; boundary_status: string | null;
};

type Visit = {
  id: number; title: string | null; organization_id: string | null;
  guest_org_name: string | null; guest_contact_email: string | null;
  visit_date: string; start_time: string; end_time: string; status: string;
  assigned_pd_id: string | null; volunteer_slots: number; min_volunteers: number;
  min_reached_at: string | null; staffed_notified_at: string | null;
  fee_tier: string | null; created_by: string | null;
};

type Reg = {
  id: number; visit_id: number; volunteer_id: string; status: string;
  waitlist_position: number | null; contact_shared: boolean | null;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nInspecting: ${url}`);
  console.log(`Mode: READ-ONLY (nothing will be written)`);
  console.log(`Time: ${new Date().toISOString()}`);

  const [usersRes, dogsRes, regionsRes, placesRes, visitsRes, regsRes] = await Promise.all([
    db.from('users').select('id, first_name, last_name, email, role, status, org_name, fee_tier, is_admin_managed, assigned_region_id, region_assignment_method, vsc_document_url, vsc_verification_status, vsc_date_issued, vsc_renewal_due, location_lat, location_lng, postal_code'),
    db.from('dogs').select('id, volunteer_id, dog_name, status, vaccine_record_url, vaccine_verification_status, vaccine_expiry_date'),
    db.from('pd_regions').select('id, name, owner_pd_id, is_active').order('id'),
    db.from('pd_region_places').select('region_id, place_name, place_type, boundary_status'),
    db.from('visits').select('id, title, organization_id, guest_org_name, guest_contact_email, visit_date, start_time, end_time, status, assigned_pd_id, volunteer_slots, min_volunteers, min_reached_at, staffed_notified_at, fee_tier, created_by').order('visit_date'),
    db.from('visit_registrations').select('id, visit_id, volunteer_id, status, waitlist_position, contact_shared'),
  ]);

  for (const [name, res] of Object.entries({ users: usersRes, dogs: dogsRes, regions: regionsRes, places: placesRes, visits: visitsRes, registrations: regsRes })) {
    if (res.error) {
      console.error(`\nFailed to read ${name}: ${res.error.message}`);
      process.exit(1);
    }
  }

  const users = (usersRes.data ?? []) as User[];
  const dogs = (dogsRes.data ?? []) as Dog[];
  const regions = (regionsRes.data ?? []) as Region[];
  const places = (placesRes.data ?? []) as Place[];
  const visits = (visitsRes.data ?? []) as Visit[];
  const regs = (regsRes.data ?? []) as Reg[];

  const byId = new Map(users.map(u => [u.id, u]));
  const dogByVol = new Map(dogs.map(d => [d.volunteer_id, d]));
  const name = (id: string | null) => {
    if (!id) return '—';
    const u = byId.get(id);
    return u ? `${u.first_name} ${u.last_name}` : `(unknown: ${id.slice(0, 14)}…)`;
  };

  // ======================= Users =======================
  h1('USERS');
  const roleStatus = tally(users, u => `${u.role} / ${u.status}`);
  console.log(`Total: ${users.length}\n`);
  Object.entries(roleStatus).sort().forEach(([k, v]) => console.log(`  ${pad(k, 30)} ${v}`));

  // ======================= PDs =======================
  h1('PD ACCOUNTS');
  const pds = users.filter(u => u.role === 'pd');
  if (pds.length === 0) {
    console.log('None. A PD account must exist before the scenario can be scoped to one.');
    flag('No PD accounts exist — scenario needs at least one.');
  } else {
    console.log(`${pad('NAME', 24)} ${pad('EMAIL', 34)} ${pad('STATUS', 10)} OWNS REGIONS`);
    for (const p of pds) {
      const owned = regions.filter(r => r.owner_pd_id === p.id);
      const label = owned.length ? owned.map(r => `${r.name}${r.is_active ? '' : ' (inactive)'}`).join(', ') : '—';
      console.log(`${pad(`${p.first_name} ${p.last_name}`, 24)} ${pad(p.email, 34)} ${pad(p.status, 10)} ${label}`);
      if (p.status !== 'approved') flag(`PD "${p.first_name} ${p.last_name}" has status '${p.status}' — the PD dashboard requires 'approved'.`);
    }
  }

  // ======================= Regions =======================
  h1('REGIONS');
  if (regions.length === 0) {
    console.log('None.');
    flag('No regions exist — PD scoping cannot work without one.');
  } else {
    console.log(`${pad('ID', 4)} ${pad('NAME', 22)} ${pad('OWNER PD', 22)} ${pad('ACTIVE', 7)} ${pad('PLACES', 7)} ORGS/VOLS`);
    for (const r of regions) {
      const rPlaces = places.filter(p => p.region_id === r.id);
      const noBoundary = rPlaces.filter(p => p.boundary_status !== 'found').length;
      const orgs = users.filter(u => u.role === 'organization' && u.assigned_region_id === r.id).length;
      const vols = users.filter(u => u.role === 'volunteer' && u.assigned_region_id === r.id).length;
      const placeLabel = `${rPlaces.length}${noBoundary ? ` (${noBoundary} no bdy)` : ''}`;
      console.log(`${pad(r.id, 4)} ${pad(r.name, 22)} ${pad(name(r.owner_pd_id), 22)} ${pad(r.is_active ? 'yes' : 'NO', 7)} ${pad(placeLabel, 7)} ${orgs}/${vols}`);
      if (r.is_active && !r.owner_pd_id) flag(`Region "${r.name}" is active but has no owner PD — its visits get assigned_pd_id = null.`);
      if (r.is_active && rPlaces.length === 0) flag(`Region "${r.name}" has no places — auto region assignment cannot match anyone to it.`);
    }
    if (VERBOSE) {
      h2('Region places');
      for (const p of places) {
        console.log(`  region ${pad(p.region_id, 3)} ${pad(p.place_name, 24)} ${pad(p.place_type, 30)} boundary=${p.boundary_status ?? '—'}`);
      }
    }
  }

  // ======================= Orgs =======================
  h1('ORGANIZATIONS');
  const orgs = users.filter(u => u.role === 'organization');
  const regionName = (id: number | null) => id ? (regions.find(r => r.id === id)?.name ?? `(missing region ${id})`) : '— unassigned';
  if (orgs.length === 0) {
    console.log('None.');
  } else {
    console.log(`${pad('ORG NAME', 34)} ${pad('STATUS', 10)} ${pad('REGION', 20)} ${pad('TIER', 10)} ${pad('MANAGED', 8)} VISITS`);
    for (const o of orgs) {
      const vCount = visits.filter(v => v.organization_id === o.id).length;
      console.log(`${pad(o.org_name ?? `${o.first_name} ${o.last_name}`, 34)} ${pad(o.status, 10)} ${pad(regionName(o.assigned_region_id), 20)} ${pad(o.fee_tier, 10)} ${pad(o.is_admin_managed ? 'yes' : '', 8)} ${vCount}`);
    }
    const managed = orgs.filter(o => o.is_admin_managed).length;
    console.log(`\n  ${orgs.length} orgs — ${managed} admin-managed, ${orgs.length - managed} account-holding`);
    console.log(`  ${orgs.filter(o => o.status === 'approved').length} approved, ${orgs.filter(o => o.assigned_region_id === null).length} with no region`);
    if (managed === 0) flag('No admin-managed org exists — the scenario should include one (they behave differently from account-holders).');
  }

  // ======================= Volunteers & compliance =======================
  h1('VOLUNTEERS — COMPLIANCE MATRIX');
  const vols = users.filter(u => u.role === 'volunteer');
  if (vols.length === 0) {
    console.log('None.');
  } else {
    const today = new Date();
    const expiryLabel = (d: string | null) => {
      if (!d) return 'none';
      const days = Math.round((new Date(d).getTime() - today.getTime()) / 86_400_000);
      if (days < 0) return `EXPIRED ${-days}d`;
      if (days < 30) return `expiring ${days}d`;
      return `ok (${days}d)`;
    };

    console.log(`${pad('NAME', 22)} ${pad('STATUS', 9)} ${pad('REGION', 16)} ${pad('VSC VERIF', 14)} ${pad('VSC RENEWAL', 16)} ${pad('DOG', 12)} ${pad('VAX VERIF', 14)} VAX EXPIRY`);
    for (const v of vols) {
      const d = dogByVol.get(v.id);
      console.log(
        `${pad(`${v.first_name} ${v.last_name}`, 22)} ${pad(v.status, 9)} ${pad(regionName(v.assigned_region_id), 16)} ` +
        `${pad(v.vsc_verification_status ?? 'NULL', 14)} ${pad(expiryLabel(v.vsc_renewal_due), 16)} ` +
        `${pad(d?.dog_name ?? 'NO DOG', 12)} ${pad(d?.vaccine_verification_status ?? 'NULL', 14)} ${expiryLabel(d?.vaccine_expiry_date ?? null)}`
      );
    }

    // Registration eligibility — mirrors /api/visits/[id]/register
    const blocked = vols.filter(v => {
      const d = dogByVol.get(v.id);
      return v.status === 'approved' && (v.vsc_verification_status !== 'approved' || d?.vaccine_verification_status !== 'approved');
    });
    h2('Registration eligibility');
    console.log(`  Approved volunteers: ${vols.filter(v => v.status === 'approved').length}`);
    console.log(`  Able to register for a visit: ${vols.filter(v => v.status === 'approved').length - blocked.length}`);
    console.log(`  BLOCKED (docs not 'approved'): ${blocked.length}`);
    if (blocked.length) {
      console.log(`\n  /api/visits/[id]/register requires vsc_verification_status === 'approved'`);
      console.log(`  AND dogs.vaccine_verification_status === 'approved'. Blocked:`);
      blocked.slice(0, VERBOSE ? 999 : 8).forEach(v => {
        const d = dogByVol.get(v.id);
        console.log(`    ${pad(`${v.first_name} ${v.last_name}`, 24)} vsc=${pad(v.vsc_verification_status ?? 'NULL', 14)} vax=${d?.vaccine_verification_status ?? 'NULL'}`);
      });
      if (!VERBOSE && blocked.length > 8) console.log(`    … and ${blocked.length - 8} more (--verbose for all)`);
    }

    const states = tally(vols, v => {
      const d = dogByVol.get(v.id);
      return `vsc=${v.vsc_verification_status ?? 'NULL'} vax=${d?.vaccine_verification_status ?? 'NULL'}`;
    });
    h2('Distinct compliance states present');
    Object.entries(states).sort().forEach(([k, v]) => console.log(`  ${pad(k, 44)} ${v} volunteer(s)`));
    for (const want of ['pending_review', 'rejected']) {
      const has = vols.some(v => v.vsc_verification_status === want) || dogs.some(d => d.vaccine_verification_status === want);
      if (!has) flag(`No volunteer/dog has a '${want}' document — needed for the compliance review scenario.`);
    }
  }

  // ======================= Visits =======================
  h1('VISITS');
  if (visits.length === 0) {
    console.log('None.');
  } else {
    console.log(`By status:`);
    Object.entries(tally(visits, v => v.status)).sort().forEach(([k, v]) => console.log(`  ${pad(k, 16)} ${v}`));

    const now = Date.now();
    const future = visits.filter(v => new Date(v.end_time).getTime() > now);
    const past = visits.filter(v => new Date(v.end_time).getTime() <= now);
    console.log(`\nBy time: ${future.length} future, ${past.length} past`);
    console.log(`Pending completion (approved + past): ${visits.filter(v => v.status === 'approved' && new Date(v.end_time).getTime() <= now).length}`);
    console.log(`Guest (no org account): ${visits.filter(v => !v.organization_id).length}  — these intentionally have no PD`);

    h2('All visits');
    console.log(`${pad('ID', 5)} ${pad('WHEN', 8)} ${pad('STATUS', 15)} ${pad('ORG', 28)} ${pad('ASSIGNED PD', 20)} ${pad('SLOTS', 9)} CONF/WAIT`);
    for (const v of visits) {
      const vr = regs.filter(r => r.visit_id === v.id);
      const conf = vr.filter(r => r.status === 'confirmed').length;
      const wait = vr.filter(r => r.status === 'waitlisted').length;
      const orgLabel = v.organization_id ? (byId.get(v.organization_id)?.org_name ?? name(v.organization_id)) : `[guest] ${v.guest_org_name ?? '?'}`;
      console.log(
        `${pad(v.id, 5)} ${pad(daysFromNow(v.start_time), 8)} ${pad(v.status, 15)} ${pad(orgLabel, 28)} ` +
        `${pad(name(v.assigned_pd_id), 20)} ${pad(`${v.min_volunteers}-${v.volunteer_slots}`, 9)} ${conf}/${wait}`
      );
    }

    // PD scoping check — the thing that silently empties a PD dashboard
    h2('PD scoping integrity');
    const mismatched = visits.filter(v => {
      if (!v.organization_id) return false; // guest visits intentionally unassigned
      const org = byId.get(v.organization_id);
      if (!org) return false;
      const region = regions.find(r => r.id === org.assigned_region_id && r.is_active);
      return (v.assigned_pd_id ?? null) !== (region?.owner_pd_id ?? null);
    });
    // A visit's PD may differ from the region owner for two legitimate reasons: a deliberate
    // per-visit override (the PD dropdown in the visit detail view), or a stale snapshot left
    // by a region handover. The schema records no way to tell them apart, so report, don't judge.
    if (mismatched.length === 0) {
      console.log('  All org visits match their org\'s region owner.');
    } else {
      console.log(`  ${mismatched.length} visit(s) differ from their org's region owner.`);
      console.log(`  This is EXPECTED for deliberate per-visit reassignments and cannot be`);
      console.log(`  distinguished from a stale snapshot without visits.pd_assignment_method.\n`);
      for (const v of mismatched) {
        const org = byId.get(v.organization_id!);
        const region = regions.find(r => r.id === org?.assigned_region_id && r.is_active);
        const assignedOwnsRegion = v.assigned_pd_id
          ? regions.some(r => r.is_active && r.owner_pd_id === v.assigned_pd_id)
          : false;
        const note = v.assigned_pd_id && !assignedOwnsRegion ? '  <- PD owns no active region' : '';
        console.log(`    visit ${pad(v.id, 5)} ${pad(org?.org_name ?? '?', 26)} assigned=${pad(name(v.assigned_pd_id), 20)} region_owner=${pad(name(region?.owner_pd_id ?? null), 20)}${note}`);
      }
      const orphaned = mismatched.filter(v => v.assigned_pd_id && !regions.some(r => r.is_active && r.owner_pd_id === v.assigned_pd_id));
      if (orphaned.length) {
        flag(`${orphaned.length} visit(s) are assigned to a PD who owns no active region — likely stale, review individually.`);
      }
    }

    // Per-PD dashboard preview
    h2('What each PD would see (client-side filter on assigned_pd_id)');
    for (const p of pds) {
      const mine = visits.filter(v => v.assigned_pd_id === p.id);
      const pendingReview = mine.filter(v => v.status === 'pending_review').length;
      const active = mine.filter(v => v.status === 'approved' && new Date(v.end_time).getTime() > now).length;
      const pendingCompletion = mine.filter(v => v.status === 'approved' && new Date(v.end_time).getTime() <= now).length;
      console.log(`  ${pad(`${p.first_name} ${p.last_name}`, 24)} total=${pad(mine.length, 4)} pending_review=${pad(pendingReview, 4)} active=${pad(active, 4)} awaiting_completion=${pendingCompletion}`);
      if (mine.length === 0) flag(`PD "${p.first_name} ${p.last_name}" would see an EMPTY visit dashboard.`);
    }
  }

  // ======================= Registrations =======================
  h1('VISIT REGISTRATIONS');
  console.log(`Total: ${regs.length}`);
  Object.entries(tally(regs, r => r.status)).sort().forEach(([k, v]) => console.log(`  ${pad(k, 14)} ${v}`));
  const waitlisted = regs.filter(r => r.status === 'waitlisted');
  console.log(`\nWaitlisted registrations: ${waitlisted.length}${waitlisted.length ? '' : '  — needed for the waitlist-promotion scenario'}`);
  if (waitlisted.length === 0) flag('No waitlisted registration exists — needed for the waitlist promotion scenario.');
  const overfull = visits.filter(v => regs.filter(r => r.visit_id === v.id && r.status === 'confirmed').length > v.volunteer_slots);
  if (overfull.length) flag(`${overfull.length} visit(s) have more confirmed registrations than volunteer_slots (no DB constraint prevents this).`);
  console.log(`contact_shared = true: ${regs.filter(r => r.contact_shared).length}`);

  // ======================= Email safety =======================
  h1('EMAIL SAFETY');
  const SAFE = '@sunshinedogs.app';
  const external = users.filter(u => u.email && !u.email.toLowerCase().endsWith(SAFE));
  const guestExternal = visits.filter(v => v.guest_contact_email && !v.guest_contact_email.toLowerCase().endsWith(SAFE));
  console.log(`Mail sends for real via Resend (no dev guard in src/app/utils/mailer.ts).`);
  console.log(`Addresses ending in ${SAFE} hit the catch-all; anything else is a real external send.\n`);
  console.log(`  users with external email:            ${external.length}`);
  console.log(`  visits with external guest email:     ${guestExternal.length}`);
  if (external.length) {
    console.log(`\n  External user addresses:`);
    external.slice(0, VERBOSE ? 999 : 12).forEach(u => console.log(`    ${pad(u.role, 14)} ${pad(u.status, 10)} ${u.email}`));
    if (!VERBOSE && external.length > 12) console.log(`    … and ${external.length - 12} more (--verbose for all)`);
    flag(`${external.length} user(s) have non-${SAFE} emails — they will receive REAL mail during a session.`);
  }
  if (guestExternal.length) {
    guestExternal.forEach(v => console.log(`    visit ${v.id}: ${v.guest_contact_email}`));
    flag(`${guestExternal.length} visit(s) carry an external guest_contact_email.`);
  }

  // ======================= Deprecated-feature data =======================
  h1('DEPRECATED-FEATURE ROW COUNTS');
  console.log('Out of scope per CLAUDE.md. Listed so we know what a reset would discard.\n');
  const depr = ['appointments', 'appointment_chats', 'chat_logs', 'chat_requests', 'message_read_status', 'pending_email_notifications', 'individual_audience_tags', 'device_tokens'];
  for (const t of depr) {
    const { count, error } = await db.from(t).select('*', { count: 'exact', head: true });
    console.log(`  ${pad(t, 30)} ${error ? `error: ${error.message}` : count}`);
  }

  // ======================= Storage =======================
  h1('OBJECT STORAGE');
  console.log('pg_dump does NOT capture storage file bytes — only the public schema here.');
  console.log('Buckets must be backed up and reseeded separately.\n');

  const { data: buckets, error: bucketErr } = await db.storage.listBuckets();
  if (bucketErr) {
    console.log(`  Could not list buckets: ${bucketErr.message}`);
  } else {
    async function walk(bucket: string, prefix = ''): Promise<{ files: number; bytes: number }> {
      let files = 0, bytes = 0;
      const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
      if (error) return { files, bytes };
      for (const obj of data ?? []) {
        const path = prefix ? `${prefix}/${obj.name}` : obj.name;
        if (obj.id === null) {
          const sub = await walk(bucket, path);
          files += sub.files; bytes += sub.bytes;
        } else {
          files++; bytes += (obj.metadata as { size?: number } | null)?.size ?? 0;
        }
      }
      return { files, bytes };
    }

    for (const b of buckets ?? []) {
      const { files, bytes } = await walk(b.name);
      console.log(`  ${pad(b.name, 26)} public=${pad(b.public ? 'yes' : 'no', 5)} ${pad(`${files} file(s)`, 14)} ${(bytes / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  h2('File references in the database');
  const refKind = (v: string | null) =>
    !v ? 'null' : v.startsWith('http') ? (v.includes('supabase.co') ? 'supabase-url' : 'EXTERNAL-url') : 'storage-path';
  const refTally = (rows: Record<string, unknown>[], field: string) =>
    Object.entries(tally(rows, r => refKind(r[field] as string | null))).sort().map(([k, n]) => `${k}=${n}`).join('  ');

  const uRows = users as unknown as Record<string, unknown>[];
  const dRows = dogs as unknown as Record<string, unknown>[];
  console.log(`  users.profile_image       ${refTally(uRows, 'profile_image')}`);
  console.log(`  users.vsc_document_url    ${refTally(uRows, 'vsc_document_url')}`);
  console.log(`  dogs.dog_picture_url      ${refTally(dRows, 'dog_picture_url')}`);
  console.log(`  dogs.vaccine_record_url   ${refTally(dRows, 'vaccine_record_url')}`);

  const distinct = (vals: (string | null)[]) => [...new Set(vals.filter(Boolean) as string[])];
  const vscPaths = distinct(users.map(u => u.vsc_document_url));
  const vaxPaths = distinct(dogs.map(d => d.vaccine_record_url));
  console.log(`\n  Distinct compliance document paths — ${vscPaths.length} VSC, ${vaxPaths.length} vaccine:`);
  [...vscPaths.map(v => ['vsc', v] as const), ...vaxPaths.map(v => ['vax', v] as const)]
    .slice(0, VERBOSE ? 999 : 14)
    .forEach(([k, v]) => console.log(`    ${pad(k, 5)} ${v}`));
  if (vscPaths.length === 1 && users.filter(u => u.vsc_document_url).length > 1) {
    flag(`All ${users.filter(u => u.vsc_document_url).length} VSC references point at ONE shared file — fine for testing, but every volunteer shows the same document.`);
  }

  // ======================= Verdict =======================
  h1(`FINDINGS (${problems.length})`);
  if (problems.length === 0) {
    console.log('Nothing blocking found.');
  } else {
    problems.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${p}`));
  }
  console.log('\nRead-only inspection complete. Nothing was written.\n');
}

main().catch((err: unknown) => { console.error(err); process.exit(1); });
