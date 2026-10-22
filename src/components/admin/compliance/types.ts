// src/components/admin/compliance/types.ts
// Shared types for the admin/PD compliance review UI.
//
// Extracted from AdminManageVolunteers.tsx so that AdminUserRequests, the volunteer detail view and
// the volunteer list can all import them without importing a 1,200-line component.

import type { ComplianceStatus } from '@/utils/compliance';

export type { ComplianceStatus };

export interface DogProfile {
  dog_name: string;
  dog_breed: string;
  dog_bio: string;
  dog_picture_url: string;
  dog_age?: number;
}

/** One reviewable document's state, as returned by GET /api/admin/compliance. */
export interface ComplianceDocument {
  status: ComplianceStatus;
  date_issued: string | null;
  document_url: string | null;
  verification_status: string | null;
  verified_at: string | null;
  verified_by: string | null;
  verified_by_name: string | null;
  upload_comment: string | null;
  rejection_reason: string | null;
}

export interface ComplianceRecord {
  vsc: ComplianceDocument & { renewal_due: string | null };
  vaccine: ComplianceDocument & { expiry_date: string | null; dog_name: string | null };
}

/** Short-lived signed storage URLs for document previews. Expire after an hour. */
export type SignedDocs = {
  vsc_signed_url: string | null;
  vaccine_signed_url: string | null;
  vaccine_supporting_signed_urls: string[];
  dog_name: string | null;
};

/** What PATCH /api/admin/compliance/[id] returns after an approve or reject. */
export type VerificationResult = {
  verified_at: string | null;
  verified_by: string | null;
  verified_by_name: string | null;
  rejection_reason: string | null;
};
