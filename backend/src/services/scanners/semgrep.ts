import type { ScannerContext } from "../orchestrator";
import { simulateScan } from "./_mock";

/**
 * TODO (junior developer): implementeer de Semgrep-koppeling (SAST).
 *
 *  - `ctx.target` is hier een pad naar een lokale checkout, geen URL.
 *  - Voorbeeldcommando:
 *      semgrep --config <ruleset> --json <pad>
 *  - Stream of buffer de JSON-output en map `results[]` naar Finding[].
 *  - Map de Semgrep-severity ("ERROR" | "WARNING" | "INFO") naar onze
 *    Severity-types.
 */
export async function runSemgrep(ctx: ScannerContext): Promise<void> {
  await simulateScan(ctx, "Semgrep", [
    { severity: "high", title: "Hardcoded API key", location: "src/config.ts:14" },
    { severity: "medium", title: "Use of weak hash algorithm (MD5)", location: "src/utils/hash.ts:7" },
    { severity: "low", title: "console.log in productiebuild", location: "src/index.ts:42" },
  ]);
}
