# sahioye-data-codex

SSC exam data collected by Codex for [sahioye.com](https://sahioye.com). Every value comes from an official `ssc.gov.in` or `nic.in` source, and the source URL is in the file.

- `cycles/`: the data, one JSON file per task. Agents write only here.
- `docs/format.md`: the file format. `docs/prompts.md`: the task prompts.
- `checks/`, `ref/content/`: the checks and the site's current data they compare against.
- `AGENTS.md`: the rules for the agent.

Everything except `cycles/` is synced from the sahioye repository by `node scripts/data-repos.mjs sync`. Do not edit it here.

## Task template

Replace the words in `<ANGLE BRACKETS>`. One task per run.

```text
Read AGENTS.md in this repository and follow it exactly.

Task: prompt <b | c | d> of docs/prompts.md for <CYCLE-ID> (<EXAM NAME>, <YEAR OR PHASE>).
File: cycles/<NAME>.json
Branch: data/<NAME>

Use only ssc.gov.in and nic.in. Put null for anything you cannot find there.
Run both checks in AGENTS.md and fix every problem, then commit and push the branch.
```

`<NAME>` is the cycle id, plus `-notices` for prompt (c). For prompt (d) it is `<exam-id>-cutoffs`.
