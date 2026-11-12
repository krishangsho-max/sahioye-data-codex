# Rules for the data agent (Codex)

This repository collects SSC and RRB exam data for sahioye.com. Only Codex writes here. Read this whole file before every task and follow it exactly.

## What you do

One task = one cycle (one exam for prompt (d), one board for prompt (a)) = one JSON file = one branch.

1. Read the task. It names the prompt ((a), (b), (c) or (d) in `docs/prompts.md`), the cycle, the file name and the branch.
2. Follow that prompt as your instructions. Read only the official pages and PDFs of the board (see Sources).
3. Write the answer as a file (not as a chat answer): in `cycles/`, or for prompt (a) in `catalog/`. Where the prompt says `data/inbox/cycles/` or `data/inbox/catalog/`, use `cycles/` or `catalog/` in this repository.
4. Run the checks (below) and fix every problem they print.
5. Commit on the branch, push the branch, and open a pull request into `main` if you can. If you cannot open pull requests, pushing the branch is enough: the Data check opens it when it is green.

## Rules

- **Scope.** Add or change only `cycles/<file>.json` (and, for prompt (a), `catalog/<board>-exams.json`). Never touch `checks/`, `ref/`, `docs/`, `.github/`, `AGENTS.md` or `README.md`. Never delete a file.
- **File.** One cycle object per file, named `<cycle-id>.json` or `<cycle-id>-<part>.json` (for example `ssc-cgl-2025-notices.json`). Prompt (d) is the one exception: a JSON array of cycles of one exam in `<exam-id>-cutoffs.json`. Prompt (a) is the other: one exam list object in `catalog/<board>-exams.json`, lowercase board, for example `catalog/rrb-exams.json`. Under 300 KB.
- **Format.** `docs/format.md` ("Arena cycle file, format version 1"). Nothing else.
- **Sources.** The board is the start of the id: `ssc-…` or `rrb-…`. Every value comes from a page or PDF on that board's official hosts, and that URL is in the file. SSC: `ssc.gov.in` and `nic.in`. RRB: `rrbcdg.gov.in`, `rrbapply.gov.in`, `indianrailways.gov.in`, the regional RRB sites (`rrb*.gov.in`) and `nic.in`. No other website, no memory, no guessing. Unknown means `null`.
- **Hand-curated cycles.** Never write the 2026 SSC cycles of CGL, CHSL, CPO, GD, JE, Steno, MTS, JHT, Delhi Police or Selection Post 14. The importer refuses them.
- **Privacy.** Never write candidate names, roll numbers or response-sheet links.
- **Git.** Branch `data/<file name without .json>` (for prompt (a): `data/rrb-exams`), made from the latest `main`. One commit, message `Data: <file name without .json>` (for example `Data: ssc-cgl-2025-notices`). Never push to `main`, never merge, never force-push, never delete a branch, never change repository settings.
- **Secrets.** If you were given a token to push, use it only for `git push` of your data branch, never write it into a file, a commit or a log, and forget it after the task.

## Checks (run both from the repository root, before you commit)

```bash
node checks/check-data-pr.mjs --dir cycles --strict --base origin/main
node checks/import-cycles.mjs --dry --inbox cycles --content ref/content
```

Both need only Node.js 20 or newer, no `npm install`. Both must end without errors. If Node.js is not available, push anyway: GitHub runs the same checks, and you fix the file on the same branch if they fail.

## Git commands for one task

```bash
git fetch origin && git switch -c data/<NAME> origin/main
# write cycles/<NAME>.json, run the checks
git add cycles/<NAME>.json
git commit -m "Data: <NAME>"
git push origin data/<NAME>
```
