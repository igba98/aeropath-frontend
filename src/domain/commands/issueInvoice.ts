import type { Command, ID, ISODate } from "../types";
import { issueDocument, type IssueDocumentResult } from "./_documents";

export interface IssueInvoiceInput {
  fileId: ID;
  /** Defaults to the file's due-date rule (§7.3), or the issue date. */
  dueAt?: ISODate;
}

export type IssueInvoiceResult = IssueDocumentResult;

export const issueInvoice: Command<IssueInvoiceInput, IssueInvoiceResult> = (state, input, ctx) => issueDocument(state, input, ctx, "invoice");
