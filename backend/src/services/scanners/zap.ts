import type { ScannerContext } from "../orchestrator";
import { simulateScan } from "./_mock";

/**
 * TODO (junior developer): implementeer de OWASP ZAP-koppeling.
 *
 * Aanpak:
 *  - ZAP draait als daemon. De makkelijkste integratie is via de Docker-images
 *    `zaproxy/zap-stable` met de `zap-baseline.py` of `zap-full-scan.py` scripts.
 *  - Of gebruik `zap-cli` / de REST-API van een lopende ZAP-daemon.
 *  - Output: JSON-rapport, parse en map naar Finding[].
 */
export async function runZap(ctx: ScannerContext): Promise<void> {
  await simulateScan(ctx, "OWASP ZAP", [
    { severity: "high", title: "Cross-Site Scripting (Reflected)", location: ctx.target + "/search?q=" },
    { severity: "medium", title: "Cookie zonder HttpOnly-flag", location: ctx.target },
  ]);
}
