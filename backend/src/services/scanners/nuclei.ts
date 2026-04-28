import type { ScannerContext } from "../orchestrator";
import { simulateScan } from "./_mock";

/**
 * ============================================================================
 *  TODO (junior developer): implementeer de echte Nuclei-koppeling.
 * ============================================================================
 *
 *  Aanpak:
 *  --------
 *  1. Zorg dat de `nuclei` binary beschikbaar is in PATH (of maak het pad
 *     configureerbaar via een env var, bv. `NUCLEI_BIN`).
 *  2. Bouw een argumentenarray op basis van `ctx.options`. Voorbeeld:
 *
 *       const args = [
 *         "-u", ctx.target,
 *         "-jsonl",                      // JSON Lines output, makkelijker te parsen
 *         "-severity", String(ctx.options.severity ?? "low"),
 *         "-rate-limit", String(ctx.options.rateLimit ?? 150),
 *       ];
 *       if (ctx.options.templates) args.push("-t", String(ctx.options.templates));
 *
 *  3. Spawn met `child_process.spawn` (NOOIT met `exec` of een shell-string,
 *     om command injection te voorkomen). Geef `args` als array door.
 *
 *       const proc = spawn(process.env.NUCLEI_BIN ?? "nuclei", args);
 *
 *  4. Lees `proc.stdout` regel voor regel. Iedere regel is een JSON-object;
 *     parse en map naar het `Finding` type uit `@sec/shared`:
 *
 *       {
 *         id: uuid(),
 *         severity: json.info.severity,
 *         title:    json.info.name,
 *         location: json["matched-at"],
 *         reference: json.info.reference,
 *         raw: json,
 *       }
 *
 *     Roep `ctx.addFindings([finding])` aan zodra je een finding hebt.
 *  5. Stuur stderr-regels door via `ctx.log(...)`.
 *  6. Wacht op `proc.on("close", code => ...)`. Bij code !== 0: throw
 *     een Error met de stderr-output zodat de orchestrator de scan op
 *     "failed" zet.
 *  7. Implementeer cancel-ondersteuning: lees scanStore-status en doe
 *     `proc.kill("SIGTERM")` als de status "cancelled" wordt.
 *
 *  Veiligheid:
 *  -----------
 *  - Geef NOOIT user-input aan een shell. Gebruik altijd de array-vorm van
 *    spawn.
 *  - Valideer `ctx.target` opnieuw (alleen http(s) URL of hostname).
 *  - Limiteer concurrency: voorkom dat tientallen scans tegelijk draaien
 *    (zie `services/orchestrator.ts` voor een toekomstige queue).
 * ============================================================================
 */
export async function runNuclei(ctx: ScannerContext): Promise<void> {
  await simulateScan(ctx, "Nuclei", [
    { severity: "high", title: "Apache HTTPD - Path Traversal (CVE-2021-41773)", location: ctx.target + "/cgi-bin/" },
    { severity: "medium", title: "Missing Security Headers", location: ctx.target },
    { severity: "info", title: "Server fingerprint disclosed", location: ctx.target },
  ]);
}
