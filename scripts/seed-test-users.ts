// scripts/seed-test-users.ts
// Creates 10 volunteer + 10 organization test users in Clerk and Supabase.
//
// Usage:
//   npm run seed-test-users              -- create all test users
//   npm run seed-test-users -- --dry-run -- print what would be created, no changes
//   npm run seed-test-users -- --cleanup -- delete all test users from Clerk + Supabase

import { createClerkClient } from '@clerk/clerk-sdk-node';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

import { geocodePostalCodeServer } from '@/utils/geocode';
import { autoAssignRegion } from '@/utils/autoAssignRegion';

const DOG_DEFAULT_PIC = 'https://gwuqfhpkncwzykhlcvcp.supabase.co/storage/v1/object/public/sunshine-pics/profile-pictures/1778704340947.jpg';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const VOLUNTEERS = [
  {
    email: 'volunteer.1@sunshinedogs.app',
    firstName: 'Sarah',
    lastName: 'Chen',
    bio: 'I love bringing smiles to seniors and kids with my dog Max.',
    phoneNumber: '4165550101',
    postalCode: 'M5V 1J1',
    city: 'Toronto',
    pronouns: 'she/her',
    travelDistanceKm: 20,
    generalAvailability: 'Weekends and Thursday evenings',
    openToIndividualVisits: true,
    dogName: 'Max',
    dogBreed: 'Golden Retriever',
    dogAge: 4,
    dogBio: 'Max is a friendly, well-trained golden who loves everyone he meets.',
    audiencePrefs: ['Seniors', 'Adults'],
  },
  {
    email: 'volunteer.2@sunshinedogs.app',
    firstName: 'Michael',
    lastName: 'Torres',
    bio: 'Retired teacher visiting care homes with my dog Luna.',
    phoneNumber: '9055550102',
    postalCode: 'L4Z 1H3',
    city: 'Mississauga',
    pronouns: 'he/him',
    travelDistanceKm: 25,
    generalAvailability: 'Weekday afternoons',
    openToIndividualVisits: true,
    dogName: 'Luna',
    dogBreed: 'Labrador Retriever',
    dogAge: 3,
    dogBio: 'Luna is calm, gentle, and great with elderly residents.',
    audiencePrefs: ['Seniors', 'Adults'],
  },
  {
    email: 'volunteer.3@sunshinedogs.app',
    firstName: 'Emma',
    lastName: 'Wilson',
    bio: 'Passionate about animal-assisted therapy. My beagle Buddy is certified.',
    phoneNumber: '9055550103',
    postalCode: 'L6P 2R4',
    city: 'Brampton',
    pronouns: 'she/her',
    travelDistanceKm: 30,
    generalAvailability: 'Saturdays',
    openToIndividualVisits: false,
    dogName: 'Buddy',
    dogBreed: 'Beagle',
    dogAge: 5,
    dogBio: 'Buddy is a curious and affectionate beagle who loves cuddles.',
    audiencePrefs: ['Young Kids', 'Teens', 'Adults'],
  },
  {
    email: 'volunteer.4@sunshinedogs.app',
    firstName: 'James',
    lastName: 'Okafor',
    bio: 'Volunteering with Bella to bring comfort to hospital patients.',
    phoneNumber: '4165550104',
    postalCode: 'M2N 2M4',
    city: 'North York',
    pronouns: 'he/him',
    travelDistanceKm: 15,
    generalAvailability: 'Flexible — mostly weekends',
    openToIndividualVisits: true,
    dogName: 'Bella',
    dogBreed: 'Standard Poodle',
    dogAge: 2,
    dogBio: 'Bella is hypoallergenic, well-trained, and loves meeting new people.',
    audiencePrefs: ['Young Kids', 'Teens', 'Adults', 'Seniors'],
  },
  {
    email: 'volunteer.5@sunshinedogs.app',
    firstName: 'Priya',
    lastName: 'Sharma',
    bio: 'Charlie and I visit schools and senior homes in Markham.',
    phoneNumber: '9055550105',
    postalCode: 'L3R 5P4',
    city: 'Markham',
    pronouns: 'she/her',
    travelDistanceKm: 20,
    generalAvailability: 'Sunday mornings and Wednesday evenings',
    openToIndividualVisits: true,
    dogName: 'Charlie',
    dogBreed: 'Border Collie',
    dogAge: 3,
    dogBio: 'Charlie is energetic but remarkably gentle in clinical settings.',
    audiencePrefs: ['Young Kids', 'Teens'],
  },
  {
    email: 'volunteer.6@sunshinedogs.app',
    firstName: 'David',
    lastName: 'Kim',
    bio: 'Daisy and I have been visiting long-term care homes for two years.',
    phoneNumber: '4165550106',
    postalCode: 'M9C 3T4',
    city: 'Etobicoke',
    pronouns: 'he/him',
    travelDistanceKm: 20,
    generalAvailability: 'Evenings and weekends',
    openToIndividualVisits: true,
    dogName: 'Daisy',
    dogBreed: 'Cavalier King Charles Spaniel',
    dogAge: 6,
    dogBio: 'Daisy is a lap dog at heart — perfect for quiet, comforting visits.',
    audiencePrefs: ['Adults', 'Seniors'],
  },
  {
    email: 'volunteer.7@sunshinedogs.app',
    firstName: 'Rachel',
    lastName: 'Green',
    bio: 'Cooper and I love visiting hospice and palliative care settings.',
    phoneNumber: '4375550107',
    postalCode: 'M1P 2L3',
    city: 'Scarborough',
    pronouns: 'she/they',
    travelDistanceKm: 25,
    generalAvailability: 'Thursdays and Sundays',
    openToIndividualVisits: false,
    dogName: 'Cooper',
    dogBreed: 'Australian Shepherd',
    dogAge: 4,
    dogBio: 'Cooper is intuitive and unusually calm for an Aussie — great with patients.',
    audiencePrefs: ['Adults', 'Seniors'],
  },
  {
    email: 'volunteer.8@sunshinedogs.app',
    firstName: 'Liam',
    lastName: 'Nguyen',
    bio: 'New volunteer, excited to start visiting with Rosie.',
    phoneNumber: '9055550108',
    postalCode: 'L4H 0L4',
    city: 'Vaughan',
    pronouns: 'he/him',
    travelDistanceKm: 35,
    generalAvailability: 'Weekend mornings',
    openToIndividualVisits: true,
    dogName: 'Rosie',
    dogBreed: 'Shih Tzu',
    dogAge: 2,
    dogBio: 'Rosie is tiny, fluffy, and impossible not to smile at.',
    audiencePrefs: ['Teens', 'Adults', 'Seniors'],
  },
  {
    email: 'volunteer.9@sunshinedogs.app',
    firstName: 'Sofia',
    lastName: 'Martini',
    bio: 'Tucker is a certified therapy dog. We visit schools and libraries.',
    phoneNumber: '9055550109',
    postalCode: 'L6H 1B5',
    city: 'Oakville',
    pronouns: 'she/her',
    travelDistanceKm: 30,
    generalAvailability: 'Friday afternoons and Saturdays',
    openToIndividualVisits: false,
    dogName: 'Tucker',
    dogBreed: 'Pembroke Welsh Corgi',
    dogAge: 5,
    dogBio: 'Tucker has endless patience and loves children especially.',
    audiencePrefs: ['Young Kids', 'Teens'],
  },
  {
    email: 'volunteer.10@sunshinedogs.app',
    firstName: 'Daniel',
    lastName: 'Fernandez',
    bio: 'Zoe and I are passionate about supporting seniors in our community.',
    phoneNumber: '9055550110',
    postalCode: 'L7T 2G3',
    city: 'Burlington',
    pronouns: 'he/him',
    travelDistanceKm: 40,
    generalAvailability: 'Sundays and Monday evenings',
    openToIndividualVisits: true,
    dogName: 'Zoe',
    dogBreed: 'Bernese Mountain Dog',
    dogAge: 3,
    dogBio: 'Zoe is a gentle giant who loves a slow, calm visit.',
    audiencePrefs: ['Adults', 'Seniors'],
  },
];

const ORGANIZATIONS = [
  {
    email: 'organization.1@sunshinedogs.app',
    firstName: 'Sunnyview',
    lastName: 'Elementary',
    orgName: 'Sunnyview Elementary School',
    orgType: 'School',
    orgAddress: '245 Hurontario St, Mississauga, ON L5B 2R5',
    orgContactName: 'Jennifer Park',
    orgContactPhone: '9055550201',
    postalCode: 'L5B 2R5',
    city: 'Mississauga',
    bio: 'A public elementary school serving JK–Grade 8 in central Mississauga.',
    feeTier: 'tier_0',
  },
  {
    email: 'organization.2@sunshinedogs.app',
    firstName: 'Trillium',
    lastName: 'Health',
    orgName: 'Trillium Health Partners – Credit Valley',
    orgType: 'Hospital',
    orgAddress: '2200 Eglinton Ave W, Mississauga, ON L5M 2N1',
    orgContactName: 'Marcus Reid',
    orgContactPhone: '9055550202',
    postalCode: 'L5M 2N1',
    city: 'Mississauga',
    bio: 'Community hospital providing acute care to Mississauga and Peel Region.',
    feeTier: 'tier_500',
  },
  {
    email: 'organization.3@sunshinedogs.app',
    firstName: 'Village',
    lastName: 'HumberHeights',
    orgName: 'The Village of Humber Heights',
    orgType: 'Long-term Care',
    orgAddress: '2245 Jane St, Toronto, ON M9N 2L1',
    orgContactName: 'Patricia Lam',
    orgContactPhone: '4165550203',
    postalCode: 'M9N 2L1',
    city: 'Toronto',
    bio: 'A long-term care home in Etobicoke welcoming therapy dog programs.',
    feeTier: 'tier_200',
  },
  {
    email: 'organization.4@sunshinedogs.app',
    firstName: 'Markham',
    lastName: 'Stouffville',
    orgName: 'Markham Stouffville Hospital',
    orgType: 'Hospital',
    orgAddress: '381 Church St, Markham, ON L6B 1A1',
    orgContactName: 'Andrew Johal',
    orgContactPhone: '9055550204',
    postalCode: 'L6B 1A1',
    city: 'Markham',
    bio: 'Regional hospital serving York Region and Durham communities.',
    feeTier: 'tier_500',
  },
  {
    email: 'organization.5@sunshinedogs.app',
    firstName: 'Chartwell',
    lastName: 'Maple',
    orgName: 'Chartwell Maple Long Term Care',
    orgType: 'Long-term Care',
    orgAddress: '9265 Bayview Ave, Richmond Hill, ON L4C 9V4',
    orgContactName: 'Diane Kowalski',
    orgContactPhone: '9055550205',
    postalCode: 'L4C 9V4',
    city: 'Richmond Hill',
    bio: 'Retirement and long-term care community in Richmond Hill.',
    feeTier: 'tier_200',
  },
  {
    email: 'organization.6@sunshinedogs.app',
    firstName: 'North York',
    lastName: 'Library',
    orgName: 'North York Central Library',
    orgType: 'Library',
    orgAddress: '5120 Yonge St, Toronto, ON M2N 5N9',
    orgContactName: 'Keiko Tanaka',
    orgContactPhone: '4165550206',
    postalCode: 'M2N 5N9',
    city: 'North York',
    bio: 'Public library branch running a Read With a Dog literacy program.',
    feeTier: 'tier_0',
  },
  {
    email: 'organization.7@sunshinedogs.app',
    firstName: 'St Michael',
    lastName: 'Catholic',
    orgName: "St. Michael's Catholic School",
    orgType: 'School',
    orgAddress: '50 Kennedy Rd S, Brampton, ON L6W 3G1',
    orgContactName: 'Thomas Oliveira',
    orgContactPhone: '9055550207',
    postalCode: 'L6W 3G1',
    city: 'Brampton',
    bio: 'Catholic elementary school in Brampton with an active wellness program.',
    feeTier: 'tier_0',
  },
  {
    email: 'organization.8@sunshinedogs.app',
    firstName: 'Fairview',
    lastName: 'Lodge',
    orgName: 'Fairview Lodge Long-Term Care',
    orgType: 'Long-term Care',
    orgAddress: '135 Gord Vinson Ave, Whitby, ON L1N 2M2',
    orgContactName: 'Sandra Bhatt',
    orgContactPhone: '9055550208',
    postalCode: 'L1N 2M2',
    city: 'Whitby',
    bio: 'Durham Region long-term care facility welcoming therapy animals.',
    feeTier: 'tier_200',
  },
  {
    email: 'organization.9@sunshinedogs.app',
    firstName: 'Scarborough',
    lastName: 'Hospice',
    orgName: 'Scarborough Community Hospice',
    orgType: 'Hospice',
    orgAddress: '2425 Eglinton Ave E, Toronto, ON M1K 2N1',
    orgContactName: 'Yvonne Adeyemi',
    orgContactPhone: '4375550209',
    postalCode: 'M1K 2N1',
    city: 'Scarborough',
    bio: 'Palliative care hospice providing comfort-focused end-of-life support.',
    feeTier: 'tier_0',
  },
  {
    email: 'organization.10@sunshinedogs.app',
    firstName: 'Oakville',
    lastName: 'Trafalgar',
    orgName: 'Oakville Trafalgar Memorial Hospital',
    orgType: 'Hospital',
    orgAddress: '3001 Hospital Gate, Oakville, ON L6M 0L8',
    orgContactName: 'Robert Szabo',
    orgContactPhone: '9055550210',
    postalCode: 'L6M 0L8',
    city: 'Oakville',
    bio: 'Halton Healthcare hospital offering a range of inpatient and outpatient services.',
    feeTier: 'tier_500',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function geocodeAndAssign(userId: string, postalCode: string) {
  const coords = await geocodePostalCodeServer(postalCode);
  if (!coords) {
    console.warn(`  Geocode failed for ${postalCode} — region not assigned`);
    return;
  }
  await supabase.from('users').update({ location_lat: coords.lat, location_lng: coords.lng }).eq('id', userId);
  const { region_id, method } = await autoAssignRegion(userId);
  if (region_id) {
    await supabase.from('users').update({ assigned_region_id: region_id, region_assignment_method: method }).eq('id', userId);
    console.log(`  Region: ${region_id} (${method})`);
  } else {
    console.log(`  Region: no boundary match (will auto-assign on approval)`);
  }
}

// For orgs: geocode the full address to also capture the Google place_id
async function geocodeOrgAddress(orgId: string, orgAddress: string): Promise<void> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('  Missing GOOGLE_MAPS_API_KEY — skipping org geocode');
    return;
  }
  try {
    const encoded = encodeURIComponent(orgAddress);
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`);
    const data = await res.json() as { results?: { place_id: string; geometry: { location: { lat: number; lng: number } } }[] };
    if (!data.results?.length) {
      console.warn(`  No geocode results for: ${orgAddress}`);
      return;
    }
    const { place_id, geometry: { location: { lat, lng } } } = data.results[0];
    await supabase.from('users').update({
      location_lat: lat,
      location_lng: lng,
      org_place_id: place_id,
    }).eq('id', orgId);
    console.log(`  Geocoded: lat=${lat.toFixed(4)}, lng=${lng.toFixed(4)}, place_id=${place_id}`);

    const { region_id, method } = await autoAssignRegion(orgId);
    if (region_id) {
      await supabase.from('users').update({ assigned_region_id: region_id, region_assignment_method: method }).eq('id', orgId);
      console.log(`  Region: ${region_id} (${method})`);
    } else {
      console.log(`  Region: no boundary match (will auto-assign on approval)`);
    }
  } catch (err) {
    console.error('  Geocode error:', err);
  }
}

async function fetchCategoryMap(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('audience_categories').select('id, name');
  if (error || !data) {
    console.warn('  Could not fetch audience_categories:', error?.message);
    return {};
  }
  return Object.fromEntries(data.map((c: { id: number; name: string }) => [c.name, c.id]));
}

async function insertAudiencePrefs(volunteerId: string, labels: string[], categoryMap: Record<string, number>) {
  const rows = labels
    .map(label => ({ volunteer_id: volunteerId, category_id: categoryMap[label] }))
    .filter(r => r.category_id != null);

  if (!rows.length) {
    console.warn('  No valid audience categories found — skipping prefs');
    return;
  }

  await supabase.from('volunteer_audience_preferences').delete().eq('volunteer_id', volunteerId);
  const { error } = await supabase.from('volunteer_audience_preferences').insert(rows);
  if (error) {
    console.warn('  Audience prefs insert failed:', error.message);
  } else {
    console.log(`  Audience prefs: ${labels.join(', ')}`);
  }
}

function allEmails() {
  return [
    ...VOLUNTEERS.map(u => u.email),
    ...ORGANIZATIONS.map(u => u.email),
  ];
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed(dryRun: boolean) {
  if (dryRun) {
    console.log('--- DRY RUN --- No changes will be made.\n');
    console.log('Would create:');
    for (const u of VOLUNTEERS) console.log(`  [volunteer] ${u.firstName} ${u.lastName} <${u.email}> — dog: ${u.dogName}`);
    for (const u of ORGANIZATIONS) console.log(`  [organization] ${u.orgName} <${u.email}>`);
    return;
  }

  let created = 0;
  let skipped = 0;
  const categoryMap = await fetchCategoryMap();

  // --- Volunteers ---
  console.log('\n=== Volunteers ===\n');
  for (const v of VOLUNTEERS) {
    console.log(`${v.firstName} ${v.lastName} <${v.email}>`);

    const existing = await clerk.users.getUserList({ emailAddress: [v.email] });
    if ((existing.data ?? []).length > 0) {
      console.log('  Already exists — skipping.\n');
      skipped++;
      continue;
    }

    let clerkId: string;
    let clerkImageUrl: string;
    try {
      const clerkUser = await clerk.users.createUser({
        emailAddress: [v.email],
        password: v.email,
        firstName: v.firstName,
        lastName: v.lastName,
        skipPasswordChecks: true,
        publicMetadata: { role: 'volunteer' },
      });
      clerkId = clerkUser.id;
      clerkImageUrl = clerkUser.imageUrl;
      console.log(`  Clerk: ${clerkId}`);
    } catch (err) {
      console.error('  Clerk create failed:', err);
      continue;
    }

    const { error: userErr } = await supabase.from('users').upsert({
      id: clerkId,
      first_name: v.firstName,
      last_name: v.lastName,
      email: v.email,
      role: 'volunteer',
      status: 'pending',
      profile_complete: true,
      bio: v.bio,
      phone_number: v.phoneNumber,
      postal_code: v.postalCode,
      city: v.city,
      pronouns: v.pronouns,
      travel_distance_km: v.travelDistanceKm,
      general_availability: v.generalAvailability,
      open_to_individual_visits: v.openToIndividualVisits,
      is_browsable: false,
      profile_image: clerkImageUrl,
      vsc_document_url: 'user_317fZNCdJyvidf0bn1uaXcrgjXm/vsc/document.pdf',
      vsc_date_issued: '2026-04-08',
      vsc_renewal_due: '2029-04-08',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (userErr) {
      console.error('  Supabase user insert failed:', userErr.message);
    } else {
      console.log('  Supabase user: OK');
    }

    const { error: dogErr } = await supabase.from('dogs').upsert({
      volunteer_id: clerkId,
      dog_name: v.dogName,
      dog_breed: v.dogBreed,
      dog_age: v.dogAge,
      dog_bio: v.dogBio,
      dog_picture_url: DOG_DEFAULT_PIC,
      vaccine_record_url: 'user_317fZNCdJyvidf0bn1uaXcrgjXm/vsc/document.pdf',
      vaccine_date_issued: '2026-04-08',
      vaccine_expiry_date: '2029-04-08',
      vaccine_cycle_years: 3,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'volunteer_id' });

    if (dogErr) {
      console.warn('  Supabase dog insert failed:', dogErr.message);
    } else {
      console.log(`  Dog (${v.dogName}): OK`);
    }

    await geocodeAndAssign(clerkId, v.postalCode);
    await insertAudiencePrefs(clerkId, v.audiencePrefs, categoryMap);

    await supabase.from('role_change_audit').insert({
      user_id: clerkId,
      old_role: null,
      new_role: 'volunteer',
      source: 'seed_script',
      metadata: { email: v.email, seeded: true },
    });

    created++;
    console.log();
  }

  // --- Organizations ---
  console.log('\n=== Organizations ===\n');
  for (const o of ORGANIZATIONS) {
    console.log(`${o.orgName} <${o.email}>`);

    const existing = await clerk.users.getUserList({ emailAddress: [o.email] });
    if ((existing.data ?? []).length > 0) {
      console.log('  Already exists — skipping.\n');
      skipped++;
      continue;
    }

    let clerkId: string;
    let clerkImageUrl: string;
    try {
      const clerkUser = await clerk.users.createUser({
        emailAddress: [o.email],
        password: o.email,
        firstName: o.firstName,
        lastName: o.lastName,
        skipPasswordChecks: true,
        publicMetadata: { role: 'organization' },
      });
      clerkId = clerkUser.id;
      clerkImageUrl = clerkUser.imageUrl;
      console.log(`  Clerk: ${clerkId}`);
    } catch (err) {
      console.error('  Clerk create failed:', err);
      continue;
    }

    const { error: userErr } = await supabase.from('users').upsert({
      id: clerkId,
      first_name: o.firstName,
      last_name: o.lastName,
      email: o.email,
      role: 'organization',
      status: 'pending',
      profile_complete: true,
      bio: o.bio,
      postal_code: o.postalCode,
      city: o.city,
      org_name: o.orgName,
      org_type: o.orgType,
      org_address: o.orgAddress,
      org_contact_name: o.orgContactName,
      org_contact_phone: o.orgContactPhone,
      fee_tier: o.feeTier,
      profile_image: clerkImageUrl,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (userErr) {
      console.error('  Supabase user insert failed:', userErr.message);
    } else {
      console.log('  Supabase user: OK');
    }

    await geocodeOrgAddress(clerkId, o.orgAddress);

    await supabase.from('role_change_audit').insert({
      user_id: clerkId,
      old_role: null,
      new_role: 'organization',
      source: 'seed_script',
      metadata: { email: o.email, seeded: true },
    });

    created++;
    console.log();
  }

  console.log('===================');
  console.log(`Created: ${created}  Skipped (already existed): ${skipped}`);
  console.log(`\nAll passwords = the user's email address.`);
}

// ---------------------------------------------------------------------------
// Sync (repair: users exist in Clerk but not fully in Supabase)
// ---------------------------------------------------------------------------

async function syncUsers() {
  console.log('Syncing test users from Clerk → Supabase...\n');
  let synced = 0;
  let notFound = 0;
  const categoryMap = await fetchCategoryMap();

  for (const v of VOLUNTEERS) {
    console.log(`[volunteer] ${v.firstName} ${v.lastName} <${v.email}>`);
    const result = await clerk.users.getUserList({ emailAddress: [v.email] });
    const clerkUser = (result.data ?? [])[0];
    if (!clerkUser) {
      console.log('  Not found in Clerk — skipping.\n');
      notFound++;
      continue;
    }
    console.log(`  Clerk ID: ${clerkUser.id}`);

    const { error: userErr } = await supabase.from('users').upsert({
      id: clerkUser.id,
      first_name: v.firstName,
      last_name: v.lastName,
      email: v.email,
      role: 'volunteer',
      status: 'pending',
      profile_complete: true,
      bio: v.bio,
      phone_number: v.phoneNumber,
      postal_code: v.postalCode,
      city: v.city,
      pronouns: v.pronouns,
      travel_distance_km: v.travelDistanceKm,
      general_availability: v.generalAvailability,
      open_to_individual_visits: v.openToIndividualVisits,
      is_browsable: false,
      profile_image: clerkUser.imageUrl,
      vsc_document_url: 'user_317fZNCdJyvidf0bn1uaXcrgjXm/vsc/document.pdf',
      vsc_date_issued: '2026-04-08',
      vsc_renewal_due: '2029-04-08',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (userErr) {
      console.error('  Supabase upsert failed:', userErr.message);
    } else {
      console.log('  Supabase user: OK');
    }

    const { error: dogErr } = await supabase.from('dogs').upsert({
      volunteer_id: clerkUser.id,
      dog_name: v.dogName,
      dog_breed: v.dogBreed,
      dog_age: v.dogAge,
      dog_bio: v.dogBio,
      dog_picture_url: DOG_DEFAULT_PIC,
      vaccine_record_url: 'user_317fZNCdJyvidf0bn1uaXcrgjXm/vsc/document.pdf',
      vaccine_date_issued: '2026-04-08',
      vaccine_expiry_date: '2029-04-08',
      vaccine_cycle_years: 3,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'volunteer_id' });

    if (dogErr) {
      console.warn('  Dog upsert failed:', dogErr.message);
    } else {
      console.log(`  Dog (${v.dogName}): OK`);
    }

    await geocodeAndAssign(clerkUser.id, v.postalCode);
    await insertAudiencePrefs(clerkUser.id, v.audiencePrefs, categoryMap);

    synced++;
    console.log();
  }

  for (const o of ORGANIZATIONS) {
    console.log(`[organization] ${o.orgName} <${o.email}>`);
    const result = await clerk.users.getUserList({ emailAddress: [o.email] });
    const clerkUser = (result.data ?? [])[0];
    if (!clerkUser) {
      console.log('  Not found in Clerk — skipping.\n');
      notFound++;
      continue;
    }
    console.log(`  Clerk ID: ${clerkUser.id}`);

    const { error: userErr } = await supabase.from('users').upsert({
      id: clerkUser.id,
      first_name: o.firstName,
      last_name: o.lastName,
      email: o.email,
      role: 'organization',
      status: 'pending',
      profile_complete: true,
      bio: o.bio,
      postal_code: o.postalCode,
      city: o.city,
      org_name: o.orgName,
      org_type: o.orgType,
      org_address: o.orgAddress,
      org_contact_name: o.orgContactName,
      org_contact_phone: o.orgContactPhone,
      fee_tier: o.feeTier,
      profile_image: clerkUser.imageUrl,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (userErr) {
      console.error('  Supabase upsert failed:', userErr.message);
    } else {
      console.log('  Supabase user: OK');
    }

    await geocodeOrgAddress(clerkUser.id, o.orgAddress);

    synced++;
    console.log();
  }

  console.log('===================');
  console.log(`Synced: ${synced}  Not in Clerk: ${notFound}`);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup() {
  console.log('Deleting test users...\n');
  let deleted = 0;

  for (const email of allEmails()) {
    try {
      const result = await clerk.users.getUserList({ emailAddress: [email] });
      for (const u of result.data ?? []) {
        await clerk.users.deleteUser(u.id);
        console.log(`  Deleted from Clerk: ${email} (${u.id})`);
        deleted++;
      }
    } catch (err) {
      console.warn(`  Could not delete Clerk user ${email}:`, err);
    }
  }

  const { error, count } = await supabase
    .from('users')
    .delete({ count: 'exact' })
    .in('email', allEmails());

  if (error) {
    console.error('Supabase delete error:', error);
  } else {
    console.log(`\nDeleted ${count ?? 0} Supabase row(s).`);
  }

  console.log(`\nDone. ${deleted} Clerk user(s) removed.`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

let run: () => Promise<void>;
if (args.includes('--cleanup')) {
  run = cleanup;
} else if (args.includes('--sync')) {
  run = syncUsers;
} else {
  run = () => seed(args.includes('--dry-run'));
}

run().then(() => process.exit(0)).catch((err: unknown) => { console.error(err); process.exit(1); });
