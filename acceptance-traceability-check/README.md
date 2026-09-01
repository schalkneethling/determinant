# acceptance-traceability-check

A deterministic gate that keeps acceptance-criteria documents and their
traceability tables in exact agreement — every criterion accounted for,
exactly once.

## What it is

`check-acceptance-traceability.mjs` walks `docs/acceptance/*.md` under a root
(the current directory, or `--root <dir>`) and enforces, offline and with no
dependencies:

- every `## AC-AREA-NNN` criterion heading is **globally unique** across all
  acceptance documents;
- every document has a `## Traceability` section with Criterion/scenario and
  Implementation columns;
- every criterion ID declared in a document appears **exactly once** in that
  document's traceability table — not zero times, not twice;
- finding **zero acceptance documents is a failure**, so a renamed directory
  cannot silently disable the gate.

All violations are collected and reported in a single run. The folder ships a
passing example document; try it, then break it:

```sh
node check-acceptance-traceability.mjs          # passes on the shipped example
node --test check-acceptance-traceability.test.mjs
```

It is built on [`deterministic-guardrail-utils`](../deterministic-guardrail-utils/)
(a copy lives in `lib/` so this folder stays self-contained).

## The goal

Acceptance criteria only earn their keep if every criterion provably maps to a
test and an implementation. That mapping is prose, and prose rots: criteria
get copy-pasted with stale IDs, rows are deleted while headings survive, two
documents claim the same ID. The **exactly-once** count is the load-bearing
rule — "at least once" tolerates duplicated rows drifting apart, and "at most
once" tolerates silent omission. Exactness resists copy-paste rot from both
directions, and it is checkable by pure regex over sorted files, so the gate
is fast, hermetic, and identical on every machine.

For a project developed with AI agents this gate is the enforcement half of
"every test must trace to an accepted outcome": the guidance document states
the rule; this script makes it non-negotiable.

## Potential benefit

- A criterion cannot be declared and then quietly never traced.
- A traceability row cannot outlive or duplicate its criterion.
- Criterion IDs stay unique repo-wide, so `AC-SEARCH-002` in a commit message,
  test name, or PR always resolves to exactly one meaning.
- Runs in milliseconds with no network, so it belongs in the pre-commit /
  preflight bundle, not just CI.

## Real problems caught

In `css-property-type-validator` this gate runs inside every agent lifecycle
step (preflight, red verification, changed-work verification, handoff), so an
agent cannot begin or hand off work while any acceptance document is
internally inconsistent. The `--root` flag exists because the gate itself is
tested against fixture trees — including the failure modes shown in this
folder's test file.

## Honest limitations

The gate proves structural agreement, not truth: a table can name a test that
does not exist or an implementation file that does not satisfy the criterion.
Pair it with review, or extend it to assert that referenced paths exist. The
ID grammar (`AC-[A-Z0-9]+-\d+`) and the two required columns are conventions;
adapt the regexes if your documents differ, and keep the exactly-once rule
when you do.
