import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Scan } from "@sec/shared";
import { api } from "../api/client";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";

export function DashboardPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .listScans()
        .then((s) => {
          if (!cancelled) setScans(s);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    load();
    const t = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link
          to="/scans/new"
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md"
        >
          + Nieuwe scan starten
        </Link>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm p-3 rounded">
          {error}
        </div>
      )}

      <Card title={`Scans (${scans.length})`}>
        {scans.length === 0 ? (
          <p className="text-slate-500 text-sm">
            Nog geen scans uitgevoerd. Start er een via &quot;Nieuwe scan&quot;.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 text-xs uppercase">
              <tr>
                <th className="py-2">Tool</th>
                <th>Target</th>
                <th>Status</th>
                <th>Findings</th>
                <th>Aangemaakt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium uppercase">{s.tool}</td>
                  <td className="text-slate-600 truncate max-w-[280px]">
                    {s.target}
                  </td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td>{s.findings.length}</td>
                  <td className="text-slate-500">
                    {new Date(s.createdAt).toLocaleString("nl-NL")}
                  </td>
                  <td className="text-right">
                    <Link
                      to={`/scans/${s.id}`}
                      className="text-brand-600 hover:underline text-sm"
                    >
                      Bekijken &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
