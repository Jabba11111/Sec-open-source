import type { ScanStatus } from "@sec/shared";

const STYLES: Record<ScanStatus, string> = {
  queued: "bg-slate-200 text-slate-700",
  running: "bg-blue-100 text-blue-800 animate-pulse",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  cancelled: "bg-amber-100 text-amber-800",
};

const LABELS: Record<ScanStatus, string> = {
  queued: "In wachtrij",
  running: "Bezig",
  completed: "Afgerond",
  failed: "Gefaald",
  cancelled: "Geannuleerd",
};

export function StatusBadge({ status }: { status: ScanStatus }) {
  return (
    <span
      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
