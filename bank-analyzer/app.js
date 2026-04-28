// Knab CSV analyzer - parses Knab transaction exports, labels each booking,
// and aggregates per month / category. Runs entirely in the browser.

// ---------- Categorisatie regels ----------
// Elke regel: { category, match: [strings of regexes] }
// Match wordt gedaan tegen tegenpartij + omschrijving + betaalwijze (lowercase).
// Eerste match wint, daarom specifiekere regels eerst.
const RULES = [
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
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Knab voegt een meta-/preamble-regel toe; vind de eerste regel met >=5 kolommen
  // die een datumkolom bevat.
  let headerIdx = 0;
  let delim = detectDelimiter(lines[0]);
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const d = detectDelimiter(lines[i]);
    const fields = splitCsvLine(lines[i], d);
    if (fields.length >= 5 && fields.some((f) => /datum/i.test(f))) {
      headerIdx = i;
      delim = d;
      break;
    }
  }

  const headers = splitCsvLine(lines[headerIdx], delim).map((h) => h.trim());
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i], delim);
    if (fields.length === 1 && fields[0].trim() === "") continue;
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = (fields[c] ?? "").trim();
    }
    rows.push(row);
  }
  return { headers, rows };
}

function splitCsvLine(line, delim) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
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

function parseDate(s) {
  if (!s) return null;
  // Knab: yyyy-mm-dd of dd-mm-yyyy
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
  m = s.match(/^(\d{8})$/);
  if (m) {
    const y = m[1].slice(0, 4), mo = m[1].slice(4, 6), d = m[1].slice(6, 8);
    return new Date(`${y}-${mo}-${d}T00:00:00`);
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function parseAmount(s) {
  if (s == null) return NaN;
  let str = String(s).trim();
  if (!str) return NaN;
  // verwijder valuta tekens en spaties
  str = str.replace(/[€\s]/g, "");
  // Als er zowel . als , in zit: . = duizendtal, , = decimaal
  if (str.includes(",") && str.includes(".")) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }
  const n = parseFloat(str);
  return isNaN(n) ? NaN : n;
}

function normalizeRow(row) {
  const dateStr =
    pick(row, ["Transactiedatum", "Boekdatum", "Datum"]) || "";
  const date = parseDate(dateStr);
  const counterparty = pick(row, [
    "Tegenrekeninghouder",
    "Naam tegenrekening",
    "Tegenpartij",
    "Naam",
  ]);
  const description =
    pick(row, ["Omschrijving", "Mededelingen", "Mededeling", "Description"]) || "";
  const method = pick(row, ["Betaalwijze", "Type betaling", "Type"]) || "";
  let amount = parseAmount(pick(row, ["Bedrag", "Transactiebedrag", "Amount"]));
  const cd = (pick(row, ["CreditDebet", "Af Bij", "Af/Bij", "Debet/Credit"]) || "").toLowerCase();
  if (!isNaN(amount)) {
    if (/^d/.test(cd) || /^af/.test(cd) || cd === "debet") amount = -Math.abs(amount);
    else if (/^c/.test(cd) || /^bij/.test(cd) || cd === "credit") amount = Math.abs(amount);
    // anders: laat het teken zoals het is (sommige exports hebben al een teken)
  }
  return {
    date,
    counterparty,
    description,
    method,
    amount,
    raw: row,
  };
}

// ---------- Categorisatie ----------
function categorize(tx) {
  const hay = `${tx.counterparty} ${tx.description} ${tx.method}`.toLowerCase();
  for (const rule of RULES) {
    for (const m of rule.match) {
      if (m instanceof RegExp ? m.test(hay) : hay.includes(String(m).toLowerCase())) {
        return rule.category;
      }
    }
  }
  return tx.amount >= 0 ? DEFAULT_INCOME_CATEGORY : DEFAULT_EXPENSE_CATEGORY;
}

// ---------- Aggregaties ----------
function ymKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function aggregate(transactions) {
  const monthly = new Map();
  const byCategory = new Map();
  let totalIn = 0, totalOut = 0;

  for (const tx of transactions) {
    if (!tx.date || isNaN(tx.amount)) continue;
    const key = ymKey(tx.date);
    if (!monthly.has(key)) monthly.set(key, { month: key, income: 0, expense: 0, count: 0 });
    const mo = monthly.get(key);
    mo.count++;
    if (tx.amount >= 0) { mo.income += tx.amount; totalIn += tx.amount; }
    else { mo.expense += -tx.amount; totalOut += -tx.amount; }

    const cat = tx.category;
    if (!byCategory.has(cat)) byCategory.set(cat, { category: cat, income: 0, expense: 0, count: 0 });
    const ca = byCategory.get(cat);
    ca.count++;
    if (tx.amount >= 0) ca.income += tx.amount;
    else ca.expense += -tx.amount;
  }

  return {
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    byCategory: [...byCategory.values()].sort((a, b) => (b.expense - b.income) - (a.expense - a.income)),
    totalIn, totalOut,
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

function renderTotals(agg) {
  const root = document.getElementById("totals");
  root.innerHTML = "";
  const net = agg.totalIn - agg.totalOut;
  const tiles = [
    { label: "Inkomsten",   value: fmtEur.format(agg.totalIn), cls: "pos" },
    { label: "Uitgaven",    value: fmtEur.format(agg.totalOut), cls: "neg" },
    { label: "Netto saldo", value: fmtEur.format(net), cls: net >= 0 ? "pos" : "neg" },
    { label: "Boekingen",   value: String(agg.count) },
  ];
  for (const t of tiles) {
    const tile = el("div", { class: "tile" });
    tile.appendChild(el("div", { class: "label", text: t.label }));
    tile.appendChild(el("div", { class: `value ${t.cls || ""}`, text: t.value }));
    root.appendChild(tile);
  }
}

function renderMonthly(agg) {
  const tbody = document.querySelector("#monthlyTable tbody");
  tbody.innerHTML = "";
  for (const m of agg.monthly) {
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

function renderCategories(agg) {
  const tbody = document.querySelector("#categoryTable tbody");
  tbody.innerHTML = "";
  for (const c of agg.byCategory) {
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

function renderTransactions(transactions) {
  const tbody = document.querySelector("#txTable tbody");
  tbody.innerHTML = "";
  const sorted = [...transactions].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  for (const tx of sorted) {
    const tr = el("tr");
    tr.appendChild(el("td", { text: tx.date ? fmtDate.format(tx.date) : "?" }));
    tr.appendChild(el("td", { text: tx.counterparty || "-" }));
    tr.appendChild(el("td", { text: tx.description || "" }));
    tr.appendChild(el("td", { text: tx.category }));
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

  const filtered = allTransactions.filter((tx) => {
    if (month && (!tx.date || ymKey(tx.date) !== month)) return false;
    if (cat && tx.category !== cat) return false;
    if (type === "in" && tx.amount < 0) return false;
    if (type === "out" && tx.amount >= 0) return false;
    if (q) {
      const hay = `${tx.counterparty} ${tx.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  renderTransactions(filtered);
}

function processTransactions(transactions) {
  for (const tx of transactions) tx.category = categorize(tx);
  allTransactions = transactions;
  const agg = aggregate(transactions);

  renderTotals(agg);
  renderMonthly(agg);
  renderCategories(agg);
  populateFilters(transactions);
  renderTransactions(transactions);

  document.getElementById("results").hidden = false;
}

async function readFiles(fileList) {
  const setStatus = (s) => (document.getElementById("status").textContent = s);
  const txs = [];
  let parsed = 0, skipped = 0;
  for (const f of fileList) {
    setStatus(`Inlezen ${f.name}...`);
    const text = await f.text();
    const { rows } = parseCsv(text);
    for (const r of rows) {
      const tx = normalizeRow(r);
      if (!tx.date || isNaN(tx.amount)) { skipped++; continue; }
      txs.push(tx);
      parsed++;
    }
  }
  setStatus(`${parsed} boekingen ingelezen${skipped ? `, ${skipped} overgeslagen` : ""}.`);
  processTransactions(txs);
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
  ];
  return [header, ...rows].join("\n");
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
for (const id of ["searchInput", "monthFilter", "categoryFilter", "typeFilter"]) {
  document.getElementById(id).addEventListener("input", applyFilters);
  document.getElementById(id).addEventListener("change", applyFilters);
}
