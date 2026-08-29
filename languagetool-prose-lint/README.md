# languagetool-prose-lint

A deterministic prose gate: run the **local** LanguageTool CLI over
every tracked markdown file in a repository, after stripping the
markdown down to actual prose, and fail the build on any finding.

## What it is

Three files:

- `prose-lint.ts` — the gate. Discovers tracked `.md` files via
  `git ls-files`, strips each to prose, concatenates everything into
  one corpus (so the JVM starts once, not per file), runs
  `languagetool --json`, maps findings back to `file:line`, filters
  them through a versioned config, and exits non-zero on anything left.
- `prose-strip.ts` — markdown → prose while **preserving the line
  grid**: fenced code blocks (with CommonMark-correct open/close
  semantics, including ≤3-space indentation and longer-run closers),
  inline code spans, bare identifiers (camelCase / dotted /
  digit-bearing), URLs, and table rows are neutralized; every finding
  still points at the real line.
- `prose-strip.test.ts` — regression tests for the fence edge cases
  (a ``` inside a ```` block, tilde/backtick mismatch, 4-space-indented
  delimiters), because the stripper is exactly the kind of code that
  silently eats half a corpus when it is wrong.

Config lives in `.prose-lint.json` at the repo root
(`prose-lint.example.json` here is a calibrated starting point).

## The goal

Documentation in an engineering repo is not decoration — design
records, measurement notes, and READMEs carry factual weight, and
prose errors in them (typos, inconsistent spellings, grammar slips)
erode trust in everything around them. Prose review by humans is
unreliable at scale; this makes the checkable part of prose quality a
build gate, with the same discipline as any linter:

- **Local and offline** — no LanguageTool HTTP API, so nothing leaves
  the machine, no rate limits, and results are deterministic for a
  pinned LT version.
- **The LT version is pinned in config and enforced at startup.** An
  upgrade changes what is flagged, so it is treated as an instrument
  change: bump the pin deliberately and review the finding delta.
- **Spelling stays on.** Unknown technical terms go into a curated
  `allowedWords` allowlist that is reviewed like lint suppressions —
  never a blanket disable, so a real typo in ordinary prose still
  fails the build.
- **Every disabled rule carries a written justification** in the
  config, so the calibration itself is reviewable.

## Potential benefit

One-time calibration cost (an hour or two on an existing corpus),
then every PR gets prose checking for free. Consistency errors that
reviewers rarely catch — en-US vs en-GB drift, a term spelled three
ways, untagged code fences — stop accumulating.

## Real problems caught at adoption

Calibrated on a benchmark-measurement repo (~55 markdown files) where
an external review had just flagged prose issues; the gate then found
more that the review had missed:

- en-US/en-GB inconsistencies that had survived review: "defence in
  depth", "analogue" (×3), "grey" in an otherwise en-US corpus.
- "signed into the personal account" → "signed in to" (a real
  grammar distinction for sign-in flows).
- A docker `.Id` field written in prose without code formatting —
  invisible as jargon, flagged as a spelling error, fixed to a code
  span (which is also the honest markup).
- "afterwards" in en-US prose; "markdown" for the proper noun
  Markdown; a missing determiner before a country name.
- After the companion markdownlint gate auto-fixed structure, this
  gate caught the residue markdownlint cannot see.

## Honest limitations

- The stripper's neutral placeholders make grammar findings
  *immediately adjacent to* inline code unreliable; those are skipped
  by design (documented in the code).
- It checks language, not facts. In the same adoption week, the most
  serious documentation error in the repo — a factual claim
  contradicted by the artifacts it described — was caught by human
  review, not by this tool. Prose linting narrows what humans must
  read for; it does not replace reading.
- LanguageTool needs Java and a ~300 MB install
  (`brew install languagetool`); each machine running the gate pays
  that once.

## Adoption

```jsonc
// package.json
"scripts": {
  "prose-lint": "tsx path/to/prose-lint.ts"
}
```

Wire `prose-lint` into whatever pre-PR/CI gate the repo already has.
Calibrate: run once, fix the real findings, justify every rule you
disable, allowlist the technical vocabulary, commit the config.
