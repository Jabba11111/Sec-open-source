import { v4 as uuid } from "uuid";
import type { Finding, Scan, ScanRequest, ScanStatus } from "@sec/shared";

/**
 * In-memory store voor scans. Geschikt voor ontwikkeling en demo.
 * Voor productie: vervang door een persistente store (Postgres/SQLite).
 * De interface blijft hetzelfde, dus de rest van de backend hoeft niet te veranderen.
 */
class ScanStore {
  private scans = new Map<string, Scan>();

  list(): Scan[] {
    return Array.from(this.scans.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  get(id: string): Scan | undefined {
    return this.scans.get(id);
  }

  create(req: ScanRequest): Scan {
    const scan: Scan = {
      id: uuid(),
      tool: req.tool,
      target: req.target,
      options: req.options ?? {},
      status: "queued",
      createdAt: new Date().toISOString(),
      findings: [],
      log: [],
    };
    this.scans.set(scan.id, scan);
    return scan;
  }

  update(id: string, patch: Partial<Scan>): Scan | undefined {
    const existing = this.scans.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.scans.set(id, updated);
    return updated;
  }

  setStatus(id: string, status: ScanStatus, error?: string): void {
    const scan = this.scans.get(id);
    if (!scan) return;
    scan.status = status;
    if (status === "running" && !scan.startedAt) {
      scan.startedAt = new Date().toISOString();
    }
    if (status === "completed" || status === "failed" || status === "cancelled") {
      scan.finishedAt = new Date().toISOString();
    }
    if (error) scan.error = error;
  }

  appendLog(id: string, line: string): void {
    const scan = this.scans.get(id);
    if (!scan) return;
    scan.log.push(`[${new Date().toISOString()}] ${line}`);
  }

  addFindings(id: string, findings: Finding[]): void {
    const scan = this.scans.get(id);
    if (!scan) return;
    scan.findings.push(...findings);
  }

  cancel(id: string): boolean {
    const scan = this.scans.get(id);
    if (!scan) return false;
    if (scan.status === "queued" || scan.status === "running") {
      this.setStatus(id, "cancelled");
    }
    return true;
  }
}

export const scanStore = new ScanStore();
