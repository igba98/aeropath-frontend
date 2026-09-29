"use client";

import { useSearchParams } from "next/navigation";
import type { ID } from "@/domain/types";
import { format } from "@/domain/money";
import { useApp } from "@/store";
import { fmtDate } from "@/lib/dates";

import { Amount } from "@/components/shared/amount";
import { clientStatement, periodLabel } from "@/components/clients/statement";
import { StatementTable } from "@/components/clients/client-statement";
import { DocFooter, DocSection, Letterhead, Party } from "./doc-parts";
import { Paper, PrintMessage, PrintShell } from "./print-shell";
import { statementMessage } from "./share";

/** Client statement (id = client id, ?from&to&currency): period, opening balance, transactions, closing balance. */
export function StatementDoc({ id }: { id: ID }) {
  const db = useApp((s) => s.db)!;
  const sp = useSearchParams();
  const st = clientStatement(db, id, { from: sp.get("from"), to: sp.get("to"), currency: sp.get("currency") });
  if (!st) return <PrintMessage title="Client not found" body="The link may be wrong, or the client was added on another device." />;

  const c = st.client;
  const company = db.settings.company;
  const period = st.from || st.to ? periodLabel(st.from, st.to) : `All dates to ${fmtDate(new Date())}`;
  const terms = c.type === "corporate" ? (c.paymentTermsDays ?? db.settings.defaultPaymentTermsDays) : undefined;

  return (
    <PrintShell title={`Statement ${c.name}`} backHref={`/clients/${c.id}`} share={{ phone: c.phone, text: statementMessage(db, c, format(st.closing), st.from, st.to) }}>
      <Paper>
        <Letterhead
          company={company}
          docTitle="Statement"
          meta={[
            { label: "Period", value: period },
            { label: "Currency", value: st.currency },
            { label: "Printed", value: fmtDate(new Date()) },
          ]}
        />

        <div className="mt-5 grid gap-5 sm:grid-cols-2 print:grid-cols-2">
          <Party label="Client" name={c.name} lines={[c.contactPerson && `Attn. ${c.contactPerson}`, c.address, c.phone, c.email, c.tin && `TIN ${c.tin}`]} />
          <dl className="space-y-1 text-[12.5px] sm:text-right print:text-right">
            <div className="flex justify-between gap-4 sm:justify-end print:justify-end">
              <dt className="text-ink-3">Opening balance</dt>
              <dd>
                <Amount value={st.opening} />
              </dd>
            </div>
            <div className="flex justify-between gap-4 sm:justify-end print:justify-end">
              <dt className="text-ink-3">Closing balance</dt>
              <dd>
                <Amount value={st.closing} className="text-[15px] font-semibold" />
              </dd>
            </div>
            {terms !== undefined && <p className="text-[11px] text-ink-3">Payment terms {terms} days from invoice</p>}
          </dl>
        </div>

        <DocSection title="Transactions">
          <StatementTable rows={st.rows} opening={st.opening} closing={st.closing} totalDebit={st.totalDebit} totalCredit={st.totalCredit} from={st.from} to={st.to} links={false} />
          <p className="mt-1.5 text-[10.5px] text-ink-3">Struck lines were replaced or reversed and do not count towards the balance.</p>
        </DocSection>

        {st.closing.amountMinor > 0 && db.settings.paymentInstructions && (
          <DocSection title="How to pay">
            <p className="text-[12px] whitespace-pre-line text-ink-2">{db.settings.paymentInstructions}</p>
          </DocSection>
        )}

        <DocFooter company={company}>
          {st.closing.amountMinor < 0 && <p className="mb-1 font-medium text-ink-2">We hold {format({ ...st.closing, amountMinor: -st.closing.amountMinor })} in credit for you.</p>}
        </DocFooter>
      </Paper>
    </PrintShell>
  );
}
