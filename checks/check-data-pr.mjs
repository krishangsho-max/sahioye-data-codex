#!/usr/bin/env node
// Guard for data pull requests made by outside agents (Codex, Antigravity...). See docs/data-agents.md.
//   node scripts/check-data-pr.mjs                  compare HEAD with origin/main
//   node scripts/check-data-pr.mjs --base <ref>     compare with another ref
//   node scripts/check-data-pr.mjs --dir cycles --strict
//                                                   in a data repo: the folder is cycles/, and every change must be data
//
// A pull request that touches data/inbox/ is a data PR. A data PR may only add or change
// data/inbox/cycles/<cycle-id>.json (or <cycle-id>-<part>.json). Each file holds ONE cycle object
// whose cycle.id matches the file name, or (prompt (d)) an array of cycles of one exam in <exam-id>-<part>.json. No deletions, no code, no other folders.
// The format itself is checked afterwards by `node scripts/import-cycles.mjs --dry` (CI runs both).
// A pull request that does not touch data/inbox/ passes at once.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

export const MAX_BYTES = 300_000;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * `changes`: [{ status, path }] from `git diff --name-status` (status A, M, D...).
 * `read(path)`: returns the file text. Returns a list of problems; empty means the PR is fine.
 * `opts.dir`: the cycle folder (default data/inbox/cycles). `opts.strict`: every change must be a
 * cycle file (data repos); otherwise a change that does not touch data/inbox/ passes at once.
 */
export function checkChanges(changes, read, opts = {}) {
  const dir = (opts.dir ?? "data/inbox/cycles").replace(/\/+$/, "");
  if (!opts.strict && !changes.some((c) => c.path.startsWith("data/inbox/"))) return [];
  const problems = [];
  for (const { status, path } of changes) {
    const rest = path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : "";
    if (!/^[^/]+\.json$/.test(rest)) {
      problems.push(`${path}: a data PR may only change files in ${dir}/ (*.json). Put code or other changes in a separate PR.`);
      continue;
    }
    if (status.startsWith("D")) {
      problems.push(`${path}: a data PR may not delete files.`);
      continue;
    }
    let text;
    try {
      text = read(path);
    } catch (err) {
      problems.push(`${path}: cannot read the file (${err.message}).`);
      continue;
    }
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) problems.push(`${path}: the file is larger than ${MAX_BYTES / 1000} KB. Split the work into smaller chunks.`);
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      problems.push(`${path}: not valid JSON (${err.message}).`);
      continue;
    }
    const name = basename(path, ".json");
    if (Array.isArray(data)) {
      // Prompt (d): one object per cycle of one exam, in <exam-id>-<part>.json.
      const ids = data.map((o) => o?.cycle?.id);
      if (!ids.length || ids.some((id) => typeof id !== "string" || !SLUG.test(id))) {
        problems.push(`${path}: the array is empty, or an object has no lowercase cycle.id like "ssc-cgl-2025".`);
        continue;
      }
      const parts = name.split("-");
      const ok = parts.some((_, n) => {
        const prefix = parts.slice(0, n + 1).join("-");
        return n >= 1 && ids.every((id) => id === prefix || id.startsWith(`${prefix}-`));
      });
      if (!ok) problems.push(`${path}: the file name must start with the exam id that all its cycles share, like "ssc-cgl-cutoffs.json" (cycle ids: ${ids.join(", ")}).`);
      continue;
    }
    if (!data || typeof data !== "object") {
      problems.push(`${path}: the file must hold one cycle object (or, for prompt (d), an array of them).`);
      continue;
    }
    const id = data.cycle?.id;
    if (typeof id !== "string" || !SLUG.test(id)) {
      problems.push(`${path}: cycle.id is missing or not a lowercase id like "ssc-cgl-2025".`);
      continue;
    }
    if (name !== id && !(name.startsWith(`${id}-`) && SLUG.test(name.slice(id.length + 1)))) {
      problems.push(`${path}: the file name must be "${id}.json" or "${id}-<part>.json" (cycle.id is "${id}").`);
    }
  }
  return problems;
}

/** Changes since the merge base with `base`: commits, plus uncommitted and untracked files (so it also works before a commit). */
function gitChanges(base) {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const mergeBase = git("merge-base", base, "HEAD").trim();
  const changes = git("diff", "--name-status", "--no-renames", mergeBase)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split("\t");
      return { status, path };
    });
  for (const path of git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean)) changes.push({ status: "A", path });
  return changes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const base = arg("--base") ?? "origin/main";
  const dir = arg("--dir") ?? "data/inbox/cycles";
  const strict = process.argv.includes("--strict");
  const changes = gitChanges(base);
  const problems = checkChanges(changes, (p) => readFileSync(p, "utf8"), { dir, strict });
  const dataFiles = changes.filter((c) => c.path.startsWith(strict ? `${dir}/` : "data/inbox/")).length;
  if (!changes.length && strict) console.log("No changes against the base. OK.");
  else if (!dataFiles && !problems.length) console.log("Not a data PR (nothing in data/inbox/). OK.");
  else if (!problems.length) console.log(`Data PR: ${dataFiles} file(s) in ${dir}/. Layout OK.`);
  else {
    console.log(`Data PR has ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exitCode = 1;
  }
}
