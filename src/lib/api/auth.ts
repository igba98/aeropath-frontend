import { getData, useStore } from "../store";
import type { Currency, RoleId } from "../domain/types";
import { mutate, nowIso, writeAudit } from "./core";

export const auth = {
  /** Demo persona login. Picks the user's first grant as active role. */
  login(userId: string) {
    mutate((d) => {
      const u = d.users[userId];
      if (!u) throw new Error("Unknown user");
      const roleId: RoleId = u.grants[0]?.roleId ?? "traveller";
      d.session = { ...d.session, userId, roleId, impersonatingUserId: undefined, impersonationStartedAt: undefined, agentClientName: roleId.startsWith("agent") ? d.session.agentClientName : undefined };
      d.users = { ...d.users, [userId]: { ...u, lastActiveAt: nowIso() } };
    });
  },
  logout() {
    mutate((d) => {
      d.session = { userId: null, roleId: "guest", currency: d.session.currency };
    });
  },
  setCurrency(currency: Currency) {
    mutate((d) => { d.session = { ...d.session, currency }; });
  },
  setAgentClient(name: string | undefined) {
    mutate((d) => { d.session = { ...d.session, agentClientName: name }; });
  },
  impersonate(userId: string) {
    mutate((d) => {
      d.session = { ...d.session, impersonatingUserId: userId, impersonationStartedAt: nowIso() };
      writeAudit(d, { scope: "platform", action: "IMPERSONATION_STARTED", resourceType: "user", resourceId: userId });
    });
  },
  stopImpersonation() {
    mutate((d) => {
      const target = d.session.impersonatingUserId;
      d.session = { ...d.session, impersonatingUserId: undefined, impersonationStartedAt: undefined };
      if (target) writeAudit(d, { scope: "platform", action: "IMPERSONATION_ENDED", resourceType: "user", resourceId: target });
    });
  },
  resetDemo() {
    useStore.getState().reset();
  },
  session: () => getData().session,
};
