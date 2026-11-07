# Rules for the data agent (Codex)

This repository collects SSC exam data for sahioye.com. Only Codex writes here. Read this whole file before every task and follow it exactly.

## What you do

One task = one cycle (or one exam for prompt (d)) = one JSON file = one branch.

1. Read the task. It names the prompt ((b), (c) or (d) in `docs/prompts.md`), the cycle, the file name and the branch.
2. Follow that prompt as your instructions. Read only official SSC pages and PDFs.
3. Write the answer as a file in `cycles/` (not as a chat answer). Where the prompt says `data/inbox/cycles/`, use `cycles/` in this repository.
4. Run the checks (below) and fix every problem they print.
5. Commit on the branch, push the branch, and open a pull request into `main` if you can. If you cannot open pull requests, pushing the branch is enough: the Data check opens it when it is green.

## Rules

- **Scope.** Add or change only `cycles/<file>.json`. Never touch `checks/`, `ref/`, `docs/`, `.github/`, `AGENTS.md` or `README.md`. Never delete a file.
- **File.** One cycle object per file, named `<cycle-id>.json` or `<cycle-id>-<part>.json` (for example `ssc-cgl-2025-notices.json`). Prompt (d) is the one exception: a JSON array of cycles of one exam in `<exam-id>-cutoffs.json`. Under 300 KB.
- **Format.** `docs/format.md` ("Arena cycle file, format version 1"). Nothing else.
- **Sources.** Every value comes from an `ssc.gov.in` or `nic.in` page or PDF, and that URL is in the file. No other website, no memory, no guessing. Unknown means `null`.
- **Hand-curated cycles.** Never write the 2026 cycles of CGL, CHSL, CPO, GD, JE, Steno, MTS, JHT, Delhi Police or Selection Post 14. The importer refuses them.
- **Privacy.** Never write candidate names, roll numbers or response-sheet links.
- **Git.** Branch `data/<file name without .json>`, made from the latest `main`. One commit, message `Data: <file name without .json>` (for example `Data: ssc-cgl-2025-notices`). Never push to `main`, never merge, never force-push, never delete a branch, never change repository settings.
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
