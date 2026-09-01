# ast-grep-determinism-rules

Structural lint rules that turn two recurring review findings into
deterministic gates: locale-sensitive sorting and unbounded fetch-response
buffering.

## What it is

An [ast-grep](https://ast-grep.github.io/) rule set (`sgconfig.yml` +
`rules/`), a seeded fixture pair proving the rules match what they claim, and
a gate script that runs the scan through a pinned CLI version and fails on any
finding:

```sh
node check-determinism-rules.mjs <path> [path ...]
node --test check-determinism-rules.test.mjs
```

Three rules, each verified against the real ast-grep parser:

- **`no-locale-sensitive-sort`** — flags every `$A.localeCompare($$$)` call.
  `localeCompare` ordering depends on the host's locale and ICU data, so a
  comparator built on it produces different file listings, error orders, and
  derived hashes on different machines. The fix is a plain code-unit
  comparison: `(left < right ? -1 : left > right ? 1 : 0)`.
- **`no-unbounded-response-read`** — flags `.text()`, `.json()`, and
  `.arrayBuffer()` on receivers named `response`/`res`/`resp`. Checking
  `Buffer.byteLength` *after* one of these calls makes the size limit
  advisory: the whole body is already in memory. The fix streams
  `response.body` with a reader, counts bytes as chunks arrive, and cancels
  the stream the moment the limit is exceeded.
- **`no-unbounded-inline-fetch-read`** — the same defect in inline form,
  `(await fetch(...)).text()` and friends, matched structurally with no
  naming convention needed. (It is a separate rule because an ast-grep
  `constraints:` block suppresses `any:` alternatives that never bind the
  constrained metavariable — a behavior worth knowing when composing rules.)

The gate script pins the CLI (`@ast-grep/cli@0.45.3`) and invokes it via
`npx --yes --package`, so the scan itself is reproducible; zero targets is a
usage error, not a pass.

## The goal

Both defect classes were flagged by review on this very repository — in code
distilled from a project that already knew better, written by an author who
already knew better. That is the signature of a pattern-shaped problem:
knowing the rule does not prevent the mistake, because the wrong form reads
naturally and works fine on the machine where it was written. Findings a
reviewer has made more than once are precisely the ones worth compiling into
a structural rule, where they are caught in seconds, on every commit, with no
reviewer attention spent.

Grep cannot express these rules well (`localeCompare` inside a comparator, a
method call on the result of `await fetch(...)`); a full linter plugin is a
heavy way to write one pattern. ast-grep's YAML rules sit in between:
structural matching against the real syntax tree, one file per rule, testable
against fixtures like any other gate.

## Potential benefit

- Two review comments become permanent, self-enforcing project knowledge.
- The seeded fixtures make the rules themselves testable — a rule edit that
  stops matching the known violations fails the suite.
- The rule set is a template: each new recurring review finding is one more
  YAML file and two fixture lines.

## Real problems caught

The seeded violations in `fixtures/violations.mjs` are the two real findings
from this repository's own PR review: the `localeCompare` comparator that
shipped in `deterministic-guardrail-utils`, and the buffer-then-measure
`response.text()` flow that shipped in `pinned-spec-reference-check`. Both
were fixed in the same change that added these rules, and the gate now passes
over those entries — the fixture is the regression, preserved.

## Honest limitations

Structural matching is syntactic, not semantic. `no-unbounded-response-read`
relies on a receiver-naming convention (`response`/`res`/`resp`) and misses a
response bound to another name, while `no-locale-sensitive-sort` flags every
`localeCompare`, including legitimate user-facing collation — review its
findings rather than blanket-suppressing them. The pinned CLI is fetched
through `npx`, so the first run needs the network (or a warm npm cache);
vendor the binary if the gate must be fully offline.
