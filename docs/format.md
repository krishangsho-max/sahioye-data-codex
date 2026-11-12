# File format

Synced from sahioye docs/data-pipeline.md. In the data repositories the folder is `cycles/`, not `data/inbox/cycles/`.

## Arena cycle file (format version 1)

A separate Haiku session runs arena.ai in the browser pane with the prompts in [arena-prompts.md](arena-prompts.md) ([arena-runner.md](arena-runner.md)) and saves the JSON as `data/inbox/cycles/<cycle-id>-<item>.json` (`<item>`: `syllabus`, `admit-card`, `answer-key`, `result`, `cut-off`, `notices`; the full cycle is `<cycle-id>.json`). `node scripts/import-cycles.mjs` (`--dry` to preview) turns it into `app/content/exams.json`, `app/content/cycles/<id>.json` and a line in `cycles/index.ts`. The rules are in the header of the script. A file holds one cycle object, or an array of them.

**Boards.** The exam id starts with its board: `ssc-` or `rrb-` (`body` in `exams.json`). Official hosts per board: SSC is `ssc.gov.in` and `nic.in`; RRB is `rrbcdg.gov.in`, `rrbapply.gov.in`, `indianrailways.gov.in`, any regional `rrb*.gov.in` host and `nic.in`. The host is matched (not the start of the URL) and the URL must be http(s).

**Exam lists.** Prompt (a) output goes to `data/inbox/catalog/<board>-exams.json`: `{ "version": 1, "checked_on", "board": "SSC" | "RRB", "exams": [{ "exam_id", "name_en", "name_hi", "short_en", "short_hi", "level", "cycles": [{ "cycle_id", "year", "name_en", "name_hi", "notice_url", "notice_date", "status" }] }] }`. The importer adds each exam to `exams.json` and each cycle as an empty cycle; a `notice_url` on an official host and a `notice_date` also become one notice. An exam with no cycle is not added. Hand-curated cycles are not touched.

**One-item files.** A file for one item (syllabus, admit card, answer key, result, cut-off, notices) holds `version`, `"exam": null`, the `cycle` block and only the blocks that item needs: `documents` (the source files, with `dates` of kind `admit-card`, `city-slip`, `answer-key`, `objection-end`, `final-answer-key`, `result`, `marks`, `document-verification`), `notices`, `tables` (cut-offs: id `cut-offs`), or `syllabus`. It is merged into the cycle and never removes anything. If the file also describes a new exam (an `exam` block), it is read first, whatever the file name.

It reuses the two inbox formats that already exist, and adds nothing for the same thing:

- `documents` is the facts format of `data/inbox/facts/` (`import-facts.mjs`): one object per official PDF, with `pdf_title`, `pdf_date`, `dates`, `vacancies`, `age`, `fee`, `qualification_en`, `stages`. It differs in four ways:
  - `cycle` is optional (the top-level `cycle` says it);
  - `pdf_url` is the full URL (the facts importer takes it from a manifest);
  - `pdf_title_hi` is optional;
  - a date may carry `kind` and `tier`, which win over the glossary guess from `label_en`.
- `notices` is the notices format of `data/inbox/notices/` (`import-notices.mjs`): `date`, `type`, `title_en`, `title_hi`, `url`, without `exam` and `year`.
- `extra_facts`, `tables` and `pattern` hold what those two cannot (pay, post-wise vacancies, cut-offs, exam pattern). Each names its source with `source_url`, which must also be listed once under `documents` or `notices`. That is how every fact carries its source.

| Block | Maps to | Notes |
| --- | --- | --- |
| `exam` | `Exam` in `exams.json` | `null` when the exam is already on the site. A known exam is never changed. `body` is the board of the id (`ssc` or `rrb`). |
| `cycle` | top of `Cycle` | `id`, `exam`, `year`, `name_en`, `name_hi`, optional `lead_en` + `lead_hi`. `year` is the year in SSC's own exam name (see data-model.md, "Year naming"). |
| `documents[]` | `sources`, `dates`, `facts` | one `Source` per PDF (id `P1`, `P2`...). Dates become `dates` (kind and Hindi label from the glossary). The other fields become the facts `vacancies`, `age`, `age-relaxation`, `fee`, `fee-exempt`, `qualification`, `stages`, the same ids and labels as `import-facts.mjs`. A date without `start` is a planned step and is left out. |
| `notices[]` | `notices` + an official `Source` (id `A1`...) | `type` is one of `notice`, `admit-card`, `answer-key`, `result`, `cut-off`, `marks`. The URL must be on the board's official hosts (above). |
| `extra_facts[]` | `facts` | `id`, `kind`, `label_en`, `label_hi`, `value_en`, optional `value_hi`, `num`, `group`, `source_url`. |
| `tables[]` | `tables` | `id`, `title_*`, `head_en` + `head_hi` (same length), `rows` (text or numbers), optional `note_en` + `note_hi`, `source_url`. Cut-off tables go here. |
| `pattern[]` | `pattern` | `title_*`, `rows` (`section_*`, `questions`, `marks`, optional `minutes`), optional `minutes`, `notes_en` + `notes_hi`, `source_url`. The source must be official for the board because a pattern table has no `verified` flag. |
| `syllabus` | not imported yet | `null`, or arena's syllabus (prompt (c)); the importer only lists it. It goes to `app/content/syllabus/` in a separate step. |

Rules the importer applies, with no guessing:

1. **Validation.** An object with any problem (wrong `version`, unknown key, bad date, a `source_url` that is not listed, a non-official notice URL...) is listed with every problem and skipped. The others still import.
2. **Verified.** A record is `verified: true` only when its source is on an official host of the cycle's board (see "Boards"; the host is checked, not the start of the URL). Everything else is `verified: false` and shows its source site. `null` means "not in the source"; the importer leaves the record out.
3. **Merge**, per record id (data-model.md, "How data flows in"):
   - A verified value is never overwritten; a different new value is listed as a conflict.
   - A tentative value only fills a gap, or is confirmed when the same value comes with an official source.
   - Two disagreeing tentative values: the one from the newer source date wins.
4. **Protected files.** The hand-curated 2026 cycles (CGL, CHSL, CPO, GD, JE, Steno, MTS, JHT, Delhi Police, Selection Post 14) are only filled when they exist: new records are added, nothing that is there is changed, confirmed or replaced (a different value is listed as a conflict). A cycle that has no file yet is new and goes through.
5. **Safe to run again.** Records that are already there change nothing.

A short synthetic example (made-up exam and URLs):

```json
{
  "version": 1,
  "exam": {
    "id": "ssc-demo",
    "name_en": "SSC Demo Exam",
    "name_hi": "SSC डेमो परीक्षा",
    "short_en": "Demo",
    "short_hi": "डेमो",
    "level": "graduate"
  },
  "cycle": {
    "id": "ssc-demo-2099",
    "exam": "ssc-demo",
    "year": 2099,
    "name_en": "SSC Demo Exam 2099",
    "name_hi": "SSC डेमो परीक्षा 2099"
  },
  "documents": [
    {
      "pdf_url": "https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_demo_2099.pdf",
      "pdf_title": "Demo Examination, 2099",
      "pdf_date": "2099-01-10",
      "dates": [
        { "label_en": "Dates for submission of online applications", "start": "2099-01-10", "end": "2099-02-09", "page": 1 },
        { "label_en": "Computer Based Examination", "start": "2099-05-04", "end": null, "kind": "exam", "tier": "tier-1", "page": 1 }
      ],
      "vacancies": { "total": 1200, "page": 2 },
      "age": { "min": 18, "max": 27, "as_on": "2099-08-01", "relaxation_note_en": "SC/ST: 5 years, OBC: 3 years", "page": 3 },
      "fee": { "general": 100, "exempt": "Women, SC, ST and ex-servicemen", "page": 4 },
      "qualification_en": "Bachelor's degree from a recognised university.",
      "qualification_page": 3,
      "stages": [{ "name_en": "Tier-I", "page": 5 }, { "name_en": "Tier-II", "page": 5 }]
    }
  ],
  "notices": [
    {
      "date": "2099-01-10",
      "type": "notice",
      "title_en": "Demo Examination notice",
      "title_hi": "डेमो परीक्षा सूचना",
      "url": "https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_demo_2099.pdf"
    }
  ],
  "extra_facts": [
    {
      "id": "pay-level",
      "kind": "pay",
      "label_en": "Pay level",
      "label_hi": "वेतन स्तर",
      "value_en": "Level-6 (Rs.35400-112400)",
      "source_url": "https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_demo_2099.pdf"
    }
  ],
  "tables": [],
  "pattern": [
    {
      "title_en": "Tier-I",
      "title_hi": "टियर-I",
      "rows": [{ "section_en": "General Awareness", "section_hi": "सामान्य जागरूकता", "questions": 25, "marks": 50 }],
      "minutes": 60,
      "notes_en": ["Negative marking: 0.50 per wrong answer"],
      "notes_hi": ["गलत उत्तर पर 0.50 अंक कटेंगे"],
      "source_url": "https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_demo_2099.pdf"
    }
  ],
  "syllabus": null
}
```
