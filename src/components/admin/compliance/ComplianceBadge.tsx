// src/components/admin/compliance/ComplianceBadge.tsx
// Compliance status pill + the admin-side date formatters that go with it.
// Extracted unchanged from AdminManageVolunteers.tsx.

import type { ComplianceStatus } from '@/utils/compliance';

export const statusConfig: Record<ComplianceStatus, { label: string; classes: string }> = {
  missing:        { label: 'Missing',       classes: 'bg-red-100 text-red-700' },
  pending_review: { label: 'Needs Review',  classes: 'bg-amber-100 text-amber-800' },
  approved:       { label: 'Compliant',     classes: 'bg-green-100 text-green-700' },
  expiring:       { label: 'Expiring Soon', classes: 'bg-amber-100 text-amber-700' },
  expired:        { label: 'Expired',       classes: 'bg-red-100 text-red-800' },
  rejected:       { label: 'Rejected',      classes: 'bg-red-100 text-red-700' },
};

export function ComplianceBadge({ status }: { status: ComplianceStatus | undefined }) {
  if (!status) return <span className="text-xs text-gray-400">—</span>;
  const { label, classes } = statusConfig[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${classes}`}>
      {label}
    </span>
  );
}

/**
 * Format a date-only string (YYYY-MM-DD) for display.
 *
 * The `T00:00:00` suffix is deliberate: without it the browser parses a bare date as UTC midnight
 * and renders the previous day for anyone west of Greenwich.
 */
export function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/** Format a full timestamp for audit lines ("Approved 3 Oct 2026, 2:15 pm by …"). */
export function formatDateTime(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
