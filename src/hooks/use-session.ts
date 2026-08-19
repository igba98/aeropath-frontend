"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { hasPermission, INTERNAL_ROLES, SUPPLIER_ROLES, ROLE_LABELS } from "@/lib/domain/permissions";
import type { Organisation, RoleId, User } from "@/lib/domain/types";

export interface SessionView {
  hydrated: boolean;
  user?: User;
  /** the real signed in user, even while impersonating */
  actorUser?: User;
  roleId: RoleId;
  roleLabel: string;
  org?: Organisation;
  currency: "TZS" | "USD";
  isGuest: boolean;
  overlay: "consumer";
  isInternal: boolean;
  isSupplier: boolean;
  impersonating: boolean;
  agentClientName?: string;
  can: (permission: string) => boolean;
}

export function useSession(): SessionView {
  const hydrated = useStore((s) => s.hydrated);
  const session = useStore((s) => s.session);
  const users = useStore((s) => s.users);
  const organisations = useStore((s) => s.organisations);

  return useMemo(() => {
    const actorUser = session.userId ? users[session.userId] : undefined;
    const user = session.impersonatingUserId ? users[session.impersonatingUserId] : actorUser;
    const roleId = session.impersonatingUserId ? (user?.grants[0]?.roleId ?? "traveller") : session.roleId;
    const org = user?.organisationId ? organisations[user.organisationId] : undefined;
    return {
      hydrated,
      user, actorUser, roleId,
      roleLabel: ROLE_LABELS[roleId] ?? "Guest",
      org,
      currency: session.currency,
      isGuest: !session.userId,
      overlay: "consumer" as const,
      isInternal: INTERNAL_ROLES.includes(roleId),
      isSupplier: SUPPLIER_ROLES.includes(roleId),
      impersonating: Boolean(session.impersonatingUserId),
      agentClientName: session.agentClientName,
      can: (p: string) => hasPermission([roleId], p),
    };
  }, [hydrated, session, users, organisations]);
}
