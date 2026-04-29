// src/hooks/useUserProfile.ts
// Thin wrapper around UserProfileContext.
// Public API is unchanged — all existing callers work without modification.
import { useUserProfileContext } from '@/contexts/UserProfileContext';

export function useUserProfile() {
  return useUserProfileContext();
}
