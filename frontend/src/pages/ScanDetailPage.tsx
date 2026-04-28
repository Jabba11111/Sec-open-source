import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Scan } from "@sec/shared";
import { api } from "../api/client";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { SeverityBadge } from "../components/SeverityBadge";

export function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = () =>
      api
        .getScan(id)
        .then((s) => {
          if (!cancelled) setScan(s);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    load();
    const t = setInterval(() => {
      if (scan && (scan.status === "completed" || scan.status === "failed" || scan.status === "cancelled")) {
        return;
      }
      load();
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id, scan?.status]);

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm p-3 rounded">
        {error}
      </div>
    );
  }
  if (!scan) return <p className="text-slate-500">Scan laden...</p>;

  async function cancel() {
    if (!id) return;
    await api.cancelScan(id);
  }

  const isLive = scan.status === "queued" || scan.status === "running";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-brand-600 hover:underline">
            &larr; Dashboard
          </Link>
          <h1 className="text-2xl font-bold mt-1">
            <span className="uppercase">{scan.tool}</span>{" "}
            <span className="text-slate-400 font-normal">scan</span>
          </h1>
          <p className="text-slate-600 text-sm mt-1 break-all">{scan.target}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={scan.status} />
          {isLive && (
            <button
              onClick={cancel}
              className="text-sm border border-rose-300 text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-md"
            >
              Annuleren
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <Card title="Aangemaakt">
          {new Date(scan.createdAt).toLocaleString("nl-NL")}
        </Card>
        <Card title="Gestart">
          {scan.startedAt
            ? new Date(scan.startedAt).toLocaleString("nl-NL")
            : "—"}
        </Card>
        <Card title="Afgerond">
          {scan.finishedAt
            ? new Date(scan.finishedAt).toLocaleString("nl-NL")
            : "—"}
        </Card>
      </div>

      <Card title={`Findings (${scan.findings.length})`}>
        {scan.findings.length === 0 ? (
          <p className="text-slate-500 text-sm">Nog geen findings.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {scan.findings.map((f) => (
              <li key={f.id} className="py-3">
                <div className="flex items-center gap-3">
                  <SeverityBadge severity={f.severity} />
                  <span className="font-medium">{f.title}</span>
                </div>
                {f.location && (
                  <p className="text-xs text-slate-500 mt-1 break-all">
                    {f.location}
                  </p>
                )}
                {f.description && (
                  <p className="text-sm text-slate-600 mt-1">{f.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Live log">
        <pre className="bg-slate-900 text-slate-100 text-xs rounded-md p-3 max-h-80 overflow-auto whitespace-pre-wrap">
          {scan.log.length === 0 ? "(leeg)" : scan.log.join("\n")}
        </pre>
        {scan.error && (
          <p className="text-rose-700 text-sm mt-2">Fout: {scan.error}</p>
        )}
      </Card>
    </div>
  );
}
