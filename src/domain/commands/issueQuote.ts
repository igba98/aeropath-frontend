import type { Command, ID } from "../types";
import { issueDocument, type IssueDocumentResult } from "./_documents";

export interface IssueQuoteInput {
  fileId: ID;
}

export type IssueQuoteResult = IssueDocumentResult;

export const issueQuote: Command<IssueQuoteInput, IssueQuoteResult> = (state, input, ctx) => issueDocument(state, { fileId: input?.fileId }, ctx, "quote");
