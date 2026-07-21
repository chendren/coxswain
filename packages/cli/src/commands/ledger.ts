/**
 * cox ledger [--spec X] [--since ISO] (R11.2): prints the docs/05 §2 table
 * via the shared renderLedgerTable from @cox/tui.
 */
import { renderLedgerTable } from "@cox/tui";
import type { Ledger } from "@cox/core";

export interface LedgerReportOpts {
  ledger: Ledger;
  specName?: string;
  since?: string;
  write: (line: string) => void;
}

export async function runLedgerReport(opts: LedgerReportOpts): Promise<void> {
  const summary = await opts.ledger.summary({ specName: opts.specName, since: opts.since });
  const label = opts.specName ? `spec ${opts.specName}` : "all sessions";
  opts.write(renderLedgerTable(summary, label));
}
