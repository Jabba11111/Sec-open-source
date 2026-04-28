import type { Finding, ToolId } from "@sec/shared";
import { scanStore } from "./scanStore";
import { runNuclei } from "./scanners/nuclei";
import { runNikto } from "./scanners/nikto";
import { runZap } from "./scanners/zap";
import { runSemgrep } from "./scanners/semgrep";

/**
 * Context die aan elke scanner wordt doorgegeven. Junior developers
 * gebruiken deze callbacks om voortgang en findings terug te rapporteren,
 * zodat de UI live geüpdatet wordt zonder dat de scanner het scanStore kent.
 */
export interface ScannerContext {
  scanId: string;
  target: string;
  options: Record<string, string | number | boolean>;
  log: (line: string) => void;
  addFindings: (findings: Finding[]) => void;
}

export type ScannerFn = (ctx: ScannerContext) => Promise<void>;

const SCANNERS: Record<ToolId, ScannerFn> = {
  nuclei: runNuclei,
  nikto: runNikto,
  zap: runZap,
  semgrep: runSemgrep,
};

export async function startScan(scanId: string): Promise<void> {
  const scan = scanStore.get(scanId);
  if (!scan) return;

  const runner = SCANNERS[scan.tool];
  if (!runner) {
    scanStore.setStatus(scanId, "failed", `Geen runner voor tool '${scan.tool}'.`);
    return;
  }

  scanStore.setStatus(scanId, "running");
  scanStore.appendLog(scanId, `Scan gestart voor ${scan.tool} op ${scan.target}`);

  try {
    await runner({
      scanId,
      target: scan.target,
      options: scan.options ?? {},
      log: (line) => scanStore.appendLog(scanId, line),
      addFindings: (findings) => scanStore.addFindings(scanId, findings),
    });

    // Status kan al op "cancelled" gezet zijn door de gebruiker.
    const after = scanStore.get(scanId);
    if (after && after.status === "running") {
      scanStore.setStatus(scanId, "completed");
      scanStore.appendLog(scanId, "Scan succesvol afgerond.");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    scanStore.setStatus(scanId, "failed", message);
    scanStore.appendLog(scanId, `Scan gefaald: ${message}`);
  }
}
