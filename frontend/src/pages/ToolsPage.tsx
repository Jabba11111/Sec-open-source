import { useEffect, useState } from "react";
import type { ToolDefinition } from "@sec/shared";
import { api } from "../api/client";
import { Card } from "../components/Card";

export function ToolsPage() {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listTools().then(setTools).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Geïntegreerde tools</h1>
      <p className="text-slate-600 text-sm">
        Hieronder de tools die in deze hub geconfigureerd zijn. De daadwerkelijke
        koppeling met de binary wordt door een junior developer geïmplementeerd
        in <code className="text-xs bg-slate-200 px-1 rounded">backend/src/services/scanners</code>.
      </p>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm p-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tools.map((t) => (
          <Card key={t.id} title={t.name}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs px-2 py-0.5 bg-slate-200 rounded">
                {t.category}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  t.available
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {t.available ? "Geïmplementeerd" : "Stub"}
              </span>
            </div>
            <p className="text-sm text-slate-600">{t.description}</p>

            {t.options.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-700">
                  {t.options.length} opties
                </summary>
                <ul className="mt-2 space-y-1 text-slate-600 text-xs">
                  {t.options.map((opt) => (
                    <li key={opt.key}>
                      <span className="font-mono">{opt.key}</span> &middot;{" "}
                      {opt.label} ({opt.type})
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
