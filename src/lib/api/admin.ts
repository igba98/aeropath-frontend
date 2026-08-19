import { getData } from "../store";
import type { ContentPage, FeatureFlag, Integration, NotificationTemplate, Organisation, PromoCode, RoleGrant, RoleId, Ticket, User } from "../domain/types";
import { actor, genId, mutate, notify, nowIso, writeAudit } from "./core";

export const admin = {
  /* Ops */
  resolveTask(taskId: string, note?: string) {
    mutate((d) => {
      const t = d.opsTasks[taskId];
      d.opsTasks = { ...d.opsTasks, [taskId]: { ...t, status: "resolved", resolvedAt: nowIso() } };
      if (t.bookingId) d.timeline = [...d.timeline, { id: genId("ev"), bookingId: t.bookingId, itemId: t.itemId, at: nowIso(), event: `Ops task resolved · ${t.title}`, note, actorName: actor(d).name, actorRole: actor(d).role, visibility: ["internal"] }];
      writeAudit(d, { scope: "platform", action: "OPS_TASK_RESOLVED", resourceType: "ops_task", resourceId: taskId, after: { note } });
    });
  },
  assignTask(taskId: string, assigneeName: string) {
    mutate((d) => {
      const t = d.opsTasks[taskId];
      d.opsTasks = { ...d.opsTasks, [taskId]: { ...t, assigneeName, status: t.status === "open" ? "in_progress" : t.status } };
    });
  },
  /* Support */
  replyTicket(ticketId: string, text: string) {
    mutate((d) => {
      const t = d.tickets[ticketId];
      d.tickets = { ...d.tickets, [ticketId]: { ...t, status: "pending", assigneeName: t.assigneeName ?? actor(d).name, messages: [...t.messages, { id: genId("m"), from: "agent", text, at: nowIso() }] } };
    });
  },
  setTicketStatus(ticketId: string, status: Ticket["status"]) {
    mutate((d) => { d.tickets = { ...d.tickets, [ticketId]: { ...d.tickets[ticketId], status } }; });
  },
  createTicket(input: Omit<Ticket, "id" | "reference" | "createdAt" | "messages" | "slaDueAt"> & { firstMessage: string }) {
    let id = "";
    mutate((d) => {
      d.counters = { ...d.counters, ticket: d.counters.ticket + 1 };
      id = genId("tkt");
      const { firstMessage, ...rest } = input;
      d.tickets = { ...d.tickets, [id]: { ...rest, id, reference: `TKT-${d.counters.ticket}`, slaDueAt: new Date(Date.now() + 4 * 3_600_000).toISOString(), messages: [{ id: genId("m"), from: "customer", text: firstMessage, at: nowIso() }], createdAt: nowIso() } };
    });
    return id;
  },
  /* Finance */
  approvePayout(payoutId: string) {
    mutate((d) => {
      const p = d.payouts[payoutId];
      d.payouts = { ...d.payouts, [payoutId]: { ...p, status: "approved", approvedBy: actor(d).name } };
      writeAudit(d, { scope: "platform", action: "PAYOUT_APPROVED", resourceType: "payout", resourceId: payoutId, before: { status: p.status }, after: { status: "approved" } });
    });
  },
  submitPayout(payoutId: string) {
    mutate((d) => {
      const p = d.payouts[payoutId];
      d.payouts = { ...d.payouts, [payoutId]: { ...p, status: "pending_approval" } };
    });
  },
  executePayout(payoutId: string) {
    mutate((d) => {
      const p = d.payouts[payoutId];
      const org = d.organisations[p.supplierId];
      d.payouts = { ...d.payouts, [payoutId]: { ...p, status: "executed", executedAt: nowIso() } };
      const group = genId("lg");
      d.ledger = [...d.ledger,
        { id: genId("le"), entryGroupId: group, payoutId, account: "liability.supplier_payable", debitMinor: p.netMinor, creditMinor: 0, currency: p.currency, description: `Payout ${org?.name} · ${p.periodLabel}`, entryDate: nowIso() },
        { id: genId("le"), entryGroupId: group, payoutId, account: "cash.bank", debitMinor: 0, creditMinor: p.netMinor, currency: p.currency, description: `Payout ${org?.name} · ${p.periodLabel}`, entryDate: nowIso() },
      ];
      writeAudit(d, { scope: "platform", action: "PAYOUT_EXECUTED", resourceType: "payout", resourceId: payoutId, after: { netMinor: p.netMinor } });
      for (const u of Object.values(d.users).filter((u) => u.organisationId === p.supplierId)) notify(d, { userId: u.id, audience: "supplier", channel: "email", title: `Payout sent · ${p.periodLabel}`, body: `TZS ${p.netMinor.toLocaleString()} to ${org?.bankName} ${org?.bankAccountMasked}.` });
    });
  },
  /* Supply */
  approveSupplier(orgId: string, decision: "approve" | "reject", note?: string) {
    mutate((d) => {
      const o = d.organisations[orgId];
      d.organisations = { ...d.organisations, [orgId]: { ...o, status: decision === "approve" ? "active" : "suspended", onboardingStep: 6 } };
      writeAudit(d, { scope: "platform", action: decision === "approve" ? "SUPPLIER_APPROVED" : "SUPPLIER_REJECTED", resourceType: "organisation", resourceId: orgId, after: { note } });
    });
  },
  updateOrganisation(orgId: string, patch: Partial<Organisation>) {
    mutate((d) => {
      const o = d.organisations[orgId];
      d.organisations = { ...d.organisations, [orgId]: { ...o, ...patch } };
      writeAudit(d, { scope: `organisation:${orgId}`, action: "ORGANISATION_UPDATED", resourceType: "organisation", resourceId: orgId, before: pick(o, Object.keys(patch)), after: patch });
    });
  },
  respondReview(reviewId: string, text: string) {
    mutate((d) => { d.reviews = { ...d.reviews, [reviewId]: { ...d.reviews[reviewId], response: { text, at: nowIso() } } }; });
  },
  moderateReview(reviewId: string, status: "published" | "flagged" | "pending") {
    mutate((d) => { d.reviews = { ...d.reviews, [reviewId]: { ...d.reviews[reviewId], status } }; writeAudit(d, { scope: "platform", action: "REVIEW_MODERATED", resourceType: "review", resourceId: reviewId, after: { status } }); });
  },
  /* Content */
  upsertPromo(p: Omit<PromoCode, "id"> & { id?: string }) {
    const id = p.id ?? genId("promo");
    mutate((d) => { d.promos = { ...d.promos, [id]: { ...p, id } }; writeAudit(d, { scope: "platform", action: "PROMO_UPSERT", resourceType: "promo", resourceId: id, after: { code: p.code } }); });
    return id;
  },
  upsertContent(c: Omit<ContentPage, "id" | "updatedAt"> & { id?: string }) {
    const id = c.id ?? genId("cp");
    mutate((d) => { d.content = { ...d.content, [id]: { ...c, id, updatedAt: nowIso() } }; writeAudit(d, { scope: "platform", action: "CONTENT_UPSERT", resourceType: "content_page", resourceId: id, after: { slug: c.slug, status: c.status } }); });
    return id;
  },
  /* Admin */
  grantRole(userId: string, grant: RoleGrant) {
    mutate((d) => {
      const u = d.users[userId];
      d.users = { ...d.users, [userId]: { ...u, grants: [...u.grants, grant] } };
      writeAudit(d, { scope: "platform", action: "ROLE_GRANTED", resourceType: "user", resourceId: userId, after: grant });
    });
  },
  revokeRole(userId: string, roleId: RoleId) {
    mutate((d) => {
      const u = d.users[userId];
      d.users = { ...d.users, [userId]: { ...u, grants: u.grants.filter((g) => g.roleId !== roleId) } };
      writeAudit(d, { scope: "platform", action: "ROLE_REVOKED", resourceType: "user", resourceId: userId, before: { roleId } });
    });
  },
  inviteUser(input: { name: string; email: string; phone: string; roleId: RoleId; organisationId?: string }): string {
    const id = genId("usr");
    mutate((d) => {
      const scope = input.organisationId ? (d.organisations[input.organisationId]?.type === "supplier" ? { kind: "supplier" as const, id: input.organisationId } : { kind: "organisation" as const, id: input.organisationId }) : { kind: "platform" as const };
      const u: User = { id, name: input.name, email: input.email, phone: input.phone, locale: "en", avatarTone: "from-slate-400 to-slate-200", grants: [{ roleId: input.roleId, scope }], organisationId: input.organisationId, savedTravellers: [], status: "invited", lastActiveAt: nowIso(), createdAt: nowIso() };
      d.users = { ...d.users, [id]: u };
      writeAudit(d, { scope: input.organisationId ? `organisation:${input.organisationId}` : "platform", action: "USER_INVITED", resourceType: "user", resourceId: id, after: { email: input.email, roleId: input.roleId } });
    });
    return id;
  },
  setUserStatus(userId: string, status: User["status"]) {
    mutate((d) => { d.users = { ...d.users, [userId]: { ...d.users[userId], status } }; writeAudit(d, { scope: "platform", action: "USER_STATUS_CHANGED", resourceType: "user", resourceId: userId, after: { status } }); });
  },
  toggleFlag(key: string, enabled: boolean) {
    mutate((d) => { const f = d.flags[key]; d.flags = { ...d.flags, [key]: { ...f, enabled } }; writeAudit(d, { scope: "platform", action: "FLAG_TOGGLED", resourceType: "feature_flag", resourceId: key, before: { enabled: f.enabled }, after: { enabled } }); });
  },
  upsertFlag(f: FeatureFlag) {
    mutate((d) => { d.flags = { ...d.flags, [f.key]: f }; });
  },
  retryIntegration(id: string) {
    mutate((d) => { const i = d.integrations[id]; d.integrations = { ...d.integrations, [id]: { ...i, status: "healthy", lastCheckAt: nowIso(), successRatePct: Math.min(99.9, i.successRatePct + 5) } as Integration }; writeAudit(d, { scope: "platform", action: "INTEGRATION_RETRIED", resourceType: "integration", resourceId: id }); });
  },
  updateSettings(patch: Partial<ReturnType<typeof getData>["settings"]>) {
    mutate((d) => { const before = d.settings; d.settings = { ...d.settings, ...patch }; writeAudit(d, { scope: "platform", action: "SETTINGS_CHANGED", resourceType: "settings", resourceId: Object.keys(patch).join(","), before: pick(before, Object.keys(patch)), after: patch }); });
  },
  upsertTemplate(t: NotificationTemplate) {
    mutate((d) => { d.templates = { ...d.templates, [t.id]: t }; writeAudit(d, { scope: "platform", action: "TEMPLATE_UPDATED", resourceType: "notification_template", resourceId: t.id }); });
  },
  setSimulator(patch: Partial<ReturnType<typeof getData>["simulator"]>) {
    mutate((d) => { d.simulator = { ...d.simulator, ...patch }; });
  },
  markNotificationsRead(userId: string) {
    mutate((d) => { d.notifications = d.notifications.map((n) => (n.userId === userId ? { ...n, read: true } : n)); });
  },
  /* Partner org self service */
  requestCreditIncrease(orgId: string, amountMinor: number) {
    mutate((d) => {
      writeAudit(d, { scope: `organisation:${orgId}`, action: "CREDIT_INCREASE_REQUESTED", resourceType: "organisation", resourceId: orgId, after: { amountMinor } });
      notify(d, { userId: "usr_finance_manager", audience: "internal", channel: "in_app", title: `Credit increase requested · ${d.organisations[orgId]?.name}`, body: `+TZS ${amountMinor.toLocaleString()}` });
    });
  },
  topUpCredit(orgId: string, amountMinor: number) {
    mutate((d) => {
      const o = d.organisations[orgId];
      d.organisations = { ...d.organisations, [orgId]: { ...o, creditUsedMinor: Math.max(0, (o.creditUsedMinor ?? 0) - amountMinor) } };
      const group = genId("lg");
      d.ledger = [...d.ledger,
        { id: genId("le"), entryGroupId: group, account: "cash.bank", debitMinor: amountMinor, creditMinor: 0, currency: "TZS", description: `Credit top up · ${o.name}`, entryDate: nowIso() },
        { id: genId("le"), entryGroupId: group, account: "receivable.agent_credit", debitMinor: 0, creditMinor: amountMinor, currency: "TZS", description: `Credit top up · ${o.name}`, entryDate: nowIso() },
      ];
      writeAudit(d, { scope: `organisation:${orgId}`, action: "CREDIT_TOPUP", resourceType: "organisation", resourceId: orgId, after: { amountMinor } });
    });
  },
  saveTraveller(userId: string, t: User["savedTravellers"][number]) {
    mutate((d) => {
      const u = d.users[userId];
      const exists = u.savedTravellers.some((s) => s.id === t.id);
      d.users = { ...d.users, [userId]: { ...u, savedTravellers: exists ? u.savedTravellers.map((s) => (s.id === t.id ? t : s)) : [...u.savedTravellers, t] } };
    });
  },
  removeTraveller(userId: string, id: string) {
    mutate((d) => { const u = d.users[userId]; d.users = { ...d.users, [userId]: { ...u, savedTravellers: u.savedTravellers.filter((s) => s.id !== id) } }; });
  },
  updateUser(userId: string, patch: Partial<User>) {
    mutate((d) => { d.users = { ...d.users, [userId]: { ...d.users[userId], ...patch } }; });
  },
};

function pick<T extends object>(o: T, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, (o as Record<string, unknown>)[k]]));
}
