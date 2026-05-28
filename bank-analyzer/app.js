// Knab CSV analyzer - parses Knab transaction exports, labels each booking,
// and aggregates per month / category. Runs entirely in the browser.

// ---------- Categorisatie regels ----------
// Elke regel: { category, match: [strings of regexes], kind?, scope? }
// Standaard wordt gematcht tegen tegenpartij + omschrijving + adres + referentie + betaalwijze.
// Met scope: "counterparty" wordt alleen de Tegenrekeninghouder-kolom gebruikt.
// Eerste match wint, daarom specifiekere regels eerst.
// kind:"prive" of kind:"intern" = telt NIET mee in inkomsten/uitgaven en gaat naar
// een eigen tab/sheet.
const RULES = [
  // --- Uitgesloten van totalen - matchen alleen op Tegenrekeninghouder ---
  { category: "D Bouma",            kind: "prive",  scope: "counterparty", match: [/\bbouma\b/] },
  { category: "Sentis Psychologen", kind: "intern", scope: "counterparty", match: [/sentis\s*psychologen/] },

  // --- Reguliere categorieen ---
  { category: "Salaris",       match: [/salaris/, /loon/, /payroll/] },
  { category: "Belasting",     match: [/belastingdienst/, /\bbtw\b/, /aangifte/] },
  { category: "Toeslagen",     match: [/toeslag/] },
  { category: "Huur/Hypotheek", match: [/\bhuur\b/, /hypotheek/, /\bvve\b/, /woningstichting/, /vesteda/] },
  { category: "Energie",       match: [/eneco/, /vattenfall/, /essent/, /greenchoice/, /budget energie/, /oxxio/, /engie/] },
  { category: "Water",         match: [/vitens/, /evides/, /waternet/, /pwn/, /brabant water/] },
  { category: "Internet/Telefoon", match: [/ziggo/, /kpn/, /t-mobile/, /odido/, /vodafone/, /tele2/, /youfone/, /simyo/, /lebara/] },
  { category: "Verzekering",   match: [/verzekering/, /aegon/, /\bing verzeker/, /nationale-nederlanden/, /centraal beheer/, /univé/, /unive/, /interpolis/, /fbto/, /allianz/, /ohra/, /reaal/] },
  { category: "Zorg",          match: [/zilveren kruis/, /vgz/, /cz\b/, /menzis/, /\bdsw\b/, /ditzo/, /apotheek/, /\bhuisarts/, /tandarts/, /ziekenhuis/, /fysio/] },
  { category: "Boodschappen",  match: [/albert heijn/, /\bah\b/, /jumbo/, /lidl/, /aldi/, /plus\b/, /coop\b/, /dirk\b/, /spar\b/, /picnic/, /ekoplaza/, /hoogvliet/, /vomar/, /deen/] },
  { category: "Restaurant/Horeca", match: [/restaurant/, /eetcafe/, /cafe\b/, /bakker/, /lunchroom/, /thuisbezorgd/, /uber\s*eats/, /deliveroo/, /dominos/, /new york pizza/, /mcdonald/, /kfc/, /burger king/, /starbucks/] },
  { category: "Transport (OV)", match: [/\bns\b/, /ns-/, /ns groep/, /\bgvb\b/, /\bret\b/, /\bhtm\b/, /connexxion/, /arriva/, /qbuzz/, /ov-?chip/, /translink/] },
  { category: "Brandstof/Auto", match: [/shell/, /\bbp\b/, /\btotal\b/, /esso/, /tinq/, /tango/, /tankstation/, /parkeer/, /\bq-park\b/, /apcoa/, /anwb/, /\brdw\b/, /\bcjib\b/, /garage/] },
  { category: "Streaming/Abo", match: [/netflix/, /spotify/, /disney/, /\bhbo\b/, /videoland/, /youtube/, /apple\.com\/bill/, /\bicloud\b/, /microsoft/, /adobe/, /dropbox/, /google\s*(one|cloud|storage)/, /patreon/, /steam/] },
  { category: "Sport/Gym",     match: [/basic[-\s]?fit/, /sportschool/, /fitness/, /gym\b/, /strava/] },
  { category: "Webshops",      match: [/bol\.com/, /amazon/, /coolblue/, /mediamarkt/, /wehkamp/, /zalando/, /ikea/, /action\b/, /hema/, /kruidvat/, /etos/, /\bdouglas\b/] },
  { category: "Pinopname",     match: [/geldopname/, /\bgea\b/, /\batm\b/, /opname\s+geld/] },
  { category: "Eigen rekening", match: [/eigen rekening/, /spaar/, /naar spaar/, /vanaf spaar/] },
  { category: "Tikkie/Overboeking", match: [/tikkie/, /\bing\s+\b/, /betaalverzoek/] },
  { category: "Bankkosten",    match: [/knab/, /bankkosten/, /\bkosten\b.*pakket/, /servicekosten/] },
];

const DEFAULT_INCOME_CATEGORY = "Inkomsten overig";
const DEFAULT_EXPENSE_CATEGORY = "Overig";

// ---------- CSV parsing ----------
// Knab CSV: semicolon-separated, eerste rij is een meta-rij, tweede rij headers.
// Velden zijn vaak gequote met "...". Bedragen gebruiken een komma als decimaal.
function detectDelimiter(line) {
  const counts = { ";": 0, ",": 0, "\t": 0 };
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && c in counts) counts[c]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseCsv(text) {
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  // Stap 1: alle records uit de tekst halen (quoted newlines respecteren).
  // We proberen voor de eerste paar niet-lege regels welke delimiter wint.
  const firstLines = text.split(/\r?\n/, 6).filter((l) => l.length > 0);
  if (firstLines.length === 0) return { headers: [], rows: [] };
  const candidates = [";", ",", "\t", "|"];
  let delim = ";";
  let bestScore = -1;
  for (const d of candidates) {
    // score = aantal velden in eerste header-achtige regel
    for (const line of firstLines) {
      const fields = splitOneLine(line, d);
      if (fields.length >= 5 && fields.some((f) => /datum/i.test(f))) {
        if (fields.length > bestScore) { bestScore = fields.length; delim = d; }
        break;
      }
    }
  }
  if (bestScore < 0) {
    // fallback: meest voorkomende delimiter in regel 1
    delim = detectDelimiter(firstLines[0]);
  }

  const records = parseRecords(text, delim);
  return recordsToRows(records);
}

// Zet een 2D-array (records) om in {headers, rows} - hergebruikt door CSV en XLSX.
function recordsToRows(records) {
  if (records.length === 0) return { headers: [], rows: [] };
  let headerIdx = 0;
  for (let i = 0; i < Math.min(records.length, 6); i++) {
    if (records[i].some((f) => /datum/i.test(String(f)))) { headerIdx = i; break; }
  }
  const headers = records[headerIdx].map((h) => String(h ?? "").trim());
  const rows = [];
  for (let i = headerIdx + 1; i < records.length; i++) {
    const fields = records[i] || [];
    const allEmpty = fields.every((f) => String(f ?? "").trim() === "");
    if (allEmpty) continue;
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      const v = fields[c];
      // Date-objecten (uit XLSX) doorgeven als ISO-string voor consistente downstream parsing
      if (v instanceof Date && !isNaN(v)) {
        const y = v.getFullYear();
        const mo = String(v.getMonth() + 1).padStart(2, "0");
        const d = String(v.getDate()).padStart(2, "0");
        row[headers[c]] = `${y}-${mo}-${d}`;
      } else {
        row[headers[c]] = String(v ?? "").trim();
      }
    }
    rows.push(row);
  }
  return { headers, rows };
}

// Lees een XLSX/XLS-bestand met SheetJS en geef hetzelfde {headers, rows}-formaat terug.
async function parseXlsx(file) {
  if (typeof XLSX === "undefined") {
    throw new Error("XLSX bibliotheek niet geladen (controleer internetverbinding).");
  }
  const buf = await readAsBuffer(file);
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true, // hou Date-objecten en getallen intact; we converteren in recordsToRows
    blankrows: false,
  });
  return recordsToRows(aoa);
}

function readAsBuffer(file) {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("Kon bestand niet lezen"));
    r.readAsArrayBuffer(file);
  });
}

// Splitst een enkele regel (geen multi-line ondersteuning, alleen voor delimiter-detectie)
function splitOneLine(line, delim) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// Volledige CSV-parser die quoted newlines correct afhandelt.
function parseRecords(text, delim) {
  const records = [];
  let cur = "";
  let row = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQ = true;
      } else if (c === delim) {
        row.push(cur); cur = "";
      } else if (c === "\n" || c === "\r") {
        // \r\n: skip de volgende \n
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        records.push(row);
        row = [];
      } else {
        cur += c;
      }
    }
  }
  // laatste veld/rij
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    records.push(row);
  }
  return records;
}

// ---------- Veld-mapping ----------
// Knab gebruikt verschillende kolomnamen door de jaren heen. Map flexibel.
function pick(row, candidates) {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const re = new RegExp(`^${cand}$`, "i");
    const hit = keys.find((k) => re.test(k));
    if (hit && row[hit] != null && row[hit] !== "") return row[hit];
  }
  // fuzzy: bevat substring
  for (const cand of candidates) {
    const hit = keys.find((k) => k.toLowerCase().includes(cand.toLowerCase()));
    if (hit && row[hit] != null && row[hit] !== "") return row[hit];
  }
  return "";
}

function makeDate(y, mo, d) {
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  return isNaN(dt) ? null : dt;
}

function parseDate(s) {
  if (s == null) return null;
  if (s instanceof Date) return isNaN(s) ? null : s;
  const str = String(s).trim();
  if (!str) return null;
  // ISO: yyyy-m-d  /  yyyy/m/d
  let m = str.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
  if (m) return makeDate(+m[1], +m[2], +m[3]);
  // Nederlands: d-m-yyyy  /  d/m/yyyy  (1- of 2-cijferige dag/maand)
  m = str.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})/);
  if (m) return makeDate(+m[3], +m[2], +m[1]);
  // 8-cijferig yyyymmdd
  m = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return makeDate(+m[1], +m[2], +m[3]);
  // Geen vage Date()-fallback - die interpreteert "17-4-2026" verschillend per browser.
  return null;
}

function parseAmount(s) {
  if (s == null) return NaN;
  let str = String(s).trim();
  if (!str) return NaN;
  // verwijder valuta tekens en spaties
  str = str.replace(/[€\s]/g, "");
  // trailing minus (boekhoud-formaat: "12,34-")
  let trailingNeg = false;
  if (/-$/.test(str)) { trailingNeg = true; str = str.slice(0, -1); }
  // leading plus
  if (str.startsWith("+")) str = str.slice(1);
  // Als er zowel . als , in zit: laatste teken is decimaal
  if (str.includes(",") && str.includes(".")) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }
  const n = parseFloat(str);
  if (isNaN(n)) return NaN;
  return trailingNeg ? -n : n;
}

function normalizeRow(row) {
  const dateStr =
    pick(row, ["Transactiedatum", "Boekdatum", "Datum"]) || "";
  const date = parseDate(dateStr);
  // counterpartyName = uitsluitend de Tegenrekeninghouder-kolom (voor strikte regels).
  // counterparty = wat we tonen; valt terug op Adres voor pinbetalingen zonder naam.
  const counterpartyName =
    pick(row, ["Tegenrekeninghouder", "Naam tegenrekening", "Tegenpartij", "Naam"]) || "";
  const address = pick(row, ["Adres"]) || "";
  const counterparty = counterpartyName || address || "";
  const description =
    pick(row, ["Omschrijving", "Mededelingen", "Mededeling", "Description"]) || "";
  const reference = pick(row, ["Referentie", "Transactiereferentie"]) || "";
  const method = pick(row, ["Betaalwijze", "Type betaling", "Type"]) || "";
  let amount = parseAmount(pick(row, ["Bedrag", "Transactiebedrag", "Amount"]));
  // CreditDebet: C = Credit (inkomst, +), D = Debit (uitgave, -). Strikt toepassen.
  const cdRaw = (pick(row, ["CreditDebet", "Credit/Debet", "Af Bij", "Af/Bij", "Debet/Credit"]) || "").trim().toUpperCase();
  let cdKnown = true;
  if (!isNaN(amount)) {
    const abs = Math.abs(amount);
    if (cdRaw === "C" || cdRaw === "CREDIT" || cdRaw === "BIJ") {
      amount = abs;
    } else if (cdRaw === "D" || cdRaw === "DEBET" || cdRaw === "DEBIT" || cdRaw === "AF") {
      amount = -abs;
    } else {
      cdKnown = false;
      if (cdRaw !== "") console.warn("Onbekende CreditDebet waarde:", cdRaw, row);
    }
  }
  return {
    date,
    counterparty,
    counterpartyName,
    description,
    address,
    reference,
    method,
    amount,
    creditDebet: cdRaw,
    cdKnown,
    raw: row,
  };
}

// ---------- Categorisatie ----------
function categorize(tx) {
  const counterpartyOnly = (tx.counterpartyName || "").toLowerCase();
  const hay = `${tx.counterparty} ${tx.description} ${tx.address} ${tx.reference} ${tx.method}`.toLowerCase();
  for (const rule of RULES) {
    const target = rule.scope === "counterparty" ? counterpartyOnly : hay;
    if (!target) continue;
    for (const m of rule.match) {
      if (m instanceof RegExp ? m.test(target) : target.includes(String(m).toLowerCase())) {
        return { category: rule.category, kind: rule.kind || null };
      }
    }
  }
  return {
    category: tx.amount >= 0 ? DEFAULT_INCOME_CATEGORY : DEFAULT_EXPENSE_CATEGORY,
    kind: null,
  };
}

// ---------- Aggregaties ----------
function ymKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function newGroup() {
  return { monthly: new Map(), byCategory: new Map(), totalIn: 0, totalOut: 0, count: 0 };
}

function addToGroup(g, tx) {
  const key = ymKey(tx.date);
  if (!g.monthly.has(key)) g.monthly.set(key, { month: key, income: 0, expense: 0, count: 0 });
  const mo = g.monthly.get(key);
  mo.count++;
  if (tx.amount >= 0) { mo.income += tx.amount; g.totalIn += tx.amount; }
  else { mo.expense += -tx.amount; g.totalOut += -tx.amount; }
  const cat = tx.category;
  if (!g.byCategory.has(cat)) g.byCategory.set(cat, { category: cat, income: 0, expense: 0, count: 0 });
  const ca = g.byCategory.get(cat);
  ca.count++;
  if (tx.amount >= 0) ca.income += tx.amount;
  else ca.expense += -tx.amount;
  g.count++;
}

function finalizeGroup(g) {
  return {
    monthly: [...g.monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    byCategory: [...g.byCategory.values()].sort((a, b) => (b.expense - b.income) - (a.expense - a.income)),
    totalIn: g.totalIn,
    totalOut: g.totalOut,
    count: g.count,
  };
}

function aggregate(transactions) {
  const main = newGroup();
  const prive = newGroup();
  const intern = newGroup();
  for (const tx of transactions) {
    if (!tx.date || isNaN(tx.amount)) continue;
    const grp = tx.kind === "prive" ? prive : tx.kind === "intern" ? intern : main;
    addToGroup(grp, tx);
  }
  return {
    main: finalizeGroup(main),
    prive: finalizeGroup(prive),
    intern: finalizeGroup(intern),
    count: transactions.length,
  };
}

// ---------- Rendering ----------
const fmtEur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const fmtDate = new Intl.DateTimeFormat("nl-NL", { year: "numeric", month: "2-digit", day: "2-digit" });

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.appendChild(c);
  return e;
}

function renderTilesInto(rootId, group, labelPrefix) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = "";
  const net = group.totalIn - group.totalOut;
  const tiles = [
    { label: `${labelPrefix}Inkomsten`, value: fmtEur.format(group.totalIn),  cls: "pos" },
    { label: `${labelPrefix}Uitgaven`,  value: fmtEur.format(group.totalOut), cls: "neg" },
    { label: `${labelPrefix}Netto`,     value: fmtEur.format(net), cls: net >= 0 ? "pos" : "neg" },
    { label: "Boekingen",               value: String(group.count) },
  ];
  for (const t of tiles) {
    const tile = el("div", { class: "tile" });
    tile.appendChild(el("div", { class: "label", text: t.label }));
    tile.appendChild(el("div", { class: `value ${t.cls || ""}`, text: t.value }));
    root.appendChild(tile);
  }
}

function renderMonthlyInto(selector, monthly) {
  const tbody = document.querySelector(selector);
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const m of monthly) {
    const tr = el("tr");
    const net = m.income - m.expense;
    tr.appendChild(el("td", { text: m.month }));
    tr.appendChild(el("td", { class: "num pos", text: fmtEur.format(m.income) }));
    tr.appendChild(el("td", { class: "num neg", text: fmtEur.format(m.expense) }));
    tr.appendChild(el("td", { class: `num ${net >= 0 ? "pos" : "neg"}`, text: fmtEur.format(net) }));
    tr.appendChild(el("td", { class: "num", text: String(m.count) }));
    tbody.appendChild(tr);
  }
}

function renderCategoriesInto(selector, byCategory) {
  const tbody = document.querySelector(selector);
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const c of byCategory) {
    const tr = el("tr");
    const net = c.income - c.expense;
    tr.appendChild(el("td", { text: c.category }));
    tr.appendChild(el("td", { class: "num pos", text: fmtEur.format(c.income) }));
    tr.appendChild(el("td", { class: "num neg", text: fmtEur.format(c.expense) }));
    tr.appendChild(el("td", { class: `num ${net >= 0 ? "pos" : "neg"}`, text: fmtEur.format(net) }));
    tr.appendChild(el("td", { class: "num", text: String(c.count) }));
    tbody.appendChild(tr);
  }
}

function renderTxIntoTable(selector, transactions) {
  const tbody = document.querySelector(selector);
  if (!tbody) return;
  tbody.innerHTML = "";
  const sorted = [...transactions].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  for (const tx of sorted) {
    const tr = el("tr");
    tr.appendChild(el("td", { text: tx.date ? fmtDate.format(tx.date) : "?" }));
    const cdCell = el("td", { text: tx.creditDebet || "?" });
    if (tx.creditDebet === "C") cdCell.className = "pos";
    else if (tx.creditDebet === "D") cdCell.className = "neg";
    tr.appendChild(cdCell);
    tr.appendChild(el("td", { text: tx.counterparty || "-" }));
    tr.appendChild(el("td", { text: tx.description || "" }));
    tr.appendChild(el("td", { text: tx.category }));
    const cls = tx.amount >= 0 ? "pos" : "neg";
    tr.appendChild(el("td", { class: `num ${cls}`, text: fmtEur.format(tx.amount) }));
    tbody.appendChild(tr);
  }
}

function renderOverview(agg) {
  renderTilesInto("totals", agg.main, "");
  renderMonthlyInto("#monthlyTable tbody", agg.main.monthly);
  renderCategoriesInto("#categoryTable tbody", agg.main.byCategory);
}

function renderPrive(agg, transactions) {
  document.getElementById("priveCount").textContent = `${agg.prive.count} boekingen`;
  renderTilesInto("priveTotals", agg.prive, "Privé ");
  renderMonthlyInto("#priveMonthlyTable tbody", agg.prive.monthly);
  renderTxIntoTable("#priveTxTable tbody", transactions.filter((t) => t.kind === "prive"));
}

function renderIntern(agg, transactions) {
  document.getElementById("internCount").textContent = `${agg.intern.count} boekingen`;
  renderTilesInto("internTotals", agg.intern, "Intern ");
  renderMonthlyInto("#internMonthlyTable tbody", agg.intern.monthly);
  renderTxIntoTable("#internTxTable tbody", transactions.filter((t) => t.kind === "intern"));
}

function renderTransactions(transactions) {
  const tbody = document.querySelector("#txTable tbody");
  tbody.innerHTML = "";
  const sorted = [...transactions].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  for (const tx of sorted) {
    const tr = el("tr", { class: tx.kind ? "excluded" : "" });
    tr.appendChild(el("td", { text: tx.date ? fmtDate.format(tx.date) : "?" }));
    const cdCell = el("td", { text: tx.creditDebet || "?" });
    if (tx.creditDebet === "C") cdCell.className = "pos";
    else if (tx.creditDebet === "D") cdCell.className = "neg";
    tr.appendChild(cdCell);
    tr.appendChild(el("td", { text: tx.counterparty || "-" }));
    tr.appendChild(el("td", { text: tx.description || "" }));
    const catCell = el("td", { text: tx.category });
    if (tx.kind) {
      const badge = el("span", { class: "badge", text: tx.kind });
      catCell.appendChild(document.createTextNode(" "));
      catCell.appendChild(badge);
    }
    tr.appendChild(catCell);
    const cls = tx.amount >= 0 ? "pos" : "neg";
    tr.appendChild(el("td", { class: `num ${cls}`, text: fmtEur.format(tx.amount) }));
    tbody.appendChild(tr);
  }
  document.getElementById("rowCount").textContent =
    `${sorted.length} boekingen weergegeven`;
}

function populateFilters(transactions) {
  const months = new Set();
  const cats = new Set();
  for (const tx of transactions) {
    if (tx.date) months.add(ymKey(tx.date));
    cats.add(tx.category);
  }
  const monthSel = document.getElementById("monthFilter");
  const catSel = document.getElementById("categoryFilter");
  monthSel.innerHTML = '<option value="">Alle maanden</option>';
  for (const m of [...months].sort()) {
    monthSel.appendChild(el("option", { value: m, text: m }));
  }
  catSel.innerHTML = '<option value="">Alle categorieen</option>';
  for (const c of [...cats].sort()) {
    catSel.appendChild(el("option", { value: c, text: c }));
  }
}

// ---------- App state ----------
let allTransactions = [];

function applyFilters() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const month = document.getElementById("monthFilter").value;
  const cat = document.getElementById("categoryFilter").value;
  const type = document.getElementById("typeFilter").value;

  const showExcluded = document.getElementById("excludedFilter")?.checked ?? true;
  const filtered = allTransactions.filter((tx) => {
    if (!showExcluded && tx.kind) return false;
    if (month && (!tx.date || ymKey(tx.date) !== month)) return false;
    if (cat && tx.category !== cat) return false;
    if (type === "in" && tx.amount < 0) return false;
    if (type === "out" && tx.amount >= 0) return false;
    if (q) {
      const hay = `${tx.counterparty} ${tx.description} ${tx.address} ${tx.reference}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  renderTransactions(filtered);
}

let lastAgg = null;

function processTransactions(transactions) {
  for (const tx of transactions) {
    const r = categorize(tx);
    tx.category = r.category;
    tx.kind = r.kind;
  }
  allTransactions = transactions;
  const agg = aggregate(transactions);
  lastAgg = agg;

  renderOverview(agg);
  renderPrive(agg, transactions);
  renderIntern(agg, transactions);
  populateFilters(transactions);
  renderTransactions(transactions);

  document.getElementById("results").hidden = false;
  document.getElementById("exportBtn").disabled = false;
}

function readAsText(file) {
  // file.text() bestaat niet overal; FileReader werkt ook op file:// in oudere browsers
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("Kon bestand niet lezen"));
    r.readAsText(file, "utf-8");
  });
}

async function readFiles(fileList) {
  const setStatus = (s) => (document.getElementById("status").textContent = s);
  try {
    const txs = [];
    let parsed = 0, skipped = 0, totalRows = 0;
    const skipSamples = [];
    for (const f of fileList) {
      setStatus(`Inlezen ${f.name}...`);
      const isXlsx = /\.(xlsx|xls)$/i.test(f.name);
      let headers, rows;
      if (isXlsx) {
        ({ headers, rows } = await parseXlsx(f));
      } else {
        const text = await readAsText(f);
        ({ headers, rows } = parseCsv(text));
      }
      totalRows += rows.length;
      console.log(`[${f.name}] headers:`, headers, "rijen:", rows.length);
      for (const r of rows) {
        const tx = normalizeRow(r);
        const reasons = [];
        if (!tx.date) reasons.push("geen datum");
        if (isNaN(tx.amount)) reasons.push("geen bedrag");
        if (reasons.length) {
          skipped++;
          if (skipSamples.length < 10) skipSamples.push({ reasons, row: r });
          continue;
        }
        txs.push(tx);
        parsed++;
      }
    }
    if (skipSamples.length) {
      console.warn(`Overgeslagen rijen (${skipped} totaal). Eerste ${skipSamples.length} voorbeelden:`);
      for (const s of skipSamples) console.warn(s.reasons.join(", "), s.row);
    }
    if (parsed === 0) {
      setStatus(
        `Geen boekingen herkend (${totalRows} CSV-rijen gevonden). ` +
        `Controleer of het Knab CSV-formaat is. Open de console (F12) voor details.`
      );
      return;
    }
    setStatus(`${parsed} boekingen ingelezen${skipped ? `, ${skipped} overgeslagen` : ""}.`);
    processTransactions(txs);
  } catch (err) {
    console.error(err);
    setStatus(`Fout bij inlezen: ${err && err.message ? err.message : err}`);
  }
}

// ---------- Demo data ----------
function demoCsv() {
  const header =
    "Rekeningnummer;Transactiedatum;Valutacode;CreditDebet;Bedrag;Tegenrekeningnummer;Tegenrekeninghouder;Valutadatum;Betaalwijze;Omschrijving;Type betaling;Machtigingsnummer;Incassant ID;Adres;Referentie;Boekdatum";
  const rows = [
    "NL00KNAB0123456789;2026-01-25;EUR;C;2450,00;NL11RABO0987654321;ACME B.V.;2026-01-25;Overschrijving;Salaris januari;SEPA Overschrijving;;;;;2026-01-25",
    "NL00KNAB0123456789;2026-01-02;EUR;D;1100,00;NL22INGB0011223344;Vesteda Wonen;2026-01-02;Overschrijving;Huur januari;SEPA Overschrijving;;;;;2026-01-02",
    "NL00KNAB0123456789;2026-01-04;EUR;D;58,21;NL33INGB0099887766;Albert Heijn 1234;2026-01-04;Betaalpas;Boodschappen;Pinbetaling;;;;;2026-01-04",
    "NL00KNAB0123456789;2026-01-06;EUR;D;9,99;NL44INGB0011112222;Spotify AB;2026-01-06;Incasso;Spotify Premium;Incasso;;NL01ZZZ123456;;;2026-01-06",
    "NL00KNAB0123456789;2026-01-10;EUR;D;75,40;NL55INGB0033334444;Eneco;2026-01-10;Incasso;Energie maandtermijn;Incasso;;NL02ZZZ222222;;;2026-01-10",
    "NL00KNAB0123456789;2026-01-15;EUR;D;13,99;NL66INGB0055556666;Netflix;2026-01-15;Incasso;Netflix abonnement;Incasso;;NL03ZZZ333333;;;2026-01-15",
    "NL00KNAB0123456789;2026-01-18;EUR;D;42,10;NL77INGB0077778888;Shell Nederland;2026-01-18;Betaalpas;Tanken;Pinbetaling;;;;;2026-01-18",
    "NL00KNAB0123456789;2026-01-20;EUR;D;31,55;NL88INGB0099990000;Bol.com B.V.;2026-01-20;iDEAL;Bestelling boeken;iDEAL;;;;;2026-01-20",
    "NL00KNAB0123456789;2026-02-25;EUR;C;2450,00;NL11RABO0987654321;ACME B.V.;2026-02-25;Overschrijving;Salaris februari;SEPA Overschrijving;;;;;2026-02-25",
    "NL00KNAB0123456789;2026-02-02;EUR;D;1100,00;NL22INGB0011223344;Vesteda Wonen;2026-02-02;Overschrijving;Huur februari;SEPA Overschrijving;;;;;2026-02-02",
    "NL00KNAB0123456789;2026-02-05;EUR;D;64,30;NL33INGB0099887766;Jumbo Supermarkten;2026-02-05;Betaalpas;Boodschappen;Pinbetaling;;;;;2026-02-05",
    "NL00KNAB0123456789;2026-02-12;EUR;D;22,00;NL99INGB0012345678;NS Groep;2026-02-12;Incasso;NS reizen jan;Incasso;;NL04ZZZ444444;;;2026-02-12",
    "NL00KNAB0123456789;2026-02-15;EUR;D;19,99;NL66INGB0055556666;Basic-Fit Nederland;2026-02-15;Incasso;Maandelijks abonnement;Incasso;;NL05ZZZ555555;;;2026-02-15",
    "NL00KNAB0123456789;2026-02-22;EUR;C;120,00;NL77INGB0066667777;Belastingdienst Toeslagen;2026-02-22;Overschrijving;Zorgtoeslag;SEPA Overschrijving;;;;;2026-02-22",
    "NL00KNAB0123456789;2026-01-28;EUR;D;600,00;NL16RABO0313549842;D Bouma;2026-01-28;Overboeking;Privé opname;SEPA Overschrijving;;;;C6D28PRIV;2026-01-28",
    "NL00KNAB0123456789;2026-02-28;EUR;D;1000,00;37739971;Sentis Psychologen;2026-02-28;Overboeking;Intern;SEPA Overschrijving;;;;C6D28INT;2026-02-28",
  ];
  return [header, ...rows].join("\n");
}

// ---------- Excel export ----------
function exportExcel() {
  if (typeof XLSX === "undefined") {
    alert("XLSX bibliotheek niet geladen (controleer je internetverbinding).");
    return;
  }
  if (!allTransactions.length || !lastAgg) return;
  const agg = lastAgg;
  const wb = XLSX.utils.book_new();

  const overviewSheet = aoaSheet([
    ["Overzicht"],
    [],
    ["Inkomsten",   agg.main.totalIn],
    ["Uitgaven",    agg.main.totalOut],
    ["Netto saldo", agg.main.totalIn - agg.main.totalOut],
    ["Boekingen",   agg.main.count],
    [],
    ["Per maand"],
    ["Maand", "Inkomsten", "Uitgaven", "Netto", "Aantal"],
    ...agg.main.monthly.map((m) => [m.month, m.income, m.expense, m.income - m.expense, m.count]),
    [],
    ["Per categorie"],
    ["Categorie", "Inkomsten", "Uitgaven", "Netto", "Aantal"],
    ...agg.main.byCategory.map((c) => [c.category, c.income, c.expense, c.income - c.expense, c.count]),
  ]);
  XLSX.utils.book_append_sheet(wb, overviewSheet, "Overzicht");

  XLSX.utils.book_append_sheet(
    wb,
    txSheet(allTransactions.filter((t) => !t.kind)),
    "Boekingen"
  );

  const privTxs = allTransactions.filter((t) => t.kind === "prive");
  XLSX.utils.book_append_sheet(wb, groupSheet(agg.prive, privTxs, "Privé"), "Privé");

  const intTxs = allTransactions.filter((t) => t.kind === "intern");
  XLSX.utils.book_append_sheet(wb, groupSheet(agg.intern, intTxs, "Intern"), "Intern");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `knab-analyse-${stamp}.xlsx`);
}

function aoaSheet(aoa) {
  return XLSX.utils.aoa_to_sheet(aoa);
}

function txSheet(txs) {
  const sorted = [...txs].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  const aoa = [
    ["Datum", "C/D", "Tegenpartij", "Omschrijving", "Adres", "Referentie", "Betaalwijze", "Categorie", "Bedrag"],
    ...sorted.map((t) => [
      t.date || "",
      t.creditDebet || "",
      t.counterparty || "",
      t.description || "",
      t.address || "",
      t.reference || "",
      t.method || "",
      t.category || "",
      t.amount,
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  return sheet;
}

function groupSheet(group, txs, label) {
  const header = [
    [`${label} - samenvatting`],
    [],
    [`${label} in`,    group.totalIn],
    [`${label} uit`,   group.totalOut],
    [`${label} netto`, group.totalIn - group.totalOut],
    ["Boekingen",      group.count],
    [],
    ["Per maand"],
    ["Maand", "In", "Uit", "Netto", "Aantal"],
    ...group.monthly.map((m) => [m.month, m.income, m.expense, m.income - m.expense, m.count]),
    [],
    ["Boekingen"],
    ["Datum", "C/D", "Tegenpartij", "Omschrijving", "Adres", "Referentie", "Betaalwijze", "Categorie", "Bedrag"],
    ...[...txs]
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
      .map((t) => [
        t.date || "",
        t.creditDebet || "",
        t.counterparty || "",
        t.description || "",
        t.address || "",
        t.reference || "",
        t.method || "",
        t.category || "",
        t.amount,
      ]),
  ];
  return XLSX.utils.aoa_to_sheet(header, { cellDates: true });
}

// ---------- Wire-up ----------
document.getElementById("fileInput").addEventListener("change", (e) => {
  const files = [...e.target.files];
  if (files.length) readFiles(files);
});
document.getElementById("demoBtn").addEventListener("click", () => {
  const blob = new Blob([demoCsv()], { type: "text/csv" });
  const file = new File([blob], "demo-knab.csv", { type: "text/csv" });
  readFiles([file]);
});
document.getElementById("resetBtn").addEventListener("click", () => {
  allTransactions = [];
  document.getElementById("results").hidden = true;
  document.getElementById("status").textContent = "";
  document.getElementById("fileInput").value = "";
});
for (const id of ["searchInput", "monthFilter", "categoryFilter", "typeFilter", "excludedFilter"]) {
  const elx = document.getElementById(id);
  if (!elx) continue;
  elx.addEventListener("input", applyFilters);
  elx.addEventListener("change", applyFilters);
}

document.querySelectorAll(".tab-btn[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn[data-tab]").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.hidden = p.id !== `tab-${tab}`;
    });
  });
});

document.getElementById("exportBtn").addEventListener("click", exportExcel);
