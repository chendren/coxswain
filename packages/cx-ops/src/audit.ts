/**
 * Append-only CXOS audit log (human-gated evidence).
 * Graph: load_audit → append → emit
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface CxAuditEvent {
  at: string;
  kind: string;
  specName: string;
  message: string;
  ref?: string;
  path?: string[];
  /** Human operator identity (from --actor / CX_ACTOR). */
  actor?: string;
}

export interface AuditDeps {
  cxRoot: string;
  now: () => string;
}

function auditPath(deps: AuditDeps, specName: string): string {
  return join(deps.cxRoot, specName, "audit.jsonl");
}

export async function appendAuditEvent(
  deps: AuditDeps,
  event: Omit<CxAuditEvent, "at"> & { at?: string },
): Promise<CxAuditEvent> {
  const full: CxAuditEvent = {
    at: event.at ?? deps.now(),
    kind: event.kind,
    specName: event.specName,
    message: event.message,
    ref: event.ref,
    path: event.path,
    actor: event.actor,
  };
  const dir = join(deps.cxRoot, event.specName);
  await mkdir(dir, { recursive: true });
  await appendFile(auditPath(deps, event.specName), `${JSON.stringify(full)}\n`, "utf8");
  return full;
}

export async function loadAuditEvents(
  deps: AuditDeps,
  specName: string,
  limit = 50,
): Promise<CxAuditEvent[]> {
  try {
    const raw = await readFile(auditPath(deps, specName), "utf8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    const events: CxAuditEvent[] = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as CxAuditEvent);
      } catch {
        /* skip bad lines */
      }
    }
    if (limit <= 0 || events.length <= limit) return events;
    return events.slice(-limit);
  } catch {
    return [];
  }
}
