// Gedeelde types tussen frontend en backend.
// Eén bron van waarheid voor het API-contract.

export type ToolId = "nuclei" | "nikto" | "zap" | "semgrep";

export type ScanCategory = "SAST" | "DAST";

export interface ToolDefinition {
  id: ToolId;
  name: string;
  category: ScanCategory;
  description: string;
  /** Of de tool momenteel werkelijk geïmplementeerd is in de backend. */
  available: boolean;
  /** Welke optionele parameters de UI moet renderen. */
  options: ToolOption[];
}

export interface ToolOption {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  default?: string | number | boolean;
  choices?: string[];
  required?: boolean;
  help?: string;
}

export type ScanStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface ScanRequest {
  tool: ToolId;
  target: string;
  options?: Record<string, string | number | boolean>;
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  description?: string;
  location?: string;
  reference?: string[];
  raw?: unknown;
}

export interface Scan {
  id: string;
  tool: ToolId;
  target: string;
  status: ScanStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  options?: Record<string, string | number | boolean>;
  findings: Finding[];
  log: string[];
  error?: string;
}

export interface ApiError {
  error: string;
  details?: string;
}
