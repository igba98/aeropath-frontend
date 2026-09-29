/**
 * Commands — the only way to change state (spec §3.4, §6.3).
 * Each is `Command<Input, Result>`: (state, input, ctx) => CommandResult. Run them through `runCommand` (./run),
 * which appends the returned audit events to state.audit.
 */

export * from "./createClient";
export * from "./updateClient";
export * from "./archiveClient";
export * from "./upsertTraveller";
export * from "./removeTraveller";
export * from "./createBookingFile";
export * from "./updateBookingFile";
export * from "./reassignFile";
export * from "./cancelBookingFile";
export * from "./addServiceLine";
export * from "./updateServiceLine";
export * from "./transitionLine";
export * from "./voidLine";
export * from "./requestRefund";
export * from "./decideRefund";
export * from "./payRefund";
export * from "./recordPayment";
export * from "./verifyPayment";
export * from "./reversePayment";
export * from "./issueInvoice";
export * from "./issueQuote";
export * from "./recordSupplierPayment";
export * from "./recordExpense";
export * from "./updateExpense";
export * from "./deleteExpense";
export * from "./updateSettings";
export * from "./upsertUser";
export * from "./upsertMoneyAccount";
export * from "./upsertSupplier";
export * from "./importFromProvider";
export * from "./resetDemoData";
export * from "./sendMessage";
// Accounting
export * from "./postJournal";
export * from "./reverseJournal";
export * from "./transferMoney";
export * from "./recordOpeningBalances";
export * from "./recordCashCount";
export * from "./reconcileAccount";
export { runCommand } from "./run";
export type { LinePricingInput } from "./_lines";
export type { IssueDocumentResult } from "./_documents";

import { createClient } from "./createClient";
import { updateClient } from "./updateClient";
import { archiveClient } from "./archiveClient";
import { upsertTraveller } from "./upsertTraveller";
import { removeTraveller } from "./removeTraveller";
import { createBookingFile } from "./createBookingFile";
import { updateBookingFile } from "./updateBookingFile";
import { reassignFile } from "./reassignFile";
import { cancelBookingFile } from "./cancelBookingFile";
import { addServiceLine } from "./addServiceLine";
import { updateServiceLine } from "./updateServiceLine";
import { transitionLine } from "./transitionLine";
import { voidLine } from "./voidLine";
import { requestRefund } from "./requestRefund";
import { decideRefund } from "./decideRefund";
import { payRefund } from "./payRefund";
import { recordPayment } from "./recordPayment";
import { verifyPayment } from "./verifyPayment";
import { reversePayment } from "./reversePayment";
import { issueInvoice } from "./issueInvoice";
import { issueQuote } from "./issueQuote";
import { recordSupplierPayment } from "./recordSupplierPayment";
import { recordExpense } from "./recordExpense";
import { updateExpense } from "./updateExpense";
import { deleteExpense } from "./deleteExpense";
import { updateSettings } from "./updateSettings";
import { upsertUser } from "./upsertUser";
import { upsertMoneyAccount } from "./upsertMoneyAccount";
import { upsertSupplier } from "./upsertSupplier";
import { importFromProvider } from "./importFromProvider";
import { resetDemoData } from "./resetDemoData";
import { postJournal } from "./postJournal";
import { sendMessage } from "./sendMessage";
import { reverseJournal } from "./reverseJournal";
import { transferMoney } from "./transferMoney";
import { recordOpeningBalances } from "./recordOpeningBalances";
import { recordCashCount } from "./recordCashCount";
import { saveReconciliation, completeReconciliation, discardReconciliation } from "./reconcileAccount";

/** All commands by name (handy for the store's dispatch and for the seed script). */
export const commands = {
  createClient,
  updateClient,
  archiveClient,
  upsertTraveller,
  removeTraveller,
  createBookingFile,
  updateBookingFile,
  reassignFile,
  cancelBookingFile,
  addServiceLine,
  updateServiceLine,
  transitionLine,
  voidLine,
  requestRefund,
  decideRefund,
  payRefund,
  recordPayment,
  verifyPayment,
  reversePayment,
  issueInvoice,
  issueQuote,
  recordSupplierPayment,
  recordExpense,
  updateExpense,
  deleteExpense,
  updateSettings,
  upsertUser,
  upsertMoneyAccount,
  upsertSupplier,
  importFromProvider,
  resetDemoData,
  postJournal,
  reverseJournal,
  transferMoney,
  recordOpeningBalances,
  recordCashCount,
  saveReconciliation,
  completeReconciliation,
  discardReconciliation,
  sendMessage,
} as const;

export type CommandName = keyof typeof commands;
