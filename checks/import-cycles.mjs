#!/usr/bin/env node
// Imports arena.ai cycle files from data/inbox/cycles/*.json into app/content/.
//   node scripts/import-cycles.mjs          write the files
//   node scripts/import-cycles.mjs --dry    only print the report
//   --inbox <dir>    read from another folder (default data/inbox/cycles)
//   --content <dir>  write to another content folder (default app/content)
//   --catalog <dir>  read exam lists from another folder (default data/inbox/catalog)
//
// The file format is "Arena cycle file" in docs/data-pipeline.md; the prompts are in docs/arena-prompts.md.
// A file holds one cycle object, or an array of them. Per object:
//   - It is validated first. A bad object is listed with every problem and skipped; nothing is guessed.
//   - A new exam is added to exams.json; a known exam is left as it is.
//   - app/content/cycles/<id>.json is written (new) or merged (existing) and registered in cycles/index.ts.
//   - The hand-curated cycle files (PROTECTED) are only filled: a new record is added, but nothing that is already
//     there is changed, confirmed or replaced (a different incoming value is listed as a conflict).
//     A protected id that has no file yet is a new cycle and goes through. Exam lists never touch them.
//
// Boards: the exam id starts with the board ("ssc-", "rrb-"). Official hosts per board (BOARDS below).
// Partial files are fine: a one-item file (syllabus, admit card, answer key, result, cut-off, notices) holds the cycle
// block plus only the fields that item needs. It is merged into the cycle and never removes anything.
// Exam lists: data/inbox/catalog/*.json (arena prompt (a)) adds the exams and an empty cycle for each listed cycle.
//
// Verified or tentative (docs/data-model.md): a record is `verified: true` only when its source is
// official for its board (see BOARDS); every other record is `verified: false` with the source site named.
// Arena checks its own output (CLAUDE.md), so this script only checks that the source is there and official.
//
// Merge rules, per record id (docs/data-model.md, "How data flows in"):
//   1. A verified value is never overwritten. A different incoming value is listed as a conflict.
//   2. An unverified value only fills a gap, or is confirmed (same value, official source).
//   3. Two unverified values that disagree: the one from the newer source date wins; with no dates the old one stays.
//   4. An unverified value is replaced when the incoming one is verified.
// Safe to run again: records that are already there count as "same" and change nothing.
// After a run: npx tsc --noEmit, npx eslint app, npm test (the tests run the data checks on all cycle files).
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const VERSION = 1;
// These lists mirror app/content/model.ts; test/import-cycles.test.ts fails if they drift apart.
export const DATE_KINDS = ["notification", "apply-start", "apply-end", "fee-end", "correction", "city-slip", "admit-card", "exam", "answer-key", "objection-end", "result", "final-answer-key", "marks", "document-verification", "other"];
export const FACT_KINDS = ["vacancies", "fee", "age", "qualification", "stages", "pay", "other"];
export const NOTICE_TYPES = ["notice", "admit-card", "answer-key", "result", "cut-off", "marks"];
export const LEVELS = ["10th", "12th", "graduate", "diploma", "mixed"];
// Hand-curated cycle files: the 2026 cycles written by hand or from researched JSON, plus Selection Post 14.
// The importer never changes an existing one (a new file is fine). Keep in step with scripts/scrape/import-previous.mjs.
export const PROTECTED = new Set([
  "ssc-cgl-2026", "ssc-chsl-2026", "ssc-cpo-2026", "ssc-gd-2026", "ssc-je-2026", "ssc-steno-2026", "ssc-selection-post-14",
  "ssc-mts-2026", "ssc-jht-2026", "ssc-delhi-police-constable-exe-2026", "ssc-delhi-police-hc-min-2026", "ssc-delhi-police-hc-awo-tpo-2026",
]);
// Derived fact ids (from the documents). `extra_facts` may not reuse them.
const DERIVED_FACT_IDS = ["vacancies", "vacancies-in-the-notification", "age", "age-relaxation", "fee", "fee-exempt", "qualification", "stages"];
/** Boards and their official hosts. A host matches when it is the domain or a subdomain of it (https only counts, see hostOf). */
export const BOARDS = {
  ssc: { name: "SSC", hosts: [/(^|\.)ssc\.gov\.in$/, /(^|\.)nic\.in$/] },
  rrb: { name: "RRB", hosts: [/(^|\.)rrbcdg\.gov\.in$/, /(^|\.)rrbapply\.gov\.in$/, /(^|\.)indianrailways\.gov\.in$/, /(^|\.)rrb[a-z0-9-]*\.gov\.in$/, /(^|\.)nic\.in$/] },
};
/** The board part of an exam or cycle id ("rrb-ntpc-2099" -> "rrb"), or null. */
export const boardOf = (id) => {
  const b = typeof id === "string" ? id.split("-")[0] : "";
  return Object.hasOwn(BOARDS, b) ? b : null;
};
const TOP_KEYS = ["version", "exam", "cycle", "documents", "notices", "extra_facts", "tables", "pattern", "syllabus"];

// ---------- small helpers ----------

// Same 1-space layout as the other importers, with { "en", "hi" } pairs on one line.
export const json = (x) =>
  JSON.stringify(x, null, 1).replace(/\{\s*"en": ("(?:[^"\\]|\\.)*"),\s*"hi": ("(?:[^"\\]|\\.)*"\s*)\}/g, (_, en, hi) => `{ "en": ${en}, "hi": ${hi.trim()} }`) + "\n";

export const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

const bi = (en, hi) => ({ en, hi: hi ?? en });
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
const dayEn = (iso) => `${+iso.slice(8, 10)} ${MONTHS_EN[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
const dayHi = (iso) => `${+iso.slice(8, 10)} ${MONTHS_HI[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const str = (v) => typeof v === "string" && v.trim() !== "";
const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const isInt = (v) => Number.isInteger(v);
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** The real URL out of a markdown link "[url](url)" (the notices inbox has these), or the string as it is. */
export const cleanUrl = (s) => {
  if (typeof s !== "string") return "";
  const t = s.trim();
  return (t.match(/\((https?:\/\/[^)\s]+)\)\s*$/) ?? t.match(/^\[?(https?:\/\/[^\]\s]+)\]?$/))?.[1] ?? t;
};
const norm = (u) => cleanUrl(u).replace(/\/+$/, "");
export const hostOf = (url) => {
  try {
    const u = new URL(cleanUrl(url));
    return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
};
/** True only for the board's official hosts (default SSC: ssc.gov.in, nic.in). Matches the host, not the start of the URL; https or http only. */
export const isOfficial = (url, board = "ssc") => {
  const h = hostOf(url);
  return !!h && !!BOARDS[board] && BOARDS[board].hosts.some((re) => re.test(h));
};

// ---------- validation ----------

/**
 * Every problem in one cycle object, as readable lines. Empty means the object can be imported.
 * `knownExams` is the set of exam ids in exams.json.
 */
export function validate(f, knownExams = new Set()) {
  const out = [];
  if (!isObj(f)) return ["not a JSON object"];
  // The board comes from the exam id; it decides which hosts are official.
  const board = boardOf(f.cycle?.exam) ?? boardOf(f.exam?.id) ?? "ssc";
  const officialHosts = board === "rrb" ? "RRB (rrbcdg.gov.in, rrbapply.gov.in, indianrailways.gov.in, rrb*.gov.in) or nic.in" : "ssc.gov.in or nic.in";
  if (f.version !== VERSION) out.push(`version is ${JSON.stringify(f.version)}, expected ${VERSION}`);
  for (const k of Object.keys(f)) if (!TOP_KEYS.includes(k)) out.push(`unknown top-level key "${k}"`);

  // exam
  let examId = null;
  if (f.exam !== null && f.exam !== undefined) {
    const e = f.exam;
    if (!isObj(e)) out.push("exam: must be null or an object");
    else {
      examId = e.id;
      if (!str(e.id) || !SLUG.test(e.id)) out.push("exam.id: lowercase letters, digits and dashes");
      else if (!boardOf(e.id)) out.push(`exam.id "${e.id}" must start with a board: ${Object.keys(BOARDS).map((b) => `${b}-`).join(" or ")}`);
      for (const k of ["name_en", "name_hi", "short_en", "short_hi"]) if (!str(e[k])) out.push(`exam.${k}: missing`);
      if (!LEVELS.includes(e.level)) out.push(`exam.level: "${e.level}" is not one of ${LEVELS.join(", ")}`);
    }
  }

  // cycle
  const c = f.cycle;
  const docUrls = new Set();
  const noticeUrls = new Set();
  if (!isObj(c)) out.push("cycle: missing");
  else {
    if (!str(c.id) || !SLUG.test(c.id)) out.push("cycle.id: lowercase letters, digits and dashes");
    if (!str(c.exam) || !SLUG.test(c.exam)) out.push("cycle.exam: lowercase letters, digits and dashes");
    if (examId && c.exam !== examId) out.push(`cycle.exam "${c.exam}" is not exam.id "${examId}"`);
    if (str(c.id) && str(c.exam) && !c.id.startsWith(`${c.exam}-`)) out.push(`cycle.id must start with "${c.exam}-"`);
    if (str(c.exam) && SLUG.test(c.exam) && !boardOf(c.exam)) out.push(`cycle.exam "${c.exam}" must start with a board: ${Object.keys(BOARDS).map((b) => `${b}-`).join(" or ")}`);
    if (!isInt(c.year) || c.year < 2000 || c.year > 2100) out.push(`cycle.year: ${JSON.stringify(c.year)} is not a year`);
    for (const k of ["name_en", "name_hi"]) if (!str(c[k])) out.push(`cycle.${k}: missing`);
    for (const k of ["lead_en", "lead_hi"]) if (c[k] !== undefined && c[k] !== null && !str(c[k])) out.push(`cycle.${k}: empty text`);
    if (!!c.lead_en !== !!c.lead_hi) out.push("cycle.lead_en and cycle.lead_hi go together");
    if (c.exam && !examId && !knownExams.has(c.exam)) out.push(`exam "${c.exam}" is not in exams.json, so the "exam" block must describe it (not null)`);
  }

  // documents (the facts format of data/inbox/facts, one object per official file)
  const docs = f.documents ?? [];
  if (!Array.isArray(docs)) out.push("documents: must be an array");
  else
    docs.forEach((d, i) => {
      const at = `documents[${i}]`;
      if (!isObj(d)) return out.push(`${at}: not an object`);
      if (d.cycle !== undefined && isObj(c) && d.cycle !== c.id) out.push(`${at}.cycle "${d.cycle}" is not cycle.id`);
      if (!hostOf(d.pdf_url)) out.push(`${at}.pdf_url: not a web URL`);
      else docUrls.add(norm(d.pdf_url));
      if (!str(d.pdf_title)) out.push(`${at}.pdf_title: missing`);
      if (!isDay(d.pdf_date)) out.push(`${at}.pdf_date: "${d.pdf_date}" is not YYYY-MM-DD`);
      for (const [j, x] of (d.dates ?? []).entries()) {
        const w = `${at}.dates[${j}]`;
        if (!str(x?.label_en)) out.push(`${w}.label_en: missing`);
        if (x?.start !== null && x?.start !== undefined && !isDay(x.start)) out.push(`${w}.start: "${x.start}" is not YYYY-MM-DD or null`);
        if (x?.end !== null && x?.end !== undefined && !isDay(x.end)) out.push(`${w}.end: "${x.end}" is not YYYY-MM-DD or null`);
        if (x?.end && !x?.start) out.push(`${w}: end without start`);
        if (x?.start && x?.end && x.end < x.start) out.push(`${w}: ends before it starts`);
        if (x?.kind !== undefined && x.kind !== null && !DATE_KINDS.includes(x.kind)) out.push(`${w}.kind: "${x.kind}" is not a date kind`);
        if (x?.tier !== undefined && x.tier !== null && !SLUG.test(String(x.tier))) out.push(`${w}.tier: "${x.tier}" must be like tier-1`);
      }
      const v = d.vacancies;
      if (v && v.total !== null && v.total !== undefined && !(isInt(v.total) && v.total > 0)) out.push(`${at}.vacancies.total: must be a whole number above 0, or null`);
      const a = d.age;
      if (a && (a.min !== null || a.max !== null)) {
        if (!isInt(a.min) || !isInt(a.max) || a.min > a.max) out.push(`${at}.age: min and max must be whole numbers, min <= max`);
        if (!isDay(a.as_on)) out.push(`${at}.age.as_on: "${a.as_on}" is not YYYY-MM-DD`);
      }
      const fee = d.fee;
      if (fee && fee.general !== null && fee.general !== undefined && !(isInt(fee.general) && fee.general >= 0)) out.push(`${at}.fee.general: must be a whole number, or null`);
      for (const [j, s] of (d.stages ?? []).entries()) if (!str(s?.name_en)) out.push(`${at}.stages[${j}].name_en: missing`);
    });

  // notices (the notices format of data/inbox/notices, without exam and year)
  const notices = f.notices ?? [];
  if (!Array.isArray(notices)) out.push("notices: must be an array");
  else
    notices.forEach((n, i) => {
      const at = `notices[${i}]`;
      if (!isObj(n)) return out.push(`${at}: not an object`);
      if (!isDay(n.date)) out.push(`${at}.date: "${n.date}" is not YYYY-MM-DD`);
      if (!NOTICE_TYPES.includes(n.type)) out.push(`${at}.type: "${n.type}" is not one of ${NOTICE_TYPES.join(", ")}`);
      if (!str(n.title_en) || !str(n.title_hi)) out.push(`${at}: title_en and title_hi are both needed`);
      if (!hostOf(n.url)) out.push(`${at}.url: not a web URL`);
      else if (!isOfficial(n.url, board)) out.push(`${at}.url: notices are official files only (${officialHosts}), got ${hostOf(n.url)}`);
      else noticeUrls.add(norm(n.url));
    });

  // blocks that point at a source by URL: the URL must be declared as a document or a notice
  const declared = (u) => docUrls.has(norm(u)) || noticeUrls.has(norm(u));
  const src = (at, u, needOfficial) => {
    if (!hostOf(u)) return out.push(`${at}.source_url: not a web URL`);
    if (!declared(u)) out.push(`${at}.source_url: list this URL under "documents" (or "notices") first`);
    if (needOfficial && !isOfficial(u, board)) out.push(`${at}.source_url: must be an ${officialHosts} file (this block has no verified flag)`);
  };

  const facts = f.extra_facts ?? [];
  if (!Array.isArray(facts)) out.push("extra_facts: must be an array");
  else {
    const ids = new Set();
    facts.forEach((x, i) => {
      const at = `extra_facts[${i}]`;
      if (!isObj(x)) return out.push(`${at}: not an object`);
      if (!str(x.id) || !SLUG.test(x.id)) out.push(`${at}.id: lowercase letters, digits and dashes`);
      else if (DERIVED_FACT_IDS.includes(x.id)) out.push(`${at}.id: "${x.id}" is made from "documents"; pick another id`);
      else if (ids.has(x.id)) out.push(`${at}.id: duplicate "${x.id}"`);
      else ids.add(x.id);
      if (!FACT_KINDS.includes(x.kind)) out.push(`${at}.kind: "${x.kind}" is not one of ${FACT_KINDS.join(", ")}`);
      if (!str(x.label_en) || !str(x.label_hi)) out.push(`${at}: label_en and label_hi are both needed`);
      if (!str(x.value_en)) out.push(`${at}.value_en: missing`);
      if (x.num !== undefined && x.num !== null && typeof x.num !== "number") out.push(`${at}.num: must be a number`);
      src(at, x.source_url, false);
    });
  }

  const tables = f.tables ?? [];
  if (!Array.isArray(tables)) out.push("tables: must be an array");
  else {
    const ids = new Set();
    tables.forEach((t, i) => {
      const at = `tables[${i}]`;
      if (!isObj(t)) return out.push(`${at}: not an object`);
      if (!str(t.id) || !SLUG.test(t.id)) out.push(`${at}.id: lowercase letters, digits and dashes`);
      else if (ids.has(t.id)) out.push(`${at}.id: duplicate "${t.id}"`);
      else ids.add(t.id);
      if (!str(t.title_en) || !str(t.title_hi)) out.push(`${at}: title_en and title_hi are both needed`);
      if (!Array.isArray(t.head_en) || !Array.isArray(t.head_hi) || !t.head_en.length || t.head_en.length !== t.head_hi.length || ![...t.head_en, ...t.head_hi].every(str)) out.push(`${at}: head_en and head_hi must be lists of text of the same length`);
      if (!Array.isArray(t.rows) || !t.rows.length) out.push(`${at}.rows: need at least one row`);
      else
        t.rows.forEach((r, j) => {
          if (!Array.isArray(r) || r.length !== t.head_en?.length) out.push(`${at}.rows[${j}]: ${Array.isArray(r) ? r.length : "not a list"} cells, head has ${t.head_en?.length}`);
          else if (!r.every((x) => typeof x === "number" || typeof x === "string")) out.push(`${at}.rows[${j}]: cells are text or numbers`);
        });
      if (t.note_en !== undefined && t.note_en !== null && (!str(t.note_en) || !str(t.note_hi))) out.push(`${at}: note_en and note_hi go together`);
      src(at, t.source_url, false);
    });
  }

  const pattern = f.pattern ?? [];
  if (!Array.isArray(pattern)) out.push("pattern: must be an array");
  else
    pattern.forEach((p, i) => {
      const at = `pattern[${i}]`;
      if (!isObj(p)) return out.push(`${at}: not an object`);
      if (!str(p.title_en) || !str(p.title_hi)) out.push(`${at}: title_en and title_hi are both needed`);
      if (!Array.isArray(p.rows) || !p.rows.length) out.push(`${at}.rows: need at least one row`);
      else
        p.rows.forEach((r, j) => {
          if (!str(r?.section_en) || !str(r?.section_hi)) out.push(`${at}.rows[${j}]: section_en and section_hi are both needed`);
          if (!isInt(r?.questions) || r.questions < 0) out.push(`${at}.rows[${j}].questions: whole number`);
          if (typeof r?.marks !== "number" || r.marks < 0) out.push(`${at}.rows[${j}].marks: number`);
          if (r?.minutes !== undefined && r.minutes !== null && !isInt(r.minutes)) out.push(`${at}.rows[${j}].minutes: whole number or null`);
        });
      if (p.minutes !== undefined && p.minutes !== null && !isInt(p.minutes)) out.push(`${at}.minutes: whole number or null`);
      const ne = p.notes_en ?? [];
      const nh = p.notes_hi ?? [];
      if (!Array.isArray(ne) || !Array.isArray(nh) || ne.length !== nh.length || ![...ne, ...nh].every(str)) out.push(`${at}: notes_en and notes_hi must be lists of text of the same length`);
      src(at, p.source_url, true);
    });

  if (f.syllabus !== null && f.syllabus !== undefined && !isObj(f.syllabus)) out.push("syllabus: must be null or an object");
  return out;
}

// ---------- building records ----------

const slugOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Compiles the glossary rules once. `glossary` is app/content/glossary.json. */
export function glossaryRules(glossary) {
  return {
    glossary,
    labelRules: glossary.labelRules.map((r) => ({ re: new RegExp(r.match, "i"), kind: r.kind })),
    tierRules: glossary.tierRules.map((r) => ({ re: new RegExp(r.match, "i"), tier: r.tier })),
  };
}

/** Kind and tier of a date: the file's own `kind` / `tier` when given, else the same label rules as import-facts.mjs. */
export function dateKind(g, d) {
  const label = d.label_en;
  let kind = d.kind;
  if (!kind) {
    const l = label.toLowerCase();
    if (/submission of (the )?online|dates? for (the )?(online )?(submission|application)/.test(l)) kind = "apply-start";
    else if (/receipt of (the )?online/.test(l)) kind = "apply-end";
    else if (/fee payment/.test(l)) kind = "fee-end";
    else if (/correction/.test(l)) kind = "correction";
    else kind = g.labelRules.find((r) => r.re.test(label))?.kind ?? "other";
  }
  const tier = d.tier ?? g.tierRules.find((r) => r.re.test(label))?.tier ?? undefined;
  return { kind, tier };
}

function dateLabel(g, kind, tier, d) {
  const base = g.glossary.dateKinds[kind];
  const t = tier ? g.glossary.tiers[tier] : undefined;
  if (kind === "other" || !base) return bi(d.label_en, d.label_hi);
  return t ? { en: `${t.en} ${base.en.toLowerCase()}`, hi: `${t.hi} ${base.hi}` } : base;
}

const valueText = (v) => (typeof v === "string" ? v : v?.en ?? "");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Decides what to do with a record that has the same id as an existing one.
 * "same": nothing to do. "confirm": same value, now with an official source. "replace" / "keep": the values differ.
 */
export function resolve(old, neu, equal, oldSourceDate, neuSourceDate) {
  if (equal) return neu.verified && !old.verified ? "confirm" : "same";
  if (old.verified) return "keep"; // a verified value is never overwritten
  if (neu.verified) return "replace";
  return oldSourceDate && neuSourceDate && neuSourceDate >= oldSourceDate ? "replace" : "keep";
}

/** The mutable report of one merge. */
export const newReport = () => ({ added: { dates: 0, facts: 0, notices: 0, tables: 0, pattern: 0 }, confirmed: 0, replaced: 0, tentative: 0, same: 0, conflicts: [], skipped: [], notes: [] });

/**
 * Merges one validated cycle object into `base`, a cycle record (a new skeleton or the existing one).
 * Returns { cycle, changed, report }. `base` is not modified. `opts.fillOnly`: only add records, never change one that exists.
 */
export function mergeCycle(base, f, g, today = istToday(), opts = {}) {
  const cy = structuredClone(base);
  const report = newReport();
  const id = cy.id;
  const board = boardOf(cy.exam) ?? "ssc";
  const before = JSON.stringify(cy);

  const c = f.cycle;
  if (!cy.lead && c.lead_en) cy.lead = bi(c.lead_en, c.lead_hi);

  // Declared sources by URL: documents and notices of this file.
  const declared = new Map();
  for (const d of f.documents ?? []) declared.set(norm(d.pdf_url), { title: bi(d.pdf_title, d.pdf_title_hi), url: cleanUrl(d.pdf_url), date: d.pdf_date, prefix: "P" });
  for (const n of f.notices ?? []) if (!declared.has(norm(n.url))) declared.set(norm(n.url), { title: bi(n.title_en, n.title_hi), url: cleanUrl(n.url), date: n.date, prefix: "A" });

  /** The source id for a declared URL: an existing source with the same URL is reused. */
  const sourceFor = (url) => {
    const d = declared.get(norm(url));
    let key = Object.keys(cy.sources).find((k) => norm(cy.sources[k].url) === norm(url));
    if (!key) {
      let n = 1;
      while (cy.sources[`${d.prefix}${n}`]) n++;
      key = `${d.prefix}${n}`;
      const official = isOfficial(url, board);
      cy.sources[key] = { title: d.title, url: d.url, date: d.date, official, ...(official ? {} : { site: hostOf(url).replace(/^www\./, "") }) };
    }
    const s = cy.sources[key];
    return { id: key, official: s.official, date: s.date ?? d?.date };
  };

  /** Puts `rec` (with `verified` and `source`) into `list` by id, following the merge rules. `place` is where a new one goes. */
  const put = (list, rec, label, equal, place) => {
    const old = list.find((x) => x.id === rec.id);
    if (!old) {
      if (place) place(list, rec);
      else list.push(rec);
      if (!rec.verified) report.tentative++;
      return "add";
    }
    const eq = equal(old, rec);
    const act = opts.fillOnly ? (eq ? "same" : "keep") : resolve(old, rec, eq, cy.sources[old.source]?.date, cy.sources[rec.source]?.date);
    if (act === "same") report.same++;
    else if (act === "confirm") {
      Object.assign(old, { verified: true, source: rec.source });
      report.confirmed++;
    } else {
      // A record can carry none of value/start/rows (a date with only `raw`); JSON.stringify(undefined) is undefined.
      const show = (x) => String(JSON.stringify(x.value ?? x.start ?? x.rows ?? x.raw ?? x.label ?? null)).slice(0, 60);
      const o = show(old);
      const n = show(rec);
      report.conflicts.push(`${label}: ${act === "keep" ? "kept" : "replaced"} ${o} (${old.verified ? "verified" : "tentative"}), incoming ${n} (${rec.verified ? "verified" : "tentative"})`);
      if (act === "replace") {
        const keep = old.id;
        for (const k of Object.keys(old)) delete old[k];
        Object.assign(old, rec, { id: keep });
        report.replaced++;
      }
    }
    return act;
  };

  // ---- documents: dates and facts ----
  const seenDate = new Map();
  for (const d of f.documents ?? []) {
    const s = sourceFor(d.pdf_url);
    const v = s.official;
    const tag = `${id}`;

    for (const x of d.dates ?? []) {
      if (!x.start) {
        report.skipped.push(`${tag}: date without a value: ${x.label_en}`);
        continue;
      }
      const { kind, tier } = dateKind(g, x);
      const base = `${id}.${kind === "other" ? `other-${slugOf(x.label_en)}` : kind}${tier ? `-${tier}` : ""}`;
      const n = (seenDate.get(base) ?? 0) + 1;
      seenDate.set(base, n);
      const did = n > 1 ? `${base}-${n}` : base;
      const rec = { id: did, kind, label: dateLabel(g, kind, tier, x), start: x.start, ...(x.end && x.end !== x.start ? { end: x.end } : {}), ...(tier ? { tier } : {}), verified: v, source: s.id };
      // A hand-written file may use another id for the first date of this kind and tier; match it by kind and tier.
      if (n === 1 && kind !== "other" && !cy.dates.some((o) => o.id === did)) {
        const alt = cy.dates.find((o) => o.kind === kind && (o.tier ?? undefined) === tier);
        if (alt) rec.id = alt.id;
      }
      put(cy.dates, rec, `${did}`, (o, r) => o.start === r.start && o.end === r.end, (list, r) => {
        const at = list.findIndex((o) => o.start && o.start > r.start);
        list.splice(at < 0 ? list.length : at, 0, r);
      });
    }

    const fact = (fid, kind, label, value, extra = {}) => {
      const rec = { id: `${id}.${fid}`, kind, label, value, ...extra, verified: v, source: s.id };
      put(cy.facts, rec, rec.id, (o, r) => same(o.value, r.value) && o.num === r.num);
    };
    const total = d.vacancies?.total;
    if (total) fact("vacancies", "vacancies", bi("Vacancies (tentative)", "रिक्तियाँ (अस्थायी)"), total.toLocaleString("en-US"), { num: total });
    else if (d.vacancies) report.skipped.push(`${tag}: vacancies: no total stated`);
    const a = d.age;
    if (a && isInt(a.min) && isInt(a.max)) {
      fact("age", "age", { en: `Age limit (as on ${dayEn(a.as_on)})`, hi: `आयु सीमा (${dayHi(a.as_on)} तक)` }, `${a.min}–${a.max}`);
      if (a.relaxation_note_en) fact("age-relaxation", "age", bi("Age relaxation", "आयु में छूट"), bi(a.relaxation_note_en));
    } else if (a && (a.min != null || a.max != null)) report.skipped.push(`${tag}: age: min, max or date missing`);
    const fe = d.fee;
    if (fe && isInt(fe.general)) {
      fact("fee", "fee", bi("Application fee", "आवेदन शुल्क"), `₹${fe.general}`, { num: fe.general });
      if (fe.exempt) fact("fee-exempt", "fee", bi("Fee exempt for", "इनके लिए शुल्क माफ़"), bi(fe.exempt));
    } else if (fe?.exempt) report.skipped.push(`${tag}: fee: exempt group given but no amount`);
    if (d.qualification_en) fact("qualification", "qualification", bi("Qualification", "योग्यता"), bi(d.qualification_en));
    const stages = (d.stages ?? []).filter((x) => x.name_en);
    if (stages.length) fact("stages", "stages", bi("Exam stages", "परीक्षा चरण"), bi(stages.map((x) => x.name_en).join(" → ")), { short: String(stages.length), shortLabel: bi("Stages", "चरण"), num: stages.length });
  }

  // ---- extra facts ----
  for (const x of f.extra_facts ?? []) {
    const s = sourceFor(x.source_url);
    const value = x.value_hi ? bi(x.value_en, x.value_hi) : x.value_en;
    const rec = { id: `${id}.${x.id}`, kind: x.kind, label: bi(x.label_en, x.label_hi), value, ...(typeof x.num === "number" ? { num: x.num } : {}), ...(x.group ? { group: x.group } : {}), verified: s.official, source: s.id };
    put(cy.facts, rec, rec.id, (o, r) => same(o.value, r.value) && o.num === r.num);
  }

  // ---- tables (cut-offs, vacancy tables) ----
  for (const t of f.tables ?? []) {
    const s = sourceFor(t.source_url);
    const rec = {
      id: `${id}.${t.id}`, title: bi(t.title_en, t.title_hi), head: t.head_en.map((h, i) => bi(h, t.head_hi[i])), rows: t.rows,
      ...(t.note_en ? { note: bi(t.note_en, t.note_hi) } : {}), verified: s.official, source: s.id,
    };
    put(cy.tables, rec, rec.id, (o, r) => same([o.title, o.head, o.rows], [r.title, r.head, r.rows]));
  }

  // ---- pattern: no id and no verified flag, so an existing table with the same title always stays ----
  for (const p of f.pattern ?? []) {
    const s = sourceFor(p.source_url);
    const rec = {
      title: bi(p.title_en, p.title_hi),
      rows: p.rows.map((r) => ({ section: bi(r.section_en, r.section_hi), questions: r.questions, marks: r.marks, ...(r.minutes ? { minutes: r.minutes } : {}) })),
      ...(p.minutes ? { minutes: p.minutes } : {}),
      notes: (p.notes_en ?? []).map((n, i) => bi(n, p.notes_hi[i])),
      source: s.id,
    };
    const old = cy.pattern.find((o) => o.title.en === rec.title.en);
    if (!old) {
      cy.pattern.push(rec);
    } else if (same({ ...old, source: 0 }, { ...rec, source: 0 })) report.same++;
    else report.conflicts.push(`${id} pattern "${rec.title.en}": kept the existing table, incoming differs`);
  }

  // ---- notices: same rules as import-notices.mjs ----
  const noticesBefore = new Set(cy.notices.map((n) => n.id));
  for (const e of f.notices ?? []) {
    const url = cleanUrl(e.url);
    const s0 = Object.keys(cy.sources).find((k) => norm(cy.sources[k].url) === norm(url));
    if (s0 && cy.notices.some((n) => n.source === s0)) {
      report.same++;
      continue;
    }
    const clash = cy.notices.find((n) => noticesBefore.has(n.id) && n.date === e.date && n.type === e.type);
    if (clash) {
      report.conflicts.push(`${id} ${e.date} ${e.type}: kept notice "${clash.title.en}", skipped "${e.title_en}" (${url})`);
      continue;
    }
    const s = sourceFor(url);
    let nid = `${id}.notice-${s.id.toLowerCase()}`;
    for (let k = 2; cy.notices.some((n) => n.id === nid); k++) nid = `${id}.notice-${s.id.toLowerCase()}-${k}`;
    cy.notices.push({ id: nid, date: e.date, type: e.type, title: bi(e.title_en, e.title_hi), source: s.id });
    cy.notices.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); // stable
    report.added.notices++;
  }

  // Counts of new records, from the ids that were not there before.
  const count = (list, prior) => list.filter((x) => !prior.has(x.id)).length;
  const was = JSON.parse(before);
  report.added.dates = count(cy.dates, new Set(was.dates.map((x) => x.id)));
  report.added.facts = count(cy.facts, new Set(was.facts.map((x) => x.id)));
  report.added.tables = count(cy.tables, new Set(was.tables.map((x) => x.id)));
  report.added.pattern = cy.pattern.length - was.pattern.length;

  const changed = JSON.stringify(cy) !== before;
  if (changed) cy.updatedAt = today;
  return { cycle: cy, changed, report };
}

/** A new, empty cycle record for a validated object. */
export function skeleton(f, today = istToday()) {
  const c = f.cycle;
  return {
    version: VERSION, id: c.id, exam: c.exam, year: c.year, name: bi(c.name_en, c.name_hi),
    ...(c.lead_en ? { lead: bi(c.lead_en, c.lead_hi) } : {}),
    updatedAt: today, sources: {}, dates: [], facts: [], notices: [], tables: [], pattern: [],
  };
}

/** The exam record for exams.json from the file's `exam` block. */
export const examRecord = (e) => ({ id: e.id, body: boardOf(e.id) ?? "ssc", name: bi(e.name_en, e.name_hi), short: bi(e.short_en, e.short_hi), level: e.level });

// ---------- cycles/index.ts ----------

const varName = (id) => "c" + id.replace(/^ssc-/, "").split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");

/** Adds the import line and the array entry for a cycle file to the text of cycles/index.ts. */
export function registerInIndex(text, id) {
  if (text.includes(`from "./${id}.json"`)) return { text, added: false };
  const name = varName(id);
  if (new RegExp(`\\b${name}\\b`).test(text)) throw new Error(`cycles/index.ts: the name ${name} is already used`);
  const lines = text.split("\n");
  let lastImport = -1;
  lines.forEach((l, i) => {
    if (/^import \w+ from "\.\/.+\.json";$/.test(l)) lastImport = i;
  });
  const close = lines.lastIndexOf("];");
  if (lastImport < 0 || close < lastImport) throw new Error("cycles/index.ts: unexpected layout, add the cycle by hand");
  lines.splice(close, 0, `  ${name},`);
  lines.splice(lastImport + 1, 0, `import ${name} from "./${id}.json";`);
  return { text: lines.join("\n"), added: true };
}

// ---------- exam lists (arena prompt (a)) ----------

/**
 * Turns one exam-list file (data/inbox/catalog/*.json) into cycle objects: an exam block and an empty cycle for each
 * listed cycle, plus its notification as a notice when it has an official URL and date. `board` is "SSC" or "RRB".
 * Returns { files, problems }; a bad exam or cycle is reported and left out.
 */
export function catalogToFiles(cat) {
  const files = [];
  const problems = [];
  const board = typeof cat?.board === "string" ? cat.board.toLowerCase() : "";
  if (!isObj(cat) || cat.version !== VERSION || !Array.isArray(cat.exams)) return { files, problems: ["not an exam list: needs version 1 and an exams array"] };
  if (!Object.hasOwn(BOARDS, board)) return { files, problems: [`board "${cat.board}" is not one of ${Object.values(BOARDS).map((b) => b.name).join(", ")}`] };
  for (const e of cat.exams) {
    const at = `exam ${e?.exam_id}`;
    if (!isObj(e) || !str(e.exam_id) || !SLUG.test(e.exam_id) || !e.exam_id.startsWith(`${board}-`)) {
      problems.push(`${at}: exam_id must be lowercase and start with "${board}-"`);
      continue;
    }
    const exam = { id: e.exam_id, name_en: e.name_en, name_hi: e.name_hi, short_en: e.short_en, short_hi: e.short_hi, level: e.level };
    for (const c of Array.isArray(e.cycles) ? e.cycles : []) {
      const f = { version: VERSION, exam, cycle: { id: c?.cycle_id, exam: e.exam_id, year: c?.year, name_en: c?.name_en, name_hi: c?.name_hi } };
      if (str(c?.notice_url) && isDay(c?.notice_date)) {
        f.notices = [{ date: c.notice_date, type: "notice", title_en: `${c.name_en} notification`, title_hi: `${c.name_hi} अधिसूचना`, url: c.notice_url }];
      }
      const bad = validate(f, new Set());
      // A notice URL that is not official is dropped (the cycle itself is still listed).
      if (bad.some((x) => x.startsWith("notices[0].url")) && f.notices) {
        delete f.notices;
        problems.push(`${c.cycle_id}: notice_url is not an official ${BOARDS[board].name} file, left out`);
      }
      files.push(f);
    }
    if (!Array.isArray(e.cycles) || !e.cycles.length) problems.push(`${at}: no cycles listed, so the exam is not added (an exam comes in with its first cycle)`);
  }
  return { files, problems };
}

// ---------- the run ----------

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

/**
 * Reads the inbox and imports it. Returns the report; writes only when `dry` is false.
 * `opts`: { inbox, content, dry, today }.
 */
export async function run(opts = {}) {
  const inbox = opts.inbox ?? "data/inbox/cycles";
  const content = opts.content ?? "app/content";
  const dry = !!opts.dry;
  const today = opts.today ?? istToday();
  const cyclesDir = join(content, "cycles");

  const g = glossaryRules(await readJson(join(content, "glossary.json")));
  const examsFile = await readJson(join(content, "exams.json"));
  const knownExams = new Set(examsFile.exams.map((e) => e.id));
  let indexText = await readFile(join(cyclesDir, "index.ts"), "utf8");

  let files = [];
  try {
    files = (await readdir(inbox)).filter((f) => f.endsWith(".json")).sort();
  } catch {}
  const catalogDir = opts.catalog ?? "data/inbox/catalog";
  let catalogs = [];
  try {
    catalogs = (await readdir(catalogDir)).filter((f) => f.endsWith(".json")).sort();
  } catch {}

  const rep = { files: files.length + catalogs.length, written: 0, objects: 0, newExams: [], cycles: [], bad: [], refused: [], conflicts: [], skipped: [], syllabus: [], notListed: [] };
  const cycles = new Map(); // id -> { data, isNew, changed, report }

  // Work list: exam lists first (they add exams and empty cycles), then the cycle files.
  const work = [];
  for (const file of catalogs) {
    try {
      const { files: fs, problems } = catalogToFiles(await readJson(join(catalogDir, file)));
      fs.forEach((f, i) => work.push({ f, at: `${file}[${i}]`, fromCatalog: true }));
      for (const p of problems) rep.skipped.push(`${file}: ${p}`);
    } catch (err) {
      rep.bad.push(`${file}: not valid JSON (${err.message})`);
    }
  }
  for (const file of files) {
    let parsed;
    try {
      parsed = await readJson(join(inbox, file));
    } catch (err) {
      rep.bad.push(`${file}: not valid JSON (${err.message})`);
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    items.forEach((f, i) => work.push({ f, at: items.length > 1 || Array.isArray(parsed) ? `${file}[${i}]` : file }));
  }

  {
    // Files that describe a new exam (an "exam" block) go first, so a one-item file of the same cycle can follow in any file-name order.
    work.sort((a, b) => Number(!a.f?.exam) - Number(!b.f?.exam));
    for (const { f, at, fromCatalog } of work) {
      rep.objects++;
      const errors = validate(f, knownExams);
      if (errors.length) {
        rep.bad.push(`${at}:\n${errors.map((e) => `      - ${e}`).join("\n")}`);
        continue;
      }
      const id = f.cycle.id;
      let entry = cycles.get(id);
      if (!entry) {
        let data = null;
        try {
          data = await readJson(join(cyclesDir, `${id}.json`));
        } catch {}
        if (data && PROTECTED.has(id) && fromCatalog) continue; // an exam list adds nothing to a hand-curated cycle
        entry = { data: data ?? skeleton(f, today), isNew: !data, changed: !data, report: newReport(), objects: 0, fillOnly: !!data && PROTECTED.has(id) };
        cycles.set(id, entry);
      }
      if (f.exam && !knownExams.has(f.exam.id)) {
        examsFile.exams.push(examRecord(f.exam));
        knownExams.add(f.exam.id);
        rep.newExams.push(f.exam.id);
      }
      const { cycle, changed, report } = mergeCycle(entry.data, f, g, today, { fillOnly: entry.fillOnly });
      entry.data = cycle;
      entry.changed ||= changed;
      entry.objects++;
      for (const k of Object.keys(report.added)) entry.report.added[k] += report.added[k];
      for (const k of ["confirmed", "replaced", "tentative", "same"]) entry.report[k] += report[k];
      entry.report.conflicts.push(...report.conflicts);
      entry.report.skipped.push(...report.skipped);
      if (f.syllabus) rep.syllabus.push(`${at}: syllabus is not imported yet (it needs a mapping to app/content/syllabus; ask Claude)`);
    }
  }

  for (const [id, e] of cycles) {
    const r = e.report;
    const a = r.added;
    rep.cycles.push(`${id}${e.isNew ? " (new)" : e.fillOnly ? " (hand-curated: gaps filled only)" : ""}: +${a.dates} dates, +${a.facts} facts, +${a.notices} notices, +${a.tables} tables, +${a.pattern} pattern; ${r.tentative} tentative, ${r.confirmed} confirmed, ${r.replaced} replaced, ${r.same} already there${e.changed ? "" : " (no change)"}`);
    rep.conflicts.push(...r.conflicts);
    rep.skipped.push(...r.skipped);
    if (e.isNew) rep.notListed.push(id);
    if (e.changed) rep.written++;
    if (!dry && e.changed) {
      await writeFile(join(cyclesDir, `${id}.json`), json(e.data));
      if (e.isNew) {
        const res = registerInIndex(indexText, id);
        indexText = res.text;
      }
    }
  }
  if (!dry) {
    if (rep.newExams.length) await writeFile(join(content, "exams.json"), json(examsFile));
    if (rep.notListed.length) await writeFile(join(cyclesDir, "index.ts"), indexText);
  }
  return rep;
}

function print(rep, dry) {
  const list = (title, xs) => xs.length && console.log(`\n${title} (${xs.length}):\n${xs.map((x) => `  - ${x}`).join("\n")}`);
  console.log(`${dry ? "DRY RUN: " : ""}${rep.files} files, ${rep.objects} cycle objects read; ${rep.written} cycles ${dry ? "would be " : ""}written, ${rep.newExams.length} new exams.`);
  list("New exams added to exams.json", rep.newExams);
  list("Cycles", rep.cycles);
  list("Conflicts (the existing verified value was kept, or see the line)", rep.conflicts);
  list("Refused", rep.refused);
  list("Bad objects, skipped (fix the JSON in arena and save it again)", rep.bad);
  list("Left out of the cycle (no value in the file)", rep.skipped);
  list("Not imported", rep.syllabus);
  if (rep.notListed.length) console.log(`\nNew cycles have their own page and are in the sitemap. They are not on the home page or the exam list until they are added to LISTED in app/content/exams.ts.`);
  if (!rep.files) console.log("The inbox is empty. Save arena's JSON as data/inbox/cycles/<cycle-id>-<item>.json first.");
  else if (rep.written && !dry) console.log("\nNext: npx tsc --noEmit, npx eslint app, npm test, then look at the git diff.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const dry = process.argv.includes("--dry");
  const rep = await run({ inbox: arg("--inbox"), content: arg("--content"), catalog: arg("--catalog"), dry });
  print(rep, dry);
  if (rep.bad.length || rep.refused.length) process.exitCode = 1;
}
