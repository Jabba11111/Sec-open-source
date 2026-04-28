# Sec Open Source - Security Scanner Hub

Een TypeScript-applicatie waarmee je open source security tools (SAST/DAST) zoals
**Nuclei** en **Nikto** kunt aansturen via één centrale frontend.

Deze repository bevat:

- `frontend/` - React + TypeScript + Vite UI om scans te starten en resultaten te bekijken.
- `backend/` - Node.js + Express API. Bevat **stubs** waar een junior developer de
  daadwerkelijke koppeling met Nuclei, Nikto en andere tools moet implementeren.
- `shared/` - Gedeelde TypeScript-types tussen frontend en backend.
- `docs/technisch-ontwerp.md` - Volledig technisch en functioneel ontwerp (NL).

## Snel starten

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:4000

## Voor de junior developer

Bekijk `backend/src/services/scanners/` - daar staan de stubs voor `nuclei.ts` en
`nikto.ts`. Iedere scanner exporteert een functie met een vaste signatuur, zodat
de frontend en de orchestrator niet hoeven te veranderen wanneer je de echte
binary aanroept.

Lees `docs/technisch-ontwerp.md` voor de volledige architectuur.
