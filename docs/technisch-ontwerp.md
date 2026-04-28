# Technisch & Functioneel Ontwerp — Security Scanner Hub

> Versie 0.1 · Concept · April 2026

## Inhoudsopgave

1. [Inleiding](#1-inleiding)
2. [Functioneel ontwerp](#2-functioneel-ontwerp)
3. [Architectuur](#3-architectuur)
4. [Technisch ontwerp — Frontend](#4-technisch-ontwerp--frontend)
5. [Technisch ontwerp — Backend](#5-technisch-ontwerp--backend)
6. [Tool-integratie (voor de junior developer)](#6-tool-integratie-voor-de-junior-developer)
7. [Datamodel & API-contract](#7-datamodel--api-contract)
8. [Security & autorisatie](#8-security--autorisatie)
9. [Deployment & runtime](#9-deployment--runtime)
10. [Roadmap](#10-roadmap)

---

## 1. Inleiding

### 1.1 Doel

De **Security Scanner Hub** is een webapplicatie waarmee een security-team open
source scantools (zowel SAST als DAST) vanuit één plek kan aansturen. Denk aan
tools zoals **Nuclei**, **Nikto**, **OWASP ZAP** en **Semgrep**. De applicatie
abstraheert de command-line en geeft de gebruiker:

- één formulier om een scan te starten,
- één plek waar resultaten verzameld worden,
- een uniform datamodel zodat findings van verschillende tools vergelijkbaar zijn.

### 1.2 Scope van deze versie

In scope:

- Frontend voor het kiezen van een tool, opgeven van een target, instellen van
  opties en het volgen van scans.
- Backend met een uniforme orchestrator, een tool-registry en
  **stub-implementaties** voor Nuclei, Nikto, ZAP en Semgrep.
- Live status, findings en log per scan.

Niet in scope (komt later):

- De **echte** integratie met de tool-binaries — dit is bewust open gelaten en
  wordt door een junior developer ingevuld in `backend/src/services/scanners/`.
- Authenticatie, multi-tenant gebruikersbeheer, persistente opslag, queueing
  over meerdere workers.

### 1.3 Doelgroep

| Rol | Belang |
|-----|--------|
| Security engineer | Snel ad-hoc scans starten zonder CLI-kennis. |
| Developer | Inzicht in findings op de eigen applicatie. |
| Junior developer | Implementeert de daadwerkelijke tool-koppelingen. |
| Beheerder | Beheert de gehoste hub en de onderliggende tools. |

---

## 2. Functioneel ontwerp

### 2.1 Use cases

**UC-1: Scan starten**
1. Gebruiker opent *Nieuwe scan*.
2. Kiest een tool (bv. Nuclei).
3. Vult target en optionele parameters in.
4. Klikt *Scan starten*.
5. Wordt automatisch doorgeleid naar de scan-detailpagina.

**UC-2: Voortgang volgen**
1. Op de detailpagina ziet de gebruiker live de status, findings en log-output.
2. De pagina poll't de backend tot de scan in een eindstaat is.

**UC-3: Resultaten bekijken**
1. Na afloop ziet de gebruiker een overzicht van findings, gesorteerd op severity.
2. Per finding zijn titel, locatie en (indien aanwezig) referenties zichtbaar.

**UC-4: Scan annuleren**
1. Bij een lopende scan kan de gebruiker op *Annuleren* drukken.
2. De backend stuurt SIGTERM naar het onderliggende proces (todo voor junior dev)
   en zet de status op `cancelled`.

**UC-5: Tooloverzicht raadplegen**
1. Op de pagina *Tools* ziet de gebruiker welke tools geconfigureerd zijn,
   welke ingeschakeld zijn (`available: true`) en welke opties ze ondersteunen.

### 2.2 Schermen

| Scherm | Route | Doel |
|--------|-------|------|
| Dashboard | `/` | Overzicht van alle scans, sortering op datum. |
| Nieuwe scan | `/scans/new` | Formulier om scan te starten. |
| Scan-detail | `/scans/:id` | Live status, findings, log. |
| Tools | `/tools` | Overzicht van geconfigureerde tools. |

### 2.3 Functionele eisen

| ID | Eis |
|----|-----|
| FE-01 | Het systeem toont in real-time (polling ≤ 2s) de voortgang van een lopende scan. |
| FE-02 | Het systeem ondersteunt minimaal Nuclei (DAST) en Nikto (DAST). |
| FE-03 | Findings worden uniform weergegeven met severity, titel, locatie. |
| FE-04 | De gebruiker kan een lopende scan annuleren. |
| FE-05 | De UI is volledig in het Nederlands. |
| FE-06 | Een nieuwe tool kan toegevoegd worden zónder de frontend aan te passen — alleen via de backend-registry. |

### 2.4 Niet-functionele eisen

| ID | Eis |
|----|-----|
| NFE-01 | Een scan starten geeft binnen 1 seconde een respons (de scan zelf draait asynchroon). |
| NFE-02 | De UI blijft responsief tijdens lange scans (geen blocking calls). |
| NFE-03 | Tool-output mag nooit als shell-string uitgevoerd worden — altijd als argv-array. |
| NFE-04 | De applicatie scant alleen targets waarvoor de gebruiker bevestigt expliciet toestemming te hebben. |
| NFE-05 | Logging is gestructureerd (timestamp + tool + scan-id) en bewaarbaar voor audit. |
| NFE-06 | De codebase is volledig getypeerd (TypeScript `strict: true`). |

---

## 3. Architectuur

### 3.1 Overzicht (logisch)

```
┌────────────────────────┐        ┌────────────────────────────────────┐
│        Browser         │        │           Backend (Node)            │
│ ┌────────────────────┐ │  HTTP  │ ┌────────────────────────────────┐ │
│ │  React + Vite UI   │◄┼────────┼►│  Express API                    │ │
│ │  - Dashboard       │ │  JSON  │ │  /api/tools  /api/scans         │ │
│ │  - Nieuwe scan     │ │        │ └───────────────┬────────────────┘ │
│ │  - Scan-detail     │ │        │                 │                  │
│ │  - Tools           │ │        │ ┌───────────────▼────────────────┐ │
│ └────────────────────┘ │        │ │  Orchestrator                   │ │
└────────────────────────┘        │ │  - kiest scanner-runner         │ │
                                  │ │  - stuurt log/findings naar     │ │
                                  │ │    de scanStore                 │ │
                                  │ └───────────────┬────────────────┘ │
                                  │                 │                  │
                                  │ ┌───────────────▼────────────────┐ │
                                  │ │  Scanners (per tool)            │ │
                                  │ │  nuclei.ts │ nikto.ts │ zap.ts  │ │
                                  │ │  semgrep.ts                     │ │
                                  │ └───────────────┬────────────────┘ │
                                  │                 │ child_process    │
                                  └─────────────────┼──────────────────┘
                                                    │
                                  ┌─────────────────▼──────────────────┐
                                  │  Open source binaries op de host   │
                                  │  nuclei │ nikto │ zap │ semgrep    │
                                  └────────────────────────────────────┘
```

### 3.2 Componenten

| Component | Verantwoordelijkheid |
|-----------|----------------------|
| **Frontend** (React + Vite) | UI, formvalidatie, polling, presentatie van findings. |
| **API-laag** (Express) | REST-endpoints, inputvalidatie, foutafhandeling. |
| **Orchestrator** | Kiest op basis van `tool` de juiste scanner-runner en geeft een `ScannerContext` mee. |
| **Tool-registry** | Single source of truth voor welke tools bestaan en welke opties ze hebben. |
| **Scan store** | In-memory administratie van scans (status, log, findings). Vervangbaar door persistente store. |
| **Scanner-modules** | Per tool één bestand. Bevatten de daadwerkelijke `child_process.spawn` aanroep (nu nog stub). |
| **Shared types** | TypeScript-types die door beide kanten geïmporteerd worden voor een gegarandeerd consistent contract. |

### 3.3 Belangrijke architectuurkeuzes

- **Monorepo met workspaces.** Frontend, backend en gedeelde types staan in één
  repo. Voordeel: typewijzigingen propageren direct naar beide kanten.
- **Stubs in plaats van echte tools.** De runners bevatten nu mock-data zodat
  de hele frontend end-to-end werkt voordat de junior developer met de
  binaries aan de slag gaat.
- **Polling i.p.v. WebSockets (v0.1).** Eenvoudiger te implementeren, ruim
  voldoende voor de huidige UX. Een latere versie kan upgraden naar SSE of
  WebSocket zonder de frontend-API aan te passen — alleen `client.ts` verandert.
- **In-memory store.** Bewust gekozen voor de eerste versie. De `ScanStore`
  klasse heeft een duidelijke interface zodat hij vervangen kan worden door
  bv. SQLite of Postgres.
- **Strikte scheiding tool-aanroep ↔ orchestrator.** Een runner ziet alleen
  zijn `ScannerContext` en hoeft niets van Express, store of UI te weten.
  Daardoor kan een junior developer veilig in zijn eigen bestand werken.

---

## 4. Technisch ontwerp — Frontend

### 4.1 Stack

| Onderdeel | Keuze | Rationale |
|-----------|-------|-----------|
| Framework | **React 18** | Volwassen ecosysteem, breed bekend bij developers. |
| Buildtool | **Vite** | Snelle dev-server, eenvoudige config, native TS. |
| Routing | **react-router-dom v6** | De-facto standaard. |
| Styling | **Tailwind CSS** | Zonder custom CSS snel een consistent ogend resultaat. |
| Taal | **TypeScript (strict)** | Compile-time garantie op API-contract. |
| State | **Lokale React state + polling** | Geen Redux/Zustand nodig in v0.1; data komt steeds van de server. |

### 4.2 Mappenstructuur

```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts        # Wrapper rond fetch, gebruikt @sec/shared types
│   ├── components/
│   │   ├── Card.tsx
│   │   ├── SeverityBadge.tsx
│   │   └── StatusBadge.tsx
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── NewScanPage.tsx
│   │   ├── ScanDetailPage.tsx
│   │   └── ToolsPage.tsx
│   ├── App.tsx              # Layout + routes
│   ├── main.tsx             # Mount point
│   └── index.css            # Tailwind directives
├── index.html
├── vite.config.ts           # Proxy naar backend op :4000
├── tailwind.config.js
└── tsconfig.json
```

### 4.3 Datastromen

1. **Tools laden** — `NewScanPage` en `ToolsPage` doen bij mount een `GET /api/tools`.
   De form-velden worden dynamisch gerenderd op basis van `ToolDefinition.options`.
2. **Scan starten** — `NewScanPage` doet `POST /api/scans`. Backend antwoordt met
   het verse `Scan`-object (status `queued`). Frontend navigeert direct naar
   `/scans/:id`.
3. **Live updates** — `ScanDetailPage` en `DashboardPage` zetten een
   `setInterval` die `GET /api/scans/:id` (of `/api/scans`) ophaalt. Polling
   stopt zodra de scan in een eindstaat (`completed` / `failed` / `cancelled`)
   staat.
4. **Annuleren** — `DELETE /api/scans/:id` zet status op `cancelled`.

### 4.4 UX-richtlijnen

- Severity-kleuren consistent gebruiken: `info` neutraal, `low` blauw, `medium`
  amber, `high` oranje, `critical` rood.
- Statusbadge animeert (`animate-pulse`) wanneer de scan loopt — direct
  visuele feedback dat er iets gebeurt.
- Targetveld toont altijd een waarschuwing dat de gebruiker toestemming moet
  hebben voor de scan.
- Het tool-keuzepaneel toont expliciet wanneer een tool nog in *stub-modus*
  staat, zodat gebruikers begrijpen waarom de findings mock-data zijn.

### 4.5 Foutafhandeling

- Iedere fetch zit in een `try/catch`; de error-message wordt in een rode
  banner bovenaan de pagina getoond.
- Validatie op de target gebeurt zowel client-side (`required`, `pattern`)
  als server-side (zie §5.4).

---

## 5. Technisch ontwerp — Backend

### 5.1 Stack

| Onderdeel | Keuze | Rationale |
|-----------|-------|-----------|
| Runtime | **Node.js 20+** | LTS, native fetch en stabiele ESM/CJS-interop. |
| Framework | **Express 4** | Minimaal en goed bekend, ruim voldoende voor de schaal. |
| Taal | **TypeScript (strict)** | Zelfde codebase-discipline als frontend. |
| Process management | **child_process.spawn** | Veiliger dan `exec`, ondersteunt streaming I/O. |
| Dev runtime | **tsx** | Direct TS uitvoeren met watch-mode. |

### 5.2 Mappenstructuur

```
backend/
├── src/
│   ├── routes/
│   │   ├── scans.ts         # POST/GET/DELETE /api/scans
│   │   └── tools.ts         # GET /api/tools
│   ├── services/
│   │   ├── orchestrator.ts  # Routeert tool-id → scanner-runner
│   │   ├── scanStore.ts     # In-memory store voor scans
│   │   ├── toolRegistry.ts  # Definitie van alle tools + opties
│   │   └── scanners/
│   │       ├── _mock.ts     # Helper voor stub-runners
│   │       ├── nuclei.ts    # ⚠️ Junior dev: vervang stub door echte Nuclei-call
│   │       ├── nikto.ts     # ⚠️ Junior dev: vervang stub door echte Nikto-call
│   │       ├── zap.ts
│   │       └── semgrep.ts
│   └── index.ts             # Express bootstrap
└── tsconfig.json
```

### 5.3 Lifecycle van een scan

```
POST /api/scans
   │
   ▼
[scans router]
  • valideer body (tool bestaat, target is geldig)
  • scanStore.create(...)        → status: queued
  • startScan(id) (async, niet awaited)
  • respond 201 met scan-object
   │
   ▼
[orchestrator.startScan]
  • zet status op "running"
  • bouwt ScannerContext (log, addFindings callbacks)
  • roept de juiste runner aan
  • bij succes  → status "completed"
  • bij Error   → status "failed", error-message in scan
  • runner kan tussentijds findings toevoegen
   │
   ▼
[scanner runner — stub of echt]
  • genereert/streamt findings
  • logt voortgangsregels
```

### 5.4 Validatie

In `routes/scans.ts`:

- `tool` moet bestaan in de registry.
- `target` mag niet leeg zijn, niet langer dan 2048 tekens en geen
  shell-metacharacters bevatten (`; & | ` $ < > \n \r`). Deze laatste check is
  een *defense in depth* — runners horen sowieso `spawn` met argv-array te
  gebruiken, maar zo voorkomen we dat een verkeerd geconfigureerde runner
  alsnog een command injection veroorzaakt.

### 5.5 Configuratie via environment variables

| Var | Default | Doel |
|-----|---------|------|
| `PORT` | `4000` | Poort waarop de API luistert. |
| `NUCLEI_BIN` | `nuclei` | Pad naar de Nuclei-binary (in te vullen door junior dev). |
| `NIKTO_BIN` | `nikto` | Pad naar de Nikto-binary. |
| `ZAP_BIN` | `zap.sh` | Pad naar ZAP. |
| `SEMGREP_BIN` | `semgrep` | Pad naar Semgrep. |

---

## 6. Tool-integratie (voor de junior developer)

Dit hoofdstuk legt stap voor stap uit hoe je de stub voor een tool vervangt
door een echte aanroep. Voorbeeld: **Nuclei**.

### 6.1 Doel

Vervang de inhoud van `backend/src/services/scanners/nuclei.ts` door een
implementatie die:

1. de Nuclei-binary start tegen het opgegeven target,
2. JSON-output streamt en naar `Finding`-objecten mapt,
3. log-regels doorgeeft,
4. nette foutafhandeling en cancellation ondersteunt.

### 6.2 Stappenplan

**Stap 1 — Bouw het argumenten-array.**

```ts
import { spawn } from "node:child_process";
import { v4 as uuid } from "uuid";
import type { Finding, Severity } from "@sec/shared";
import type { ScannerContext } from "../orchestrator";

export async function runNuclei(ctx: ScannerContext): Promise<void> {
  const args = [
    "-u", ctx.target,
    "-jsonl",                                       // JSON Lines output
    "-severity", String(ctx.options.severity ?? "low"),
    "-rate-limit", String(ctx.options.rateLimit ?? 150),
    "-silent",
  ];
  if (ctx.options.templates) {
    args.push("-t", String(ctx.options.templates));
  }
  // ...
}
```

**Stap 2 — Spawn de binary (NOOIT met `exec`).**

```ts
const bin = process.env.NUCLEI_BIN ?? "nuclei";
const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
```

> Reden: door `args` als array door te geven, wordt geen shell betrokken en
> kan een kwaadaardige target geen command injection veroorzaken.

**Stap 3 — Lees stdout regel voor regel en map naar `Finding`.**

```ts
import { createInterface } from "node:readline";

const rl = createInterface({ input: proc.stdout });
rl.on("line", (line) => {
  try {
    const json = JSON.parse(line);
    const finding: Finding = {
      id: uuid(),
      severity: (json.info?.severity ?? "info") as Severity,
      title: json.info?.name ?? "Onbekende finding",
      location: json["matched-at"],
      reference: json.info?.reference,
      raw: json,
    };
    ctx.addFindings([finding]);
    ctx.log(`Finding: [${finding.severity}] ${finding.title}`);
  } catch {
    ctx.log(line);
  }
});
```

**Stap 4 — Stuur stderr als log-regels door.**

```ts
proc.stderr.on("data", (chunk: Buffer) => {
  ctx.log(chunk.toString().trim());
});
```

**Stap 5 — Wacht op afronding.**

```ts
await new Promise<void>((resolve, reject) => {
  proc.on("error", reject);
  proc.on("close", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`nuclei exited with code ${code}`));
  });
});
```

**Stap 6 — Implementeer cancellation.**

Voeg in `orchestrator.ts` (later, geen prioriteit voor v0.1) een mechanisme toe
om het `proc`-object te bewaren per `scanId`. Bij `DELETE /api/scans/:id`
kan dan `proc.kill("SIGTERM")` aangeroepen worden.

### 6.3 Algemene checklist voor elke tool-koppeling

- [ ] Binary-pad configureerbaar via env var.
- [ ] `spawn` met argv-array, geen `exec`.
- [ ] Output in een machineleesbaar formaat (JSON/JSONL/XML).
- [ ] Mapping naar het `Finding`-type met juiste severity.
- [ ] Stderr loggen, niet negeren.
- [ ] `available: true` zetten in `toolRegistry.ts`.
- [ ] Niet-nul exit-code → `throw` zodat de orchestrator status `failed` zet.
- [ ] Tijdelijke bestanden opruimen (`/tmp/...`).
- [ ] Eenheid in severities (Nikto en ZAP gebruiken andere labels — mappen!).

### 6.4 Een nieuwe tool toevoegen

1. Voeg een entry toe aan `ToolId` in `shared/src/index.ts`.
2. Voeg een `ToolDefinition` toe aan `TOOL_REGISTRY` in `toolRegistry.ts`.
3. Maak `backend/src/services/scanners/<tool>.ts` met een `run<Tool>` functie.
4. Registreer die functie in `SCANNERS` in `orchestrator.ts`.
5. Klaar — de frontend pakt de nieuwe tool automatisch op via `/api/tools`.

---

## 7. Datamodel & API-contract

### 7.1 Types (uit `@sec/shared`)

```ts
type ToolId = "nuclei" | "nikto" | "zap" | "semgrep";
type ScanCategory = "SAST" | "DAST";
type ScanStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
type Severity = "info" | "low" | "medium" | "high" | "critical";

interface Scan {
  id: string;
  tool: ToolId;
  target: string;
  status: ScanStatus;
  createdAt: string;       // ISO timestamp
  startedAt?: string;
  finishedAt?: string;
  options?: Record<string, string | number | boolean>;
  findings: Finding[];
  log: string[];
  error?: string;
}

interface Finding {
  id: string;
  severity: Severity;
  title: string;
  description?: string;
  location?: string;
  reference?: string[];
  raw?: unknown;           // ruwe tool-output, voor debugging
}
```

### 7.2 Endpoints

| Methode | Path | Body | Response | Status |
|--------|------|------|----------|--------|
| GET | `/api/health` | — | `{ status, time }` | 200 |
| GET | `/api/tools` | — | `ToolDefinition[]` | 200 |
| GET | `/api/tools/:id` | — | `ToolDefinition` | 200/404 |
| GET | `/api/scans` | — | `Scan[]` (nieuwste eerst) | 200 |
| POST | `/api/scans` | `ScanRequest` | `Scan` | 201/400 |
| GET | `/api/scans/:id` | — | `Scan` | 200/404 |
| DELETE | `/api/scans/:id` | — | — | 204/404 |

### 7.3 Voorbeeld-request

```http
POST /api/scans HTTP/1.1
Content-Type: application/json

{
  "tool": "nuclei",
  "target": "https://staging.voorbeeld.nl",
  "options": {
    "severity": "medium",
    "rateLimit": 100
  }
}
```

### 7.4 Voorbeeld-respons

```json
{
  "id": "8a2c…",
  "tool": "nuclei",
  "target": "https://staging.voorbeeld.nl",
  "status": "queued",
  "createdAt": "2026-04-28T10:00:00.000Z",
  "options": { "severity": "medium", "rateLimit": 100 },
  "findings": [],
  "log": []
}
```

---

## 8. Security & autorisatie

### 8.1 Bedreigingsmodel (kort)

| Bedreiging | Impact | Mitigatie |
|-----------|--------|-----------|
| Command injection via target | RCE op de hub-server | Altijd `spawn` met argv-array; tekenset-validatie op target. |
| Misbruik als open scanner | Hub gebruikt om derden te scannen | In v0.1: **niet publiek deployen**. In latere versies: authenticatie + allowlist van targets. |
| Resource-uitputting (DoS) | Server crasht door tientallen parallelle scans | Toekomstige queue met max-concurrency (zie roadmap). |
| Leakage van findings | Gevoelige info zichtbaar voor verkeerde gebruikers | Toekomstig: per-gebruiker scoping; voor nu single-user. |
| Verouderde tool-binaries | Ontbrekende detecties / kwetsbaarheden | Tools worden in container draait, container wordt regelmatig herbouwd. |

### 8.2 Defensieve afspraken in code

- **Geen shell.** Elke runner gebruikt `spawn(bin, argsArray)`. `exec`,
  `execSync` en template-literals naar shell-commands zijn verboden.
- **Inputvalidatie op meerdere lagen.** De API valideert de body, en de
  runners valideren nogmaals het target voor ze het doorgeven aan de binary.
- **Strict TypeScript.** Voorkomt klassen van bugs (undefined-paden, verkeerde
  cast) die in een security-tool snel kostbaar worden.
- **Geen geheimen in repo.** Pad-configuratie en eventuele API-keys gaan via
  env vars.

### 8.3 Toekomst: authenticatie

Ontwerp houdt rekening met later toevoegen van auth:

- Express-middleware kan eenvoudig een JWT- of session-check vooraan in de
  router-chain plaatsen.
- `Scan` krijgt dan een `ownerId`-veld (al ruim voorzien in het schema).
- De UI gebruikt nu één globale state — een `AuthContext` is later
  toevoegbaar zonder bestaande pagina's te breken.

---

## 9. Deployment & runtime

### 9.1 Lokale ontwikkeling

```bash
npm install
npm run dev
```

Dat start tegelijk:

- backend op `http://localhost:4000`
- frontend op `http://localhost:5173` (proxy `/api` → 4000)

### 9.2 Vereisten op de host (productie)

| Component | Versie |
|-----------|--------|
| Node.js | 20+ |
| Nuclei | laatste stable |
| Nikto | 2.5+ |
| OWASP ZAP | 2.14+ (optioneel als Docker-image) |
| Semgrep | 1.x |

### 9.3 Aanbevolen deployment

```
┌──────────────────────────────────────────────┐
│  Docker host                                  │
│  ┌───────────────┐   ┌────────────────────┐   │
│  │ frontend (nginx│   │ backend (Node)     │   │
│  │ statische build)│  │ + tool-binaries    │   │
│  └───────┬───────┘   │ in dezelfde image  │   │
│          │           └────────┬───────────┘   │
│          └────reverse-proxy───┘                │
└──────────────────────────────────────────────┘
```

- Bouw één image waarin de tools (`nuclei`, `nikto`, ...) preinstalled zijn.
- Mount een persistente volume voor scan-historie zodra de in-memory store
  vervangen wordt.
- Plaats de hub achter een reverse proxy met TLS en (in productie) auth.

### 9.4 Observability

- **Logs:** structured JSON via `console.log` is voldoende voor v0.1; route
  ze met `docker logs` of `journald` naar een centrale collector.
- **Metrics (toekomst):** aantal lopende scans, gem. duur per tool, foutpercentage.
- **Audit trail:** elke scan bevat al `createdAt`, `startedAt`, `finishedAt`,
  `target`, `tool`, `options`, `error`. Dat is genoeg voor een eenvoudige audit.

---

## 10. Roadmap

| Versie | Inhoud |
|--------|--------|
| **v0.1 (huidig)** | Frontend + backend met stubs. End-to-end demo werkt met mock-findings. |
| **v0.2** | Junior dev levert echte runners voor Nuclei en Nikto. `available: true`. |
| **v0.3** | Persistente opslag (SQLite). Cancellation via SIGTERM volledig werkend. |
| **v0.4** | Authenticatie (OIDC of basic). Per-gebruiker scan-historie. |
| **v0.5** | Job-queue met max-concurrency en retry. SSE/WebSocket voor live updates i.p.v. polling. |
| **v0.6** | Rapport-export (PDF/HTML), planmatige scans (cron-achtige scheduler). |
| **v1.0** | OWASP ZAP en Semgrep volledig geïntegreerd, dashboard met trendlijnen, RBAC. |

---

### Bijlage A — Volledige bestandsmap

```
sec-open-source/
├── package.json                 # workspaces root
├── README.md
├── docs/
│   └── technisch-ontwerp.md     # dit document
├── shared/
│   └── src/index.ts             # gedeelde types
├── backend/
│   └── src/
│       ├── index.ts
│       ├── routes/{tools,scans}.ts
│       └── services/
│           ├── orchestrator.ts
│           ├── scanStore.ts
│           ├── toolRegistry.ts
│           └── scanners/{nuclei,nikto,zap,semgrep,_mock}.ts
└── frontend/
    └── src/
        ├── api/client.ts
        ├── components/{Card,SeverityBadge,StatusBadge}.tsx
        ├── pages/{Dashboard,NewScan,ScanDetail,Tools}Page.tsx
        ├── App.tsx
        └── main.tsx
```

### Bijlage B — Verklarende woordenlijst

| Term | Betekenis |
|------|-----------|
| **SAST** | Static Application Security Testing — analyse van broncode. |
| **DAST** | Dynamic Application Security Testing — analyse van een draaiende applicatie. |
| **Finding** | Een individueel resultaat van een scan, met severity en titel. |
| **Severity** | Ernst van een finding: info, low, medium, high, critical. |
| **Runner** | De TypeScript-functie die één specifieke tool aanstuurt. |
| **Orchestrator** | Component die per scan de juiste runner kiest en aanroept. |
| **Stub** | Tijdelijke implementatie die mock-data produceert tot de echte werkt. |
