import { Router } from "express";
import type { ScanRequest } from "@sec/shared";
import { scanStore } from "../services/scanStore";
import { startScan } from "../services/orchestrator";
import { TOOL_REGISTRY } from "../services/toolRegistry";

export const scansRouter = Router();

scansRouter.get("/", (_req, res) => {
  res.json(scanStore.list());
});

scansRouter.get("/:id", (req, res) => {
  const scan = scanStore.get(req.params.id);
  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }
  res.json(scan);
});

scansRouter.post("/", (req, res) => {
  const body = req.body as Partial<ScanRequest>;

  if (!body.tool || !body.target) {
    res.status(400).json({ error: "Velden 'tool' en 'target' zijn verplicht." });
    return;
  }

  const tool = TOOL_REGISTRY[body.tool];
  if (!tool) {
    res.status(400).json({ error: `Onbekende tool: ${body.tool}` });
    return;
  }

  if (!isValidTarget(body.target)) {
    res.status(400).json({ error: "Ongeldige target. Gebruik een URL of hostname." });
    return;
  }

  const scan = scanStore.create({
    tool: body.tool,
    target: body.target,
    options: body.options ?? {},
  });

  // Asynchroon starten - niet wachten op afronding.
  startScan(scan.id).catch((err) => {
    console.error("[orchestrator]", err);
  });

  res.status(201).json(scan);
});

scansRouter.delete("/:id", (req, res) => {
  const ok = scanStore.cancel(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }
  res.status(204).end();
});

function isValidTarget(target: string): boolean {
  // Lichte validatie - de scanner zelf controleert verder.
  if (target.length === 0 || target.length > 2048) return false;
  // Geen shell-metacharacters toestaan: deze worden nooit aan een shell doorgegeven,
  // maar dit voorkomt dat een verkeerd geconfigureerde scanner ze tóch interpreteert.
  if (/[;&|`$<>\n\r]/.test(target)) return false;
  return true;
}
