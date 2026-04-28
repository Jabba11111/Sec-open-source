import type { ToolDefinition, ToolId } from "@sec/shared";

/**
 * Centrale registry van alle tools die via de UI aangeboden worden.
 * Wanneer een junior developer een nieuwe tool toevoegt:
 *   1. Voeg een entry toe aan deze registry.
 *   2. Implementeer een runner in `services/scanners/<tool>.ts`.
 *   3. Registreer de runner in `services/orchestrator.ts`.
 */
export const TOOL_REGISTRY: Record<ToolId, ToolDefinition> = {
  nuclei: {
    id: "nuclei",
    name: "Nuclei",
    category: "DAST",
    description:
      "Template-gebaseerde vulnerability scanner van ProjectDiscovery. Snel, breed inzetbaar en uitbreidbaar via YAML-templates.",
    available: false, // Junior dev zet op true zodra de runner werkend is.
    options: [
      {
        key: "severity",
        label: "Minimale severity",
        type: "select",
        choices: ["info", "low", "medium", "high", "critical"],
        default: "low",
        help: "Filter findings op minimale ernst.",
      },
      {
        key: "templates",
        label: "Templates",
        type: "string",
        default: "",
        help: "Optioneel pad of tag, bijv. 'cves/' of 'tags=oast'. Leeg = standaard.",
      },
      {
        key: "rateLimit",
        label: "Rate limit (req/s)",
        type: "number",
        default: 150,
      },
    ],
  },

  nikto: {
    id: "nikto",
    name: "Nikto",
    category: "DAST",
    description:
      "Klassieke webserver-scanner die zoekt naar bekende kwetsbaarheden, verouderde software en onveilige configuratie.",
    available: false,
    options: [
      {
        key: "ssl",
        label: "Forceer SSL",
        type: "boolean",
        default: false,
      },
      {
        key: "tuning",
        label: "Tuning string",
        type: "string",
        default: "",
        help: "Nikto -Tuning, bijv. '123b' om alleen specifieke tests uit te voeren.",
      },
    ],
  },

  zap: {
    id: "zap",
    name: "OWASP ZAP",
    category: "DAST",
    description:
      "Volwaardige DAST-proxy. Geschikt voor passieve en actieve scans van webapplicaties.",
    available: false,
    options: [
      {
        key: "mode",
        label: "Scanmodus",
        type: "select",
        choices: ["baseline", "full"],
        default: "baseline",
      },
    ],
  },

  semgrep: {
    id: "semgrep",
    name: "Semgrep",
    category: "SAST",
    description:
      "Statische code-analyse met regels voor honderden talen en frameworks.",
    available: false,
    options: [
      {
        key: "config",
        label: "Ruleset",
        type: "string",
        default: "auto",
        help: "Bijv. 'auto', 'p/owasp-top-ten', of een pad naar eigen regels.",
      },
    ],
  },
};
