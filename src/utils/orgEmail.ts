// Admin-managed orgs created without an email get a placeholder address
// (`<synthetic id>@managed.local`) to satisfy the users table. Never send mail to it.
export const MANAGED_PLACEHOLDER_EMAIL_DOMAIN = '@managed.local';

export function isDeliverableEmail(email: string | null | undefined): email is string {
  return !!email && !email.toLowerCase().endsWith(MANAGED_PLACEHOLDER_EMAIL_DOMAIN);
}

/** Longest address we'll accept. Generous; exists only to stop absurd input reaching the DB. */
const MAX_EMAIL_LENGTH = 254;

/** Max entries in `users.additional_emails`. Mirrors the CHECK constraint (Migration 43). */
export const MAX_ADDITIONAL_EMAILS = 5;

/**
 * Deliberately loose. Address validation by regex is a famous rabbit hole, and the only thing we
 * actually need to catch is a typo or a pasted name. Resend is the real validator; anything that
 * gets past this and is still wrong comes back as a bounce.
 */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmailShape(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_SHAPE.test(email);
}

/**
 * Clean a user-supplied list of additional org addresses for storage.
 *
 * Lower-cases and trims, drops anything malformed or undeliverable, de-duplicates, removes the
 * org's own primary address (listing it twice would cc someone on their own mail), and caps the
 * length. Returns the cleaned list plus the entries that were rejected, so the caller can say what
 * happened instead of silently dropping input — a swallowed address is worse than a refused one,
 * because nobody finds out until an invoice doesn't arrive.
 */
export function normalizeAdditionalEmails(
  input: unknown,
  primaryEmail?: string | null,
): { emails: string[]; rejected: string[] } {
  if (!Array.isArray(input)) return { emails: [], rejected: [] };

  const primary = primaryEmail?.trim().toLowerCase() ?? null;
  const emails: string[] = [];
  const rejected: string[] = [];

  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const email = raw.trim().toLowerCase();
    if (!email) continue;

    // Already present, or it's the primary — not an error, just redundant. Dropped quietly.
    if (emails.includes(email) || email === primary) continue;

    if (!isValidEmailShape(email) || !isDeliverableEmail(email)) {
      rejected.push(raw.trim());
      continue;
    }

    if (emails.length >= MAX_ADDITIONAL_EMAILS) {
      rejected.push(raw.trim());
      continue;
    }

    emails.push(email);
  }

  return { emails, rejected };
}

export interface OrgRecipients {
  /** The addressee. Null when nothing deliverable exists — the caller must not send. */
  to: string | null;
  /** Copied addresses. Never contains `to`. */
  cc: string[];
  /** Every deliverable address, for display and for recording on the invoice. */
  all: string[];
}

/**
 * Work out who an organization's mail goes to.
 *
 * The primary address is the addressee and the additional ones are copied — which is the right
 * shape for an invoice, where one person owes the money and the others are kept informed.
 *
 * The exception is an admin-managed org, whose primary is a synthetic `@managed.local` placeholder
 * that exists only to satisfy the NOT NULL on `users.email`. There the first additional address is
 * promoted to addressee, so adding one real address makes a managed org fully reachable without
 * any special-casing at the call sites.
 *
 * Returns `to: null` when there is nothing deliverable at all. Callers must check it; an invoice
 * with no recipient should be recorded and flagged, never sent into the void.
 */
export function resolveOrgRecipients(org: {
  email?: string | null;
  additional_emails?: string[] | null;
}): OrgRecipients {
  const extras = (org.additional_emails ?? []).filter(isDeliverableEmail);
  const primary = isDeliverableEmail(org.email) ? org.email : null;

  if (primary) {
    const cc = extras.filter(e => e.toLowerCase() !== primary.toLowerCase());
    return { to: primary, cc, all: [primary, ...cc] };
  }

  const [promoted, ...rest] = extras;
  if (!promoted) return { to: null, cc: [], all: [] };
  return { to: promoted, cc: rest, all: [promoted, ...rest] };
}
