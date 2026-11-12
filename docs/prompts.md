# Arena prompts (copy and paste)

A separate Haiku session started by the owner runs arena.ai in the browser pane with these prompts ([arena-runner.md](arena-runner.md)). The main Claude session only imports the saved files. Claude's part is the format ([data-pipeline.md](data-pipeline.md), "Arena cycle file"), these prompts, and the import. The owner can also paste a prompt by hand.

## How to use

1. Pick the template. Replace the words in `<ANGLE BRACKETS>` (the board values below, the ids, the names). Do nothing else to it.
2. Paste it into an arena.ai chat (Agent Mode, with web search). Wait until it is done.
3. Save the one JSON code block as the file named under the template:
   - one-item templates (c) to (h): `data/inbox/cycles/<cycle-id>-<item>.json`, for example `<cycle-id>-syllabus.json`, `-admit-card.json`, `-answer-key.json`, `-result.json`, `-cut-off.json`, `-notices.json`. Any name ending in `.json` is read; the file name only keeps runs apart.
   - (b) full cycle: `data/inbox/cycles/<cycle-id>.json`.
   - (a) exam list: `data/inbox/catalog/<board>-exams.json` (lowercase board, for example `rrb-exams.json`). The importer reads these and adds the exams and their cycles.
4. `node scripts/import-cycles.mjs --dry`, then without `--dry`, then `npx tsc --noEmit`, `npx eslint app`, `npm test`. The owner approves the diff before any commit. Push and deploy are separate go-aheads.

## Boards

Fill `<BOARD>`, `<BOARD NAME>` and `<OFFICIAL DOMAINS>` from this table. The importer uses the same host lists (`BOARDS` in `scripts/import-cycles.mjs`); a fact from any other host is stored as tentative, and a notice or pattern from another host is rejected.

| `<BOARD>` | `<BOARD NAME>` | `<OFFICIAL DOMAINS>` | id prefix |
| --- | --- | --- | --- |
| SSC | the Staff Selection Commission (SSC) | ssc.gov.in and nic.in | `ssc-` |
| RRB | the Railway Recruitment Boards (RRB) | rrbcdg.gov.in, rrbapply.gov.in, indianrailways.gov.in, the regional RRB sites (rrb*.gov.in) and nic.in | `rrb-` |

Ids you fill in:

- **Exam id:** the id prefix plus a short name, lowercase. On the site now (SSC): `ssc-cgl`, `ssc-chsl`, `ssc-cpo`, `ssc-gd`, `ssc-je`, `ssc-steno`, `ssc-selection-post`, `ssc-mts`, `ssc-jht`, `ssc-delhi-police`. RRB exam ids come from arena's exam list (a); never type one from memory.
- **Cycle id:** exam id, a dash and the year in the board's own exam name, for example `ssc-cgl-2025`. "Constable (GD) Examination, 2026" is `ssc-gd-2026` even if it was notified in 2025. Phases and posts add a suffix (`ssc-selection-post-13`, `ssc-delhi-police-hc-min-2025`).
- The hand-curated 2026 SSC cycles (CGL, CHSL, CPO, GD, JE, Steno, MTS, JHT, Delhi Police, Selection Post 14) are only filled by the importer: new records are added, nothing that is there is changed (conflicts are listed). The one-item templates are the right way to complete them.

What every prompt makes arena do: use only the official domains; give a source URL for every fact; `null` instead of a guess; cross-verify against the official PDFs before finishing; end with ONE json block and nothing after it. If a value is missing, that is correct: ask again later, never fill it in by hand.

## (a) List every exam of a board and its cycles

Output goes to `data/inbox/catalog/<board>-exams.json`. The importer adds each listed exam to `exams.json` and each cycle as an empty cycle (with its notification as a notice when the URL is official). Later runs fill the cycles.

````text
You are collecting a catalogue of the examinations of <BOARD NAME>, India. Use only <OFFICIAL DOMAINS>. Do not use any other website.

Task: list EVERY examination <BOARD> has advertised or held. Do not stop at the well-known ones. For each, list its current and past cycles (every year / phase you can find, newest first).

Rules:
1. Every cycle needs the URL of its notification PDF or notice page on the official domains, the URL you really opened. If you cannot find one, use null for notice_url and notice_date. Never guess a URL.
2. Dates are YYYY-MM-DD (India time). Use null when unknown.
3. Exam id: "<id prefix>" plus a short lowercase name. Cycle id: exam id + "-" + the year in the board's own exam name, for example "<id prefix>name-2025". For phases and post-wise exams add the phase or post to the cycle id.
4. level is one of: "10th", "12th", "graduate", "diploma", "mixed".
5. status is one of: "upcoming", "form-open", "form-closed", "exam-over", "result", "unknown".
6. name_hi / short_hi: the Hindi name as the board writes it; if there is none, write the English name again. Do not invent translations.
7. Do not estimate. Use null for what you cannot find.
8. Before you answer, cross-verify every notice_url and date against the official files again, and fix or null what does not match.

Answer with ONE fenced ```json code block and nothing else (no text before or after), in exactly this format:

```json
{
  "version": 1,
  "checked_on": "YYYY-MM-DD",
  "board": "<BOARD>",
  "exams": [
    {
      "exam_id": "<id prefix>name",
      "name_en": "",
      "name_hi": "",
      "short_en": "",
      "short_hi": "",
      "level": "graduate",
      "cycles": [
        {
          "cycle_id": "<id prefix>name-2025",
          "year": 2025,
          "name_en": "",
          "name_hi": "",
          "notice_url": "https://<official domain>/...",
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

Fill `<BOARD>`, `<BOARD NAME>`, `<OFFICIAL DOMAINS>`, `<EXAM NAME>`, `<YEAR>`, `<EXAM ID>`, `<CYCLE ID>` and the exam line. Output goes to `data/inbox/cycles/<cycle-id>.json`.

````text
You are collecting facts about ONE examination of <BOARD NAME>, India: <EXAM NAME>, <YEAR> (exam id <EXAM ID>, cycle id <CYCLE ID>). Use only files and pages on <OFFICIAL DOMAINS>. Do not use any other website, news site, coaching site or aggregator.

Exam status on our site: <WRITE ONE: "ALREADY THERE: set \"exam\" to null"  OR  "NEW: fill in the \"exam\" block">.

Find: the notification PDF, and every later notice of this cycle that changes or adds a date (schedule, corrigendum, admit card, exam city slip, answer key, result, marks, cut-off, document verification). Open each file and read the values from it.

Rules:
1. Every PDF you use goes into "documents" with the URL you really opened (pdf_url, on the official domains), its title and its date. Every other block that needs a source points to one of those URLs (source_url).
2. If you cannot find a value in an official file, use null (or leave the entry out). NEVER estimate, round, convert, or fill in from memory or from another site. A tentative figure stays in the vacancies note, not in "total".
3. Dates: YYYY-MM-DD, India time. A step with no date yet has start null. A single day has end null.
4. For each date give "kind" from this list: notification, apply-start, apply-end, fee-end, correction, city-slip, admit-card, exam, answer-key, objection-end, result, final-answer-key, marks, document-verification, other. Use "tier" (for example "tier-1", "tier-2", "paper-1", "paper-2", "pet", "cbt-1") when the date belongs to one stage. Keep label_en as the board words it.
5. "page" is the PDF page number the value is on (null if unknown).
6. fee.general is the amount in rupees as a whole number. age.min / age.max are whole numbers, age.as_on is the date the age is counted on. vacancies.total is the total number the board states for the whole examination (null if none).
7. Copy qualification_en, relaxation_note_en and fee.exempt as the board words them, short. Do not rewrite.
8. "notices" lists the official files of this cycle in date order. type is one of: notice, admit-card, answer-key, result, cut-off, marks. Give title_en and title_hi (the board's Hindi title if the notice has one, else a plain Hindi translation). The url must be on the official domains.
9. "extra_facts": pay level and anything else a student needs that the fields above cannot hold (kind "pay" or "other"; use kind "vacancies" for post-wise numbers). "tables": the post-wise or category-wise vacancy table when the board prints one. "pattern": the exam pattern per stage (sections, questions, marks, minutes, negative marking) when the notification states it. Each of these needs a source_url that is also listed under "documents".
10. Do not include any candidate data, roll numbers, names or response-sheet links.
11. Leave "syllabus" as null. Leave empty lists as [].
12. Before you answer, cross-verify every value against the official PDFs again, and fix or null what does not match.

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
      "pdf_url": "https://<official domain>/...",
      "pdf_title": "title as on the PDF",
      "pdf_date": "YYYY-MM-DD",
      "dates": [
        { "label_en": "as the board words it", "start": "YYYY-MM-DD", "end": null, "kind": "apply-start", "tier": null, "page": 1 }
      ],
      "vacancies": { "total": null, "vacancy_note_en": "short note or null", "page": 1 },
      "age": { "min": null, "max": null, "as_on": null, "relaxation_note_en": null, "page": 1 },
      "fee": { "general": null, "exempt": null, "page": 1 },
      "qualification_en": null,
      "qualification_page": null,
      "stages": [{ "name_en": "Stage 1", "page": 1 }]
    }
  ],
  "notices": [
    { "date": "YYYY-MM-DD", "type": "notice", "title_en": "", "title_hi": "", "url": "https://<official domain>/..." }
  ],
  "extra_facts": [
    { "id": "pay-level", "kind": "pay", "label_en": "Pay level", "label_hi": "वेतन स्तर", "value_en": "", "source_url": "https://<official domain>/..." }
  ],
  "tables": [
    {
      "id": "vacancies",
      "title_en": "", "title_hi": "",
      "head_en": ["Post", "Vacancies"], "head_hi": ["पद", "रिक्तियाँ"],
      "rows": [["Post name", 100]],
      "note_en": null, "note_hi": null,
      "source_url": "https://<official domain>/..."
    }
  ],
  "pattern": [
    {
      "title_en": "Stage 1", "title_hi": "चरण 1",
      "rows": [{ "section_en": "General Awareness", "section_hi": "सामान्य जागरूकता", "questions": 25, "marks": 50, "minutes": null }],
      "minutes": 60,
      "notes_en": ["Negative marking: 0.50 per wrong answer"],
      "notes_hi": ["गलत उत्तर पर 0.50 अंक कटेंगे"],
      "source_url": "https://<official domain>/..."
    }
  ],
  "syllabus": null
}
```

For the "exam" block, when the exam is NEW, replace null with:
{ "id": "<EXAM ID>", "name_en": "", "name_hi": "", "short_en": "", "short_hi": "", "level": "10th | 12th | graduate | diploma | mixed" }
````

## One-item templates (c) to (h)

Each asks for exactly ONE item of ONE cycle. The exam must already be on the site (run (a) first, then (b) or the items); the file always has `"exam": null`. Fill `<BOARD NAME>`, `<OFFICIAL DOMAINS>`, `<EXAM NAME>`, `<YEAR>`, `<EXAM ID>`, `<CYCLE ID>`. The importer merges the file into the cycle and never removes anything that is there. The `cycle` block (and `"version": 1`, `"exam": null`) is the same in all six; only the fields that the item needs are filled, the others are left out.

The shared rules (repeated in each prompt because each one is pasted alone):

- Use only <OFFICIAL DOMAINS>. Every file you use is listed once under "documents" (pdf_url you really opened, pdf_title, pdf_date). Every fact points to one of them.
- null when you cannot find a value; never estimate or use another site. No candidate data, roll numbers, names or response-sheet links.
- Cross-verify against the official PDFs before you finish. End with ONE json code block and nothing after it.

### (c) Syllabus

File: `data/inbox/cycles/<cycle-id>-syllabus.json`. Use the newest cycle of the exam. The importer lists the syllabus but does not import it yet (it goes to `app/content/syllabus/` in a separate step by the main session).

````text
You are collecting ONE item, the SYLLABUS, of ONE examination of <BOARD NAME>, India: <EXAM NAME>, <YEAR> (exam id <EXAM ID>, cycle id <CYCLE ID>). Use only files and pages on <OFFICIAL DOMAINS>. Do not use any other website, coaching site or aggregator.

Task: give the syllabus exactly as the notification (or the board's syllabus page) states it: stages, subjects, topics.

Rules:
1. List the file you used once under "documents" (pdf_url you really opened, pdf_title, pdf_date). The syllabus block points to it with source_url.
2. Do not add a topic the board does not list. Use null for what you cannot find. Never use a coaching site or memory.
3. No candidate data. Nothing about dates, vacancies, fees or results here.
4. Before you answer, cross-verify every topic against the official file again, and fix or remove what does not match.

Answer with ONE fenced ```json code block and nothing else (no text before or after), in exactly this format:

```json
{
  "version": 1,
  "exam": null,
  "cycle": { "id": "<CYCLE ID>", "exam": "<EXAM ID>", "year": <YEAR>, "name_en": "<EXAM NAME> <YEAR>", "name_hi": "<the Hindi name, or the English name again>" },
  "documents": [
    { "pdf_url": "https://<official domain>/...", "pdf_title": "title as on the PDF", "pdf_date": "YYYY-MM-DD" }
  ],
  "syllabus": {
    "source_url": "https://<official domain>/...",
    "tiers": [
      {
        "title_en": "Stage 1",
        "title_hi": "चरण 1",
        "subjects": [{ "name_en": "General Awareness", "name_hi": "सामान्य जागरूकता", "topics_en": ["History", "Geography"] }]
      }
    ]
  }
}
```
````

### (d) Admit card

File: `data/inbox/cycles/<cycle-id>-admit-card.json`.

````text
You are collecting ONE item, the ADMIT CARD and EXAM CITY notices and their dates, of ONE examination of <BOARD NAME>, India: <EXAM NAME>, <YEAR> (exam id <EXAM ID>, cycle id <CYCLE ID>). Use only files and pages on <OFFICIAL DOMAINS>. Do not use any other website.

Task: find every official notice about the exam city slip and the admit card of this cycle (release date, how to download, date changes), and the dates they state.

Rules:
1. Each notice goes under "notices" with the URL you really opened and the date printed on it (YYYY-MM-DD, India time). type is "admit-card" for admit card notices and "notice" for the exam city slip. title_en is the board's title, short; title_hi is the board's Hindi title if there is one, else a plain Hindi translation.
2. Under "documents" list each of these files (pdf_url, pdf_title, pdf_date) and, in "dates", the dates it states: kind "admit-card" (admit card available), "city-slip" (exam city details), "exam" (exam date, with "tier" for one stage). label_en as the board words it. Dates are YYYY-MM-DD; start null when unknown.
3. Use null for anything the files do not state. Never guess a URL or a date. If the admit card is not out yet, "notices" and "documents" stay [].
4. No candidate data, roll numbers, names or login links with personal data.
5. Before you answer, cross-verify every URL and date against the official files again, and fix or remove what does not match.

Answer with ONE fenced ```json code block and nothing else (no text before or after), in exactly this format:

```json
{
  "version": 1,
  "exam": null,
  "cycle": { "id": "<CYCLE ID>", "exam": "<EXAM ID>", "year": <YEAR>, "name_en": "<EXAM NAME> <YEAR>", "name_hi": "<the Hindi name, or the English name again>" },
  "documents": [
    {
      "pdf_url": "https://<official domain>/...",
      "pdf_title": "title as on the file",
      "pdf_date": "YYYY-MM-DD",
      "dates": [{ "label_en": "as the notice words it", "start": "YYYY-MM-DD", "end": null, "kind": "admit-card", "tier": null, "page": 1 }]
    }
  ],
  "notices": [
    { "date": "YYYY-MM-DD", "type": "admit-card", "title_en": "", "title_hi": "", "url": "https://<official domain>/..." }
  ]
}
```
````

### (e) Answer key

File: `data/inbox/cycles/<cycle-id>-answer-key.json`.

````text
You are collecting ONE item, the ANSWER KEY notices and their dates, of ONE examination of <BOARD NAME>, India: <EXAM NAME>, <YEAR> (exam id <EXAM ID>, cycle id <CYCLE ID>). Use only files and pages on <OFFICIAL DOMAINS>. Do not use any other website.

Task: find every official notice about the provisional and final answer key of this cycle (release, objection window, final key), and the dates they state.

Rules:
1. Each notice goes under "notices" with type "answer-key", the URL you really opened and the date printed on it (YYYY-MM-DD, India time). title_en is the board's title, short; title_hi is the board's Hindi title if there is one, else a plain Hindi translation.
2. Under "documents" list each of these files (pdf_url, pdf_title, pdf_date) and, in "dates", the dates it states: kind "answer-key" (provisional key out), "objection-end" (last day to object), "final-answer-key". label_en as the board words it. start null when unknown.
3. Use null for anything the files do not state. Never guess a URL or a date. If no answer key is out yet, "notices" and "documents" stay [].
4. No candidate data, response-sheet links, roll numbers or names.
5. Before you answer, cross-verify every URL and date against the official files again, and fix or remove what does not match.

Answer with ONE fenced ```json code block and nothing else (no text before or after), in exactly this format:

```json
{
  "version": 1,
  "exam": null,
  "cycle": { "id": "<CYCLE ID>", "exam": "<EXAM ID>", "year": <YEAR>, "name_en": "<EXAM NAME> <YEAR>", "name_hi": "<the Hindi name, or the English name again>" },
  "documents": [
    {
      "pdf_url": "https://<official domain>/...",
      "pdf_title": "title as on the file",
      "pdf_date": "YYYY-MM-DD",
      "dates": [{ "label_en": "as the notice words it", "start": "YYYY-MM-DD", "end": null, "kind": "answer-key", "tier": null, "page": 1 }]
    }
  ],
  "notices": [
    { "date": "YYYY-MM-DD", "type": "answer-key", "title_en": "", "title_hi": "", "url": "https://<official domain>/..." }
  ]
}
```
````

### (f) Result

File: `data/inbox/cycles/<cycle-id>-result.json`.

````text
You are collecting ONE item, the RESULT notices and their dates, of ONE examination of <BOARD NAME>, India: <EXAM NAME>, <YEAR> (exam id <EXAM ID>, cycle id <CYCLE ID>). Use only files and pages on <OFFICIAL DOMAINS>. Do not use any other website.

Task: find every official result notice of this cycle (each stage's result, marks, document verification), and the dates they state.

Rules:
1. Each notice goes under "notices" with the URL you really opened and the date printed on it (YYYY-MM-DD, India time). type is "result" for results and "marks" for marks notices. title_en is the board's title, short; title_hi is the board's Hindi title if there is one, else a plain Hindi translation.
2. Under "documents" list each of these files (pdf_url, pdf_title, pdf_date) and, in "dates", the dates it states: kind "result", "marks" or "document-verification" ("tier" for one stage). label_en as the board words it. start null when unknown.
3. Use null for anything the files do not state. Never guess a URL or a date. If no result is out yet, "notices" and "documents" stay [].
4. No candidate data: no roll numbers, names or lists of selected candidates.
5. Before you answer, cross-verify every URL and date against the official files again, and fix or remove what does not match.

Answer with ONE fenced ```json code block and nothing else (no text before or after), in exactly this format:

```json
{
  "version": 1,
  "exam": null,
  "cycle": { "id": "<CYCLE ID>", "exam": "<EXAM ID>", "year": <YEAR>, "name_en": "<EXAM NAME> <YEAR>", "name_hi": "<the Hindi name, or the English name again>" },
  "documents": [
    {
      "pdf_url": "https://<official domain>/...",
      "pdf_title": "title as on the file",
      "pdf_date": "YYYY-MM-DD",
      "dates": [{ "label_en": "as the notice words it", "start": "YYYY-MM-DD", "end": null, "kind": "result", "tier": null, "page": 1 }]
    }
  ],
  "notices": [
    { "date": "YYYY-MM-DD", "type": "result", "title_en": "", "title_hi": "", "url": "https://<official domain>/..." }
  ]
}
```
````

### (g) Cut-off

File: `data/inbox/cycles/<cycle-id>-cut-off.json`. The table id is `cut-offs` (the exam page looks for it); use `cut-offs-<stage>` for more tables.

````text
You are collecting ONE item, the CUT-OFF marks, of ONE examination of <BOARD NAME>, India: <EXAM NAME>, <YEAR> (exam id <EXAM ID>, cycle id <CYCLE ID>). Use only files and pages on <OFFICIAL DOMAINS>. Do not use any other website, coaching site or aggregator.

Task: give the cut-off marks the board published for this cycle, per stage and category.

Rules:
1. Each file you use is listed once under "documents" (pdf_url you really opened, pdf_title, pdf_date) and as a notice of type "cut-off" under "notices" (date printed on it, title_en, title_hi: the board's Hindi title if there is one, else a plain Hindi translation).
2. One "tables" entry per stage / category set. Its id is "cut-offs" (for a second table "cut-offs-<stage>", lowercase, dashes). head_en / head_hi are the column names; each row is a list with one cell per column. Marks are numbers exactly as the board prints them. source_url is the file's URL.
3. If the board published no cut-off for this cycle, "tables" and "notices" stay []. NEVER estimate, round, average, or take a cut-off from a coaching site, news site or memory.
4. No candidate data, roll numbers or names.
5. Before you answer, cross-verify every number against the official file again, and fix or remove what does not match.

Answer with ONE fenced ```json code block and nothing else (no text before or after), in exactly this format:

```json
{
  "version": 1,
  "exam": null,
  "cycle": { "id": "<CYCLE ID>", "exam": "<EXAM ID>", "year": <YEAR>, "name_en": "<EXAM NAME> <YEAR>", "name_hi": "<the Hindi name, or the English name again>" },
  "documents": [
    { "pdf_url": "https://<official domain>/...", "pdf_title": "title as on the file", "pdf_date": "YYYY-MM-DD" }
  ],
  "notices": [
    { "date": "YYYY-MM-DD", "type": "cut-off", "title_en": "", "title_hi": "", "url": "https://<official domain>/..." }
  ],
  "tables": [
    {
      "id": "cut-offs",
      "title_en": "Stage 1 cut-off marks", "title_hi": "चरण 1 कट-ऑफ अंक",
      "head_en": ["Category", "Cut-off marks"], "head_hi": ["श्रेणी", "कट-ऑफ अंक"],
      "rows": [["UR", 155.5]],
      "note_en": null, "note_hi": null,
      "source_url": "https://<official domain>/..."
    }
  ]
}
```
````

### (h) Notices

File: `data/inbox/cycles/<cycle-id>-notices.json`.

````text
You are collecting ONE item, the official NOTICES, of ONE examination of <BOARD NAME>, India: <EXAM NAME>, <YEAR> (exam id <EXAM ID>, cycle id <CYCLE ID>). Use only the board's notice pages and other pages on <OFFICIAL DOMAINS>. Do not use any other website.

Task: list EVERY notice the board published for this cycle, oldest first: notification, corrigenda, schedule and date changes, exam city and admit card notices, answer keys, results, cut-offs, marks, anything else on the notice board for this cycle.

Rules:
1. Each notice needs the URL of the PDF or page you really opened (on the official domains) and the date printed on it (YYYY-MM-DD, India time). If a notice has no URL you can open, leave it out. NEVER guess a URL or a date.
2. type is one of: notice, admit-card, answer-key, result, cut-off, marks. Use "notice" when unsure.
3. title_en is the board's title, short. title_hi is the board's Hindi title if there is one, else a plain Hindi translation.
4. In "documents", list ONLY the notices that set or change a date of this cycle. For those, fill "dates" with the dates the notice states (label_en as the board words it; "kind" from: notification, apply-start, apply-end, fee-end, correction, city-slip, admit-card, exam, answer-key, objection-end, result, final-answer-key, marks, document-verification, other; "tier" for one stage). Use null for anything the notice does not state. Do not fill vacancies, age, fee, qualification or stages here.
5. No candidate data, roll numbers, names or response-sheet links.
6. Before you answer, cross-verify every URL and date against the official files again, and fix or remove what does not match.

Answer with ONE fenced ```json code block and nothing else (no text before or after), in exactly this format:

```json
{
  "version": 1,
  "exam": null,
  "cycle": { "id": "<CYCLE ID>", "exam": "<EXAM ID>", "year": <YEAR>, "name_en": "<EXAM NAME> <YEAR>", "name_hi": "<the Hindi name, or the English name again>" },
  "documents": [
    {
      "pdf_url": "https://<official domain>/...",
      "pdf_title": "title as on the file",
      "pdf_date": "YYYY-MM-DD",
      "dates": [{ "label_en": "as the notice words it", "start": "YYYY-MM-DD", "end": null, "kind": "exam", "tier": null, "page": 1 }]
    }
  ],
  "notices": [
    { "date": "YYYY-MM-DD", "type": "notice", "title_en": "", "title_hi": "", "url": "https://<official domain>/..." }
  ]
}
```
````
