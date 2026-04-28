import type { Severity } from "@sec/shared";

const STYLES: Record<Severity, string> = {
  info: "bg-slate-200 text-slate-700",
  low: "bg-sky-100 text-sky-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-200 text-orange-900",
  critical: "bg-rose-200 text-rose-900",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-block text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}
