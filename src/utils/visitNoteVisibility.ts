// Who may see visits.admin_note — the single org-facing note on a visit.
//
// Internal admin/PD commentary lives in the visit_notes table instead and is returned only
// by /api/admin/* routes behind requireAdminOrPd. Nothing here applies to those.
//
// The org note is released only once there is a decision to convey. Before that, a visit can
// already carry text written from the admin "Note for Organization" box, which the org should
// not see while their request is still pending. Volunteers never see it at any status.

const ORG_NOTE_VISIBLE_STATUSES: readonly string[] = ['approved', 'declined', 'cancelled'];

export function orgVisibleAdminNote(status: string, note: string | null | undefined): string | null {
  return ORG_NOTE_VISIBLE_STATUSES.includes(status) ? (note ?? null) : null;
}

// For volunteer-facing payloads: drop the field rather than nulling it, since volunteers
// have no status at which they should receive it.
export function withoutAdminNote<T extends Record<string, unknown>>(visit: T): Omit<T, 'admin_note'> {
  const rest = { ...visit };
  delete (rest as Record<string, unknown>).admin_note;
  return rest as Omit<T, 'admin_note'>;
}
