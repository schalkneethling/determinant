/**
 * Prose lint gate: run the LOCAL LanguageTool CLI over every tracked
 * markdown file in a repository, after stripping markdown to prose,
 * and fail (exit 1) on any finding.
 *
 * Portable version of the tool built for WebDev Bench (ADR-0012 there).
 * Differences from that copy: the repo root comes from
 * `git rev-parse --show-toplevel` and the config is read at runtime, so
 * this file works from any folder of any repo. If your project pins the
 * folder layout, a static `import config from ".../.prose-lint.json"
 * with { type: "json" }` gets you a typechecked config for free.
 *
 * Design notes:
 * - LanguageTool runs fully locally (no HTTP API): offline,
 *   deterministic for a pinned LT version, nothing leaves the machine.
 *   The pinned version lives in the config and is enforced at startup —
 *   an LT upgrade changes what is flagged, so treat it like any other
 *   instrument upgrade: deliberate, with the finding delta reviewed.
 * - Markdown is stripped to prose first (see prose-strip.ts): code
 *   fences, inline code, identifiers, URLs, and table rows are
 *   neutralized with the line grid preserved, so findings map back to
 *   real file:line positions.
 * - All files are concatenated and LT runs ONCE — JVM startup dominates
 *   per-file runs (50 files ≈ one 20s run instead of minutes).
 * - Spelling stays ENABLED. Unknown technical terms go into the
 *   config's allowedWords (a curated allowlist reviewed like any lint
 *   suppression) — never a blanket disable of the spelling rule, so a
 *   real typo in ordinary prose still fails the gate.
 *
 * Requires: `languagetool` on PATH (macOS: `brew install languagetool`),
 * Node 18+, tsx (or compile it). Config: .prose-lint.json at repo root:
 *   {
 *     "language": "en-US",
 *     "languagetoolVersion": "6.8",
 *     "disabledRules": ["WHITESPACE_RULE", "..."],
 *     "disabledCategories": ["STYLE", "..."],
 *     "disabledRulePrefixes": ["EN_DIACRITICS_REPLACE"],
 *     "allowedWords": ["combobox", "lockfile", "..."]
 *   }
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripToProse } from "./prose-strip.js";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/** Paths (relative to the repo root) that are not this repo's prose:
 * generated files, vendored material, third-party text. Adjust per repo. */
const EXCLUDE: RegExp[] = [/^node_modules\//];

type ProseLintConfig = {
  language: string;
  /** Required LanguageTool version, prefix-matched against `languagetool --version` (e.g. "6.8" accepts 6.8.x). */
  languagetoolVersion: string;
  disabledRules: string[];
  disabledCategories?: string[];
  disabledRulePrefixes?: string[];
  allowedWords: string[];
};

const config = JSON.parse(
  readFileSync(join(repoRoot, ".prose-lint.json"), "utf8"),
) as ProseLintConfig;
const disabledCategories = new Set(config.disabledCategories ?? []);
const allowed = new Set(config.allowedWords.map((w) => w.toLowerCase()));

const version = spawnSync("languagetool", ["--version"], { encoding: "utf8" });
if (version.error !== undefined || version.status !== 0) {
  console.error(
    "prose-lint: `languagetool` not found on PATH. Install it (macOS: `brew install languagetool`) — this is a gate.",
  );
  process.exit(2);
}
const versionLine = version.stdout.trim().split("\n")[0] ?? "";
console.log(`prose-lint: ${versionLine}`);
const installed = /LanguageTool version (\S+)/.exec(versionLine)?.[1] ?? "";
const required = config.languagetoolVersion;
if (installed !== required && !installed.startsWith(`${required}.`)) {
  console.error(
    `prose-lint: LanguageTool ${installed || "(unparsable version)"} found, but .prose-lint.json pins ${required}. ` +
      "An LT change is an instrument change: install the pinned version, or upgrade deliberately by bumping languagetoolVersion and reviewing the finding delta.",
  );
  process.exit(2);
}

const files = execFileSync("git", ["ls-files", "*.md"], {
  cwd: repoRoot,
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => f.length > 0)
  .filter((f) => !EXCLUDE.some((re) => re.test(f)));

// Concatenate with one marker line per file so LT runs once; map
// concatenated line numbers back to files afterwards.
const MARKER = "zzfilebreakzz";
const chunks: string[] = [];
const fileOfLine: { file: string; startLine: number }[] = [];
let lineCursor = 1;
for (const f of files) {
  fileOfLine.push({ file: f, startLine: lineCursor });
  const stripped = stripToProse(readFileSync(join(repoRoot, f), "utf8"));
  chunks.push(stripped, MARKER);
  lineCursor += stripped.split("\n").length + 1;
}

// Node 24+: replace mkdtemp/rm with `await using tmp = await
// mkdtempDisposable(...)` for runtime-guaranteed cleanup.
const tmp = await mkdtemp(join(tmpdir(), "prose-lint-"));
const corpus = join(tmp, "corpus.txt");
writeFileSync(corpus, chunks.join("\n"));

const args = [
  "--language",
  config.language,
  "--json",
  ...(config.disabledRules.length > 0
    ? ["--disable", config.disabledRules.join(",")]
    : []),
  corpus,
];
const lt = spawnSync("languagetool", args, {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
await rm(tmp, { recursive: true, force: true });
if (lt.status !== 0 && lt.stdout.trim().length === 0) {
  console.error(lt.stderr);
  console.error(`prose-lint: languagetool exited ${lt.status}`);
  process.exit(2);
}

// LT prints progress lines before the JSON; the object starts at '{'.
const jsonStart = lt.stdout.indexOf("{");
const report = JSON.parse(lt.stdout.slice(jsonStart)) as {
  matches: {
    message: string;
    rule: { id: string; category: { id: string } };
    offset: number;
    length: number;
  }[];
};

const corpusText = chunks.join("\n");
function lineOfOffset(offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < corpusText.length; i++) {
    if (corpusText[i] === "\n") line++;
  }
  return line;
}

let findings = 0;
for (const m of report.matches) {
  const flagged = corpusText.slice(m.offset, m.offset + m.length);
  if (flagged.toLowerCase() === MARKER) continue;
  if (disabledCategories.has(m.rule.category.id)) continue;
  if (
    (config.disabledRulePrefixes ?? []).some((p) => m.rule.id.startsWith(p))
  ) {
    continue;
  }
  // Matches touching a stripping placeholder are artifacts of
  // preprocessing, not prose: the placeholder has the wrong article
  // sound, repeats, and part of speech. (Cost: genuine grammar issues
  // immediately around the literal words "code"/"item" are not caught.)
  const context = corpusText.slice(
    Math.max(0, m.offset - 6),
    m.offset + m.length + 6,
  );
  if (/\b(?:code|item)\b/.test(context)) continue;
  if (
    m.rule.id.startsWith("MORFOLOGIK_") &&
    allowed.has(flagged.toLowerCase())
  ) {
    continue;
  }
  const line = lineOfOffset(m.offset);
  let loc = { file: "?", startLine: 1 };
  for (const e of fileOfLine) {
    if (e.startLine <= line) loc = e;
    else break;
  }
  findings++;
  console.log(
    `${loc.file}:${line - loc.startLine + 1} [${m.rule.id}] ${m.message} — "${flagged}"`,
  );
}

if (findings > 0) {
  console.error(
    `\nprose-lint FAILED: ${findings} finding(s). Fix the prose, add a word to allowedWords, or disable a rule in .prose-lint.json with justification.`,
  );
  process.exit(1);
}
console.log(`prose-lint passed: ${files.length} files, 0 findings.`);
