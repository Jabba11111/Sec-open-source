import type { Scan, ScanRequest, ToolDefinition } from "@sec/shared";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listTools: () => request<ToolDefinition[]>("/tools"),
  listScans: () => request<Scan[]>("/scans"),
  getScan: (id: string) => request<Scan>(`/scans/${id}`),
  createScan: (req: ScanRequest) =>
    request<Scan>("/scans", { method: "POST", body: JSON.stringify(req) }),
  cancelScan: (id: string) =>
    request<void>(`/scans/${id}`, { method: "DELETE" }),
};
