import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ToolDefinition, ToolId, ToolOption } from "@sec/shared";
import { api } from "../api/client";
import { Card } from "../components/Card";

export function NewScanPage() {
  const navigate = useNavigate();
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [selectedId, setSelectedId] = useState<ToolId | "">("");
  const [target, setTarget] = useState("");
  const [options, setOptions] = useState<Record<string, string | number | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listTools().then(setTools).catch((e) => setError(e.message));
  }, []);

  const selected = useMemo(
    () => tools.find((t) => t.id === selectedId),
    [tools, selectedId],
  );

  // Reset opties bij toolwissel met de defaults van de gekozen tool.
  useEffect(() => {
    if (!selected) return;
    const defaults: Record<string, string | number | boolean> = {};
    for (const opt of selected.options) {
      if (opt.default !== undefined) defaults[opt.key] = opt.default;
    }
    setOptions(defaults);
  }, [selected]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const scan = await api.createScan({
        tool: selected.id,
        target,
        options,
      });
      navigate(`/scans/${scan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Nieuwe scan</h1>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm p-3 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card title="1. Kies een tool">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tools.map((t) => (
              <label
                key={t.id}
                className={`block border rounded-lg p-4 cursor-pointer transition ${
                  selectedId === t.id
                    ? "border-brand-600 ring-2 ring-brand-600/30 bg-brand-50/50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="tool"
                  className="sr-only"
                  checked={selectedId === t.id}
                  onChange={() => setSelectedId(t.id)}
                />
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-xs px-2 py-0.5 bg-slate-200 rounded">
                    {t.category}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-1">{t.description}</p>
                {!t.available && (
                  <p className="text-xs text-amber-700 mt-2">
                    Stub-modus: backend levert mock data tot junior dev de runner implementeert.
                  </p>
                )}
              </label>
            ))}
          </div>
        </Card>

        {selected && (
          <>
            <Card title="2. Target">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {selected.category === "SAST"
                  ? "Pad naar codebase op de server"
                  : "URL of hostname van de doel-applicatie"}
              </label>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                required
                placeholder={
                  selected.category === "SAST"
                    ? "/var/repos/mijn-app"
                    : "https://staging.voorbeeld.nl"
                }
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <p className="text-xs text-slate-500 mt-2">
                Scan alleen systemen waarvoor je expliciet toestemming hebt.
              </p>
            </Card>

            {selected.options.length > 0 && (
              <Card title="3. Opties">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selected.options.map((opt) => (
                    <OptionField
                      key={opt.key}
                      option={opt}
                      value={options[opt.key]}
                      onChange={(v) =>
                        setOptions((prev) => ({ ...prev, [opt.key]: v }))
                      }
                    />
                  ))}
                </div>
              </Card>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting || !target}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-md"
              >
                {submitting ? "Bezig..." : "Scan starten"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function OptionField({
  option,
  value,
  onChange,
}: {
  option: ToolOption;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
}) {
  const label = (
    <label className="block text-sm font-medium text-slate-700 mb-1">
      {option.label}
    </label>
  );

  if (option.type === "boolean") {
    return (
      <div className="flex items-center gap-2 pt-6">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          id={`opt-${option.key}`}
        />
        <label htmlFor={`opt-${option.key}`} className="text-sm">
          {option.label}
        </label>
      </div>
    );
  }

  if (option.type === "select") {
    return (
      <div>
        {label}
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
        >
          {option.choices?.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {option.help && <p className="text-xs text-slate-500 mt-1">{option.help}</p>}
      </div>
    );
  }

  return (
    <div>
      {label}
      <input
        type={option.type === "number" ? "number" : "text"}
        value={value === undefined ? "" : String(value)}
        onChange={(e) =>
          onChange(option.type === "number" ? Number(e.target.value) : e.target.value)
        }
        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
      />
      {option.help && <p className="text-xs text-slate-500 mt-1">{option.help}</p>}
    </div>
  );
}
