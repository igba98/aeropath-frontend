"use client";

import { useSession } from "@/hooks/use-session";

/**
 * UI convenience only, never the security boundary (tech spec §17.3).
 * In production the server refuses independently; here the mock API guards write paths.
 */
export function PermissionGate({ permission, children, fallback = null }: { permission: string; children: React.ReactNode; fallback?: React.ReactNode }) {
  const { can } = useSession();
  return <>{can(permission) ? children : fallback}</>;
}
