// src/utils/compliance.ts
// Shared compliance-status derivation. Pure — no React, no Supabase — so it can be used on both
// the server (API routes) and the client.
//
// NOTE: this same logic is currently reimplemented in src/app/api/admin/compliance/route.ts and in
// three volunteer-facing dashboard fragments. Those copies are left alone for now; see
// docs/TECH_DEBT.md.

export type ComplianceStatus =
  | 'missing'
  | 'pending_review'
  | 'approved'
  | 'expiring'
  | 'expired'
  | 'rejected';

/** Days before expiry at which a document starts reporting as 'expiring'. */
export const EXPIRY_WARNING_DAYS = 30;

/**
 * Derive a document's compliance status from its URL, expiry date and verification state.
 *
 * Order matters: a rejected document reports 'rejected' even if it hasn't expired, and an
 * unreviewed document reports 'pending_review' before expiry is considered at all — an unverified
 * document's dates aren't trustworthy yet.
 */
export function getComplianceStatus(
  documentUrl: string | null,
  expiryDate: string | null,
  verificationStatus: string | null,
): ComplianceStatus {
  if (!documentUrl) return 'missing';
  if (verificationStatus === 'rejected') return 'rejected';
  if (!verificationStatus || verificationStatus === 'pending_review') return 'pending_review';
  // verificationStatus === 'approved'
  if (!expiryDate) return 'approved';
  const daysUntilExpiry = (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= EXPIRY_WARNING_DAYS) return 'expiring';
  return 'approved';
}
