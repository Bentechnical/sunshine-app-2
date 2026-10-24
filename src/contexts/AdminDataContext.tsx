// src/contexts/AdminDataContext.tsx
// Shares the payloads already fetched for the admin/PD nav badges with anything else on the page
// that needs them — in practice, AdminDashboardHome.
//
// DashboardLayout fetches five endpoints to derive the sidebar counts. AdminDashboardHome was
// fetching the identical five to build its cards, so landing on the dashboard cost all five twice:
// about five extra round trips, and roughly five seconds on a high-latency connection.
//
// Deliberately a share of what's already loaded rather than a general-purpose cache. The counts
// hook stays the owner of the fetch and of the badge rules; consumers that need the underlying
// rows take them from here and apply their own filtering, exactly as they did before.

'use client';

import React, { createContext, useContext } from 'react';
import type { AdminAlertRaw } from '@/hooks/useAdminAlertCounts';

const AdminDataContext = createContext<AdminAlertRaw | null>(null);

export function AdminDataProvider({
  value,
  children,
}: {
  value: AdminAlertRaw;
  children: React.ReactNode;
}) {
  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
}

/**
 * Returns the shared payloads, or null when they aren't available — outside the provider, or
 * before the first fetch resolves. Callers must handle null by falling back to their own fetch,
 * so a consumer rendered somewhere unexpected degrades rather than breaks.
 */
export function useAdminData(): AdminAlertRaw | null {
  const ctx = useContext(AdminDataContext);
  return ctx && ctx.loaded ? ctx : null;
}
