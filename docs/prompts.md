# Arena prompts (copy and paste by hand)

The owner runs arena.ai by hand. Claude never starts an arena run and never uses the `arena-agent` skill by itself. Claude's part is the format ([data-pipeline.md](data-pipeline.md), "Arena cycle file"), these prompts, and the import.

## How to use

1. Pick the prompt below. Replace the words in `<ANGLE BRACKETS>`. Do nothing else to it.
2. Paste it into a new arena.ai chat (Agent Mode, with web search). Wait until it is done.
3. Copy the one JSON code block. Save it as a file:
   - prompts (b), (c), (d): `data/inbox/cycles/<cycle-id>.json`. If you save two files for the same cycle (for example the full data and the notices), use `<cycle-id>-notices.json` for the second. Any file name ending in `.json` is read.
   - prompt (a): `data/inbox/catalog/ssc-exams.json`. The importer does not read this one. It is the list of what exists, so you know which cycles to ask for next.
4. Tell Claude: "run the importer". Claude runs `node scripts/import-cycles.mjs --dry`, shows the short report, then runs it for real, then `tsc`, `eslint` and `npm test`. You approve the diff before any commit. Push and deploy are separate go-aheads.

Ids you fill in:

- **Exam id:** `ssc-` plus a short name, lowercase. On the site now: `ssc-cgl`, `ssc-chsl`, `ssc-cpo`, `ssc-gd`, `ssc-je`, `ssc-steno`, `ssc-selection-post`, `ssc-mts`, `ssc-jht`, `ssc-delhi-police`. A new exam gets a new id of the same kind (for example `ssc-si-capf`).
- **Cycle id:** exam id, a dash and the year in SSC's own exam name, for example `ssc-cgl-2025`. "Constable (GD) Examination, 2026" is `ssc-gd-2026` even if it was notified in 2025. Selection Post and Delhi Police use a phase or a post suffix (`ssc-selection-post-13`, `ssc-delhi-police-hc-min-2025`).
- The hand-curated 2026 cycles (CGL, CHSL, CPO, GD, JE, Steno, MTS, JHT, Delhi Police, Selection Post 14) are refused by the importer. Do not run (b) for them.

What every prompt makes arena do: one JSON block only; every fact from an `ssc.gov.in` or `nic.in` file whose URL is in the JSON; `null` instead of a guess; nothing from other sites. If a value is missing in the answer, that is correct: ask again later, do not fill it in by hand.

## (a) List every SSC exam and its cycles

Output goes to `data/inbox/catalog/ssc-exams.json`.

````text
You are collecting a catalogue of the examinations of the Staff Selection Commission (SSC), India. Use only the SSC's own website (ssc.gov.in) and other nic.in pages. Do not use any other website.

Task: list EVERY examination SSC has advertised or held (CGL, CHSL, MTS, GD Constable, CPO / Sub-Inspector, JE, Stenographer, Junior Hindi Translator / CHT, Selection Post phases, Delhi Police, and every other one you find; do not stop at the ones named here). For each, list its current and past cycles (every year / phase you can find on ssc.gov.in, newest first).

Rules:
1. Every cycle needs the URL of its notification PDF or notice-board page on ssc.gov.in or nic.in, the URL you really opened. If you cannot find one, use null for notice_url and notice_date. Never guess a URL.
2. Dates are YYYY-MM-DD (India time). Use null when unknown.
3. Exam id: "ssc-" plus a short lowercase name (ssc-cgl, ssc-chsl, ssc-cpo, ssc-gd, ssc-je, ssc-steno, ssc-selection-post, ssc-mts, ssc-jht, ssc-delhi-police are taken; reuse them). Cycle id: exam id + "-" + the year in SSC's own exam name, for example ssc-cgl-2025. For phases and post-wise exams add the phase or post: ssc-selection-post-13, ssc-delhi-police-hc-min-2025.
4. level is one of: "10th", "12th", "graduate", "diploma", "mixed".
5. status is one of: "upcoming", "form-open", "form-closed", "exam-over", "result", "unknown".
6. name_hi / short_hi: the Hindi name as SSC writes it; if SSC has no Hindi name, write the English name again. Do not invent translations.
7. Do not estimate. Leave out what you cannot find (null).

Answer with ONE fenced ```json code block and nothing else (no text before or after), in exactly this format:

```json
{
  "version": 1,
  "checked_on": "YYYY-MM-DD",
  "exams": [
    {
      "exam_id": "ssc-cgl",
      "name_en": "SSC CGL",
      "name_hi": "SSC CGL",
      "short_en": "CGL",
      "short_hi": "CGL",
      "level": "graduate",
      "cycles": [
        {
          "cycle_id": "ssc-cgl-2025",
          "year": 2025,
          "name_en": "SSC CGL 2025",
          "name_hi": "SSC CGL 2025",
          "notice_url": "https://ssc.gov.in/...",
          "notice_date": "YYYY-MM-DD",
          "status": "result"
        }
      ]
    }
  ]
}
```
````

## (b) Full data for one cycle

Fill in `<EXAM NAME>`, `<YEAR>`, `<EXAM ID>`, `<CYCLE ID>` and the exam line. Output goes to `data/inbox/cycles/<cycle-id>.json`.

````text
You are collecting facts about ONE examination of the Staff Selection Commission (SSC), India: <EXAM NAME>, <YEAR> (exam id <EXAM ID>, cycle id <CYCLE ID>). Use only files and pages on ssc.gov.in or nic.in. Do not use any other website, news site, coaching site or aggregator.

Exam status on our site: <WRITE ONE: "ALREADY THERE: set \"exam\" to null"  OR  "NEW: fill in the \"exam\" block">.

Find: the notification PDF, and every later notice of this cycle that changes or adds a date (schedule, corrigendum, admit card, exam city slip, answer key, result, marks, cut-off, document verification). Open each file and read the values from it.

Rules:
1. Every PDF you use goes into "documents" with the URL you really opened (pdf_url, on ssc.gov.in or nic.in), its title and its date. Every other block that needs a source points to one of those URLs (source_url).
2. If you cannot find a value in an SSC file, use null (or leave the entry out). NEVER estimate, round, convert, or fill in from memory or from another site. A tentative figure stays in the vacancies note, not in "total".
3. Dates: YYYY-MM-DD, India time. A step with no date yet has start null. A single day has end null.
4. For each date give "kind" from this list: notification, apply-start, apply-end, fee-end, correction, city-slip, admit-card, exam, answer-key, objection-end, result, final-answer-key, marks, document-verification, other. Use "tier" (for example "tier-1", "tier-2", "paper-1", "paper-2", "pet") when the date belongs to one stage. Keep label_en as SSC words it.
5. "page" is the PDF page number the value is on (null if unknown).
6. fee.general is the amount in rupees as a whole number. age.min / age.max are whole numbers, age.as_on is the date the age is counted on. vacancies.total is the total number SSC states for the whole examination (null if SSC states none).
7. Copy qualification_en, relaxation_note_en and fee.exempt as SSC words them, short. Do not rewrite.
8. "notices" lists the official files of this cycle in date order. type is one of: notice, admit-card, answer-key, result, cut-off, marks. Give title_en and title_hi (use SSC's Hindi title if the notice has one, else a plain Hindi translation). The url must be on ssc.gov.in or nic.in.
9. "extra_facts": pay level and anything else a student needs that the fields above cannot hold (kind "pay" or "other"; use kind "vacancies" for post-wise numbers). "tables": the post-wise or category-wise vacancy table when SSC prints one. "pattern": the exam pattern per tier or paper (sections, questions, marks, minutes, negative marking) when the notification states it. Each of these needs a source_url that is also listed under "documents".
10. Do not include any candidate data, roll numbers, names or response-sheet links.
11. Leave "syllabus" as null. Leave empty lists as [].

Answer with ONE fenced ```json code block and nothing else (no text before or after). Do not shorten with "..." and do not add comments. The format:

```json
{
  "version": 1,
  "exam": null,
  "cycle": {
    "id": "<CYCLE ID>",
    "exam": "<EXAM ID>",
    "year": <YEAR>,
    "name_en": "<EXAM NAME> <YEAR>",
    "name_hi": "<the Hindi name, or the English name again>"
  },
  "documents": [
    {
      "pdf_url": "https://ssc.gov.in/...",
      "pdf_title": "title as on the PDF",
      "pdf_date": "YYYY-MM-DD",
      "dates": [
        { "label_en": "as SSC words it", "start": "YYYY-MM-DD", "end": null, "kind": "apply-start", "tier": null, "page": 1 }
      ],
      "vacancies": { "total": null, "vacancy_note_en": "short note or null", "page": 1 },
      "age": { "min": null, "max": null, "as_on": null, "relaxation_note_en": null, "page": 1 },
      "fee": { "general": null, "exempt": null, "page": 1 },
      "qualification_en": null,
      "qualification_page": null,
      "stages": [{ "name_en": "Tier-I", "page": 1 }]
    }
  ],
  "notices": [
    { "date": "YYYY-MM-DD", "type": "notice", "title_en": "", "title_hi": "", "url": "https://ssc.gov.in/..." }
  ],
  "extra_facts": [
    { "id": "pay-level", "kind": "pay", "label_en": "Pay level", "label_hi": "वेतन स्तर", "value_en": "", "source_url": "https://ssc.gov.in/..." }
  ],
  "tables": [
    {
      "id": "vacancies",
      "title_en": "", "title_hi": "",
      "head_en": ["Post", "Vacancies"], "head_hi": ["पद", "रिक्तियाँ"],
      "rows": [["Post name", 100]],
      "note_en": null, "note_hi": null,
      "source_url": "https://ssc.gov.in/..."
    }
  ],
  "pattern": [
    {
      "title_en": "Tier-I", "title_hi": "टियर-I",
      "rows": [{ "section_en": "General Awareness", "section_hi": "सामान्य जागरूकता", "questions": 25, "marks": 50, "minutes": null }],
      "minutes": 60,
      "notes_en": ["Negative marking: 0.50 per wrong answer"],
      "notes_hi": ["गलत उत्तर पर 0.50 अंक कटेंगे"],
      "source_url": "https://ssc.gov.in/..."
    }
  ],
  "syllabus": null
}
```

For the "exam" block, when the exam is NEW, replace null with:
{ "id": "<EXAM ID>", "name_en": "", "name_hi": "", "short_en": "", "short_hi": "", "level": "10th | 12th | graduate | diploma | mixed" }
````

## (c) Notices for one cycle

Fill in `<EXAM NAME>`, `<YEAR>`, `<EXAM ID>`, `<CYCLE ID>`. Output goes to `data/inbox/cycles/<cycle-id>-notices.json`. The file has the same format as (b); only `cycle` and `notices` (and `documents` for the dates that the notices set) are filled.

````text
You are collecting the official notices of ONE examination of the Staff Selection Commission (SSC), India: <EXAM NAME>, <YEAR> (exam id <EXAM ID>, cycle id <CYCLE ID>). Use only the SSC notice board and other pages on ssc.gov.in or nic.in. Do not use any other website.

Task: list EVERY notice SSC published for this cycle, oldest first: notification, corrigenda, schedule and date changes, exam city and admit card notices, answer keys, results, cut-offs, marks, document verification, anything else on the notice board for this cycle.

Rules:
1. Each notice needs the URL of the PDF or page you really opened (on ssc.gov.in or nic.in) and the date printed on it (YYYY-MM-DD, India time). If a notice has no URL you can open, leave it out. NEVER guess a URL or a date.
2. type is one of: notice, admit-card, answer-key, result, cut-off, marks. Use "notice" when unsure.
3. title_en is SSC's title, short. title_hi is SSC's Hindi title if the notice has one, else a plain Hindi translation.
4. In "documents", list ONLY the notices that set or change a date of this cycle. For those, fill "dates" with the dates the notice states (label_en as SSC words it, "kind" from: notification, apply-start, apply-end, fee-end, correction, city-slip, admit-card, exam, answer-key, objection-end, result, final-answer-key, marks, document-verification, other; "tier" for one stage, for example "tier-1"). Use null for anything the notice does not state. Do not fill vacancies, age, fee, qualification or stages here (use null).
5. Do not include any candidate data, roll numbers, names or response-sheet links.

Answer with ONE fenced ```json code block and nothing else (no text before or after), in exactly this format:

```json
{
  "version": 1,
  "exam": null,
  "cycle": {
    "id": "<CYCLE ID>",
    "exam": "<EXAM ID>",
    "year": <YEAR>,
    "name_en": "<EXAM NAME> <YEAR>",
    "name_hi": "<the Hindi name, or the English name again>"
  },
  "documents": [
    {
      "pdf_url": "https://ssc.gov.in/...",
      "pdf_title": "title as on the PDF",
      "pdf_date": "YYYY-MM-DD",
      "dates": [
        { "label_en": "as the notice words it", "start": "YYYY-MM-DD", "end": null, "kind": "exam", "tier": null, "page": 1 }
      ]
    }
  ],
  "notices": [
    { "date": "YYYY-MM-DD", "type": "notice", "title_en": "", "title_hi": "", "url": "https://ssc.gov.in/..." }
  ],
  "syllabus": null
}
```
````

## (d) Cut-offs, syllabus and pattern for one exam

Fill in `<EXAM NAME>` and `<EXAM ID>`. Output goes to `data/inbox/cycles/<exam-id>-cutoffs.json`. The file is a JSON array with one object per cycle. The syllabus is listed by the importer but not imported yet (Claude does that in a separate step).

````text
You are collecting cut-off marks, the exam pattern and the syllabus of ONE examination of the Staff Selection Commission (SSC), India: <EXAM NAME> (exam id <EXAM ID>). Use only files and pages on ssc.gov.in or nic.in. Do not use any other website, coaching site or aggregator.

Task: for each year / cycle of this exam that has a published result (newest first, as far back as ssc.gov.in has the files), give the cut-off marks that SSC published. For the newest cycle also give the exam pattern and the syllabus as SSC's notification states them.

Rules:
1. Every file you use is listed once under "documents" with the URL you really opened (pdf_url, on ssc.gov.in or nic.in), its title and its date. Cut-off tables and the pattern point to it with source_url.
2. If you cannot find a value in an SSC file, use null or leave the entry out. NEVER estimate, round, average, or take a cut-off from a coaching site, news site or memory. A cycle with no published cut-off file is left out completely.
3. One "tables" entry per tier / category set. head_en / head_hi are the column names (for example Category, Cut-off marks, Normalised marks); each row is a list of text or numbers with one cell per column. Marks are numbers exactly as SSC prints them (two decimals if SSC prints two).
4. "pattern" is only for the newest cycle: sections, questions, marks, minutes per section or total, and negative marking in notes. Copy SSC's numbers.
5. "syllabus" goes only in the object of the newest cycle (null in the others): topics per subject as the notification lists them, in the format below. Do not add topics SSC does not list.
6. Cycle ids: exam id + "-" + the year in SSC's own exam name (for example ssc-cgl-2025).
7. Do not include any candidate data, roll numbers, names or response-sheet links.

Answer with ONE fenced ```json code block and nothing else (no text before or after): a JSON array with one object per cycle, each in exactly this format:

```json
[
  {
    "version": 1,
    "exam": null,
    "cycle": {
      "id": "<EXAM ID>-YYYY",
      "exam": "<EXAM ID>",
      "year": 2025,
      "name_en": "<EXAM NAME> 2025",
      "name_hi": "<the Hindi name, or the English name again>"
    },
    "documents": [
      { "pdf_url": "https://ssc.gov.in/...", "pdf_title": "title as on the PDF", "pdf_date": "YYYY-MM-DD" }
    ],
    "tables": [
      {
        "id": "cutoff-tier-1",
        "title_en": "Tier-I cut-off marks", "title_hi": "टियर-I कट-ऑफ अंक",
        "head_en": ["Category", "Cut-off marks"], "head_hi": ["श्रेणी", "कट-ऑफ अंक"],
        "rows": [["UR", 155.5]],
        "note_en": null, "note_hi": null,
        "source_url": "https://ssc.gov.in/..."
      }
    ],
    "pattern": [
      {
        "title_en": "Tier-I", "title_hi": "टियर-I",
        "rows": [{ "section_en": "General Awareness", "section_hi": "सामान्य जागरूकता", "questions": 25, "marks": 50, "minutes": null }],
        "minutes": 60,
        "notes_en": ["Negative marking: 0.50 per wrong answer"],
        "notes_hi": ["गलत उत्तर पर 0.50 अंक कटेंगे"],
        "source_url": "https://ssc.gov.in/..."
      }
    ],
    "syllabus": {
      "source_url": "https://ssc.gov.in/...",
      "tiers": [
        {
          "title_en": "Tier-I",
          "title_hi": "टियर-I",
          "subjects": [{ "name_en": "General Awareness", "name_hi": "सामान्य जागरूकता", "topics_en": ["History", "Geography"] }]
        }
      ]
    }
  }
]
```
````
