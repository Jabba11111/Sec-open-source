import type { ScannerContext } from "../orchestrator";
import { simulateScan } from "./_mock";

/**
 * ============================================================================
 *  TODO (junior developer): implementeer de echte Nikto-koppeling.
 * ============================================================================
 *
 *  Tip: Nikto kan in XML-mode geschreven worden, wat eenvoudiger te parsen is
 *  dan de standaard tekstoutput.
 *
 *      const out = `/tmp/nikto-${ctx.scanId}.xml`;
 *      const args = ["-h", ctx.target, "-Format", "xml", "-output", out];
 *      if (ctx.options.ssl)    args.push("-ssl");
 *      if (ctx.options.tuning) args.push("-Tuning", String(ctx.options.tuning));
 *
 *      const proc = spawn(process.env.NIKTO_BIN ?? "nikto", args);
 *      proc.stdout.on("data", chunk => ctx.log(chunk.toString().trim()));
 *
 *      await new Promise((resolve, reject) => {
 *        proc.on("close", code => code === 0 ? resolve(null) : reject(...));
 *      });
 *
 *      // Parse `out` met een XML-parser (bv. fast-xml-parser) en map naar
 *      // Finding[]. Verwijder daarna het tijdelijke bestand.
 *
 *  Zelfde veiligheidsregels als bij Nuclei: spawn met array, valideer target,
 *  ondersteun cancellation via SIGTERM.
 * ============================================================================
 */
export async function runNikto(ctx: ScannerContext): Promise<void> {
  await simulateScan(ctx, "Nikto", [
    { severity: "medium", title: "Outdated Apache version detected", location: ctx.target },
    { severity: "low", title: "Allowed HTTP methods include OPTIONS", location: ctx.target },
    { severity: "info", title: "robots.txt aanwezig", location: ctx.target + "/robots.txt" },
  ]);
}
