import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';
import { isDeliverableEmail } from '@/utils/orgEmail';
import { formatTimeRange, formatVisitDate } from '@/utils/timeZone';

const PARKING_COVERAGE_LABELS: Record<string, string> = {
  free_on_site: 'Free parking on-site',
  reimbursed_on_site: 'Volunteers pay — reimbursed on-site',
  invoice: 'Volunteers pay — added to invoice',
};

export interface StaffedEmailVisit {
  id: number;
  title: string | null;
  guest_org_name: string | null;
  guest_contact_name: string | null;
  guest_contact_email: string | null;
  organization_id: string | null;
  assigned_pd_id: string | null;
  visit_date: string;
  start_time: string;
  end_time: string;
  address: string;
  location_place_id: string | null;
  parking_coverage: string | null;
  parking_instructions: string | null;
  arrival_instructions: string | null;
  accessibility_notes: string | null;
  event_description: string | null;
}

export const STAFFED_EMAIL_VISIT_FIELDS = `
  id, title, guest_org_name, guest_contact_name, guest_contact_email, organization_id,
  assigned_pd_id, visit_date, start_time, end_time, address, location_place_id,
  parking_coverage, parking_instructions, arrival_instructions, accessibility_notes,
  event_description
`;

// Sends the org "Your visit is going ahead" email. Returns false when there is no
// deliverable recipient (e.g. a managed org with no email and no on-site contact email).
export async function sendVisitStaffedEmail(supabase: SupabaseClient, visit: StaffedEmailVisit): Promise<boolean> {
  let orgEmail: string | null = null;
  let orgContactName: string | null = visit.guest_contact_name;
  let isAccountHolder = false;

  if (visit.organization_id) {
    const { data: orgUser } = await supabase
      .from('users')
      .select('email, org_name, org_contact_name, is_admin_managed')
      .eq('id', visit.organization_id)
      .single();
    if (orgUser) {
      orgContactName = orgContactName || orgUser.org_contact_name || orgUser.org_name;
      isAccountHolder = !orgUser.is_admin_managed;
      if (isDeliverableEmail(orgUser.email)) orgEmail = orgUser.email;
    }
  }
  if (!orgEmail && isDeliverableEmail(visit.guest_contact_email)) {
    orgEmail = visit.guest_contact_email;
  }
  if (!orgEmail) return false;

  let pdName: string | null = null;
  let pdEmail: string | null = null;
  if (!isAccountHolder && visit.assigned_pd_id) {
    const { data: pdUser } = await supabase
      .from('users')
      .select('first_name, last_name, email')
      .eq('id', visit.assigned_pd_id)
      .single();
    if (pdUser) {
      pdName = [pdUser.first_name, pdUser.last_name].filter(Boolean).join(' ') || null;
      pdEmail = pdUser.email ?? null;
    }
  }

  const visitTitle = visit.title || visit.guest_org_name || 'Therapy Dog Visit';
  const formattedDate = formatVisitDate(visit.visit_date);
  const formattedTime = formatTimeRange(visit.start_time, visit.end_time);
  const visitAddressMapLink = visit.address
    ? `https://maps.google.com/?q=${encodeURIComponent(visit.address)}${visit.location_place_id ? `&query_place_id=${visit.location_place_id}` : ''}`
    : null;
  const rawCoverage = visit.parking_coverage;

  await sendTransactionalEmail({
    to: orgEmail,
    subject: `Your visit is going ahead — ${visitTitle}`,
    templateName: 'visitFullyStaffed',
    data: {
      contactName: orgContactName || 'there',
      visitTitle,
      visitDate: formattedDate,
      visitTime: formattedTime,
      visitAddress: visit.address,
      visitAddressMapLink,
      parkingCoverage: rawCoverage ? (PARKING_COVERAGE_LABELS[rawCoverage] ?? rawCoverage) : null,
      parkingInstructions: visit.parking_instructions || null,
      arrivalInstructions: visit.arrival_instructions || null,
      accessibilityNotes: visit.accessibility_notes || null,
      eventDescription: visit.event_description || null,
      hasLogistics: !!(rawCoverage || visit.parking_instructions || visit.arrival_instructions || visit.accessibility_notes),
      isAccountHolder,
      dashboardLink: isAccountHolder ? `${getAppUrl()}/dashboard/organization` : null,
      pdName,
      pdEmail,
      year: new Date().getFullYear(),
    },
  });
  return true;
}
