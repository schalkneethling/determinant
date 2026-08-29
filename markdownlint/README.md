# markdownlint

Structural and formatting consistency for every markdown file in a
repository, enforced as a build gate via
[markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2).

## What it is

One config file (`markdownlint-cli2.example.jsonc` — copy to the repo
root as `.markdownlint-cli2.jsonc`), one devDependency, one script:

```jsonc
// package.json
"scripts": {
  "lint-md": "markdownlint-cli2"
}
```

Run `markdownlint-cli2 --fix` once at adoption to absorb the mechanical
backlog, then wire `lint-md` into the pre-PR/CI gate so drift cannot
re-accumulate.

## The goal

Markdown structure is the part of documentation quality that is fully
mechanical: fence languages, heading/list spacing, list-marker style,
table formatting, bare URLs, duplicate headings. None of it deserves
human review time, and all of it drifts the moment nobody checks.
Making it a deterministic gate removes an entire class of review
comments and keeps rendered docs consistent everywhere they are read.

Two conventions this collection treats as load-bearing:

- **The config is a record, not just switches.** Every deviation from
  the defaults carries a comment saying why, so the calibration itself
  is reviewable — the same discipline as lint suppressions in code.
- **Scope by authorship.** Lint what humans author; exclude what
  machines generate (lint the generator's inputs instead) and
  documents received from elsewhere that are preserved verbatim.

## Potential benefit

Near-zero adoption cost: `--fix` resolves most of the backlog
automatically. On the repo where this config was calibrated, the first
run found ~1,500 raw findings across 56 files; after disabling
line-length (with recorded rationale) and one auto-fix pass, ~230
mechanical fixes were applied and only 9 findings needed a human —
all of them real.

## Real problems caught at adoption

- **9 untagged code fences (MD040)** — including three that an external
  code review had independently flagged in the same week. The gate
  catches in milliseconds what the review caught in hours, and catches
  it on every future PR too.
- Inconsistent list-marker styles and heading spacing across 28 files
  written by six different authors (human and agent) — auto-fixed in
  one pass, so the corpus reads as one voice.
- Bare URLs and inconsistent table column styles that render fine in
  one viewer and badly in another.

A useful pairing: markdownlint normalizes *structure*, which makes a
prose-level gate (see `../languagetool-prose-lint/`) far less noisy —
adopt them together, markdownlint first.

## Honest limitations

Markdownlint sees markup, not meaning: it will not catch a wrong
number, a contradiction, or a misspelling. It earns its keep by being
free to run and by eliminating the noise floor so humans (and prose
tooling) can focus on content.
