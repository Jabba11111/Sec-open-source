import { v4 as uuid } from "uuid";
import type { Finding, Severity } from "@sec/shared";
import type { ScannerContext } from "../orchestrator";

/**
 * Hulpfunctie voor stubs. Simuleert een scan met log-output en wat
 * voorbeeld-findings, zodat de UI end-to-end getest kan worden vóórdat
 * de echte tool-koppeling klaar is.
 */
export async function simulateScan(
  ctx: ScannerContext,
  toolLabel: string,
  sample: Array<{ severity: Severity; title: string; location?: string }>,
): Promise<void> {
  ctx.log(`[STUB] ${toolLabel} runner is nog niet geïmplementeerd. Mock data wordt gegenereerd.`);
  ctx.log(`[STUB] Target: ${ctx.target}`);
  ctx.log(`[STUB] Opties: ${JSON.stringify(ctx.options)}`);

  await delay(600);
  ctx.log(`${toolLabel}: initialisatie...`);
  await delay(800);
  ctx.log(`${toolLabel}: scannen gestart`);

  const findings: Finding[] = sample.map((s) => ({
    id: uuid(),
    severity: s.severity,
    title: s.title,
    location: s.location,
    description: `(Mock) Voorbeeld-finding gegenereerd door de ${toolLabel}-stub.`,
  }));

  for (const f of findings) {
    await delay(400);
    ctx.log(`${toolLabel}: gevonden [${f.severity.toUpperCase()}] ${f.title}`);
    ctx.addFindings([f]);
  }

  await delay(400);
  ctx.log(`${toolLabel}: scan klaar (${findings.length} findings).`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
