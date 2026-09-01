# agent-red-test-verification

A four-step agent lifecycle whose centerpiece is an inverted assertion: the
gate **fails if the supposedly-red test passes**, so nobody — human or agent —
can claim test-driven development with a vacuously green test.

## What it is

Four tiny Node scripts plus `lib/agent-lifecycle.mjs`, designed to live in a
repository's `scripts/` directory alongside its deterministic guardrails
(`check-*.mjs` files, which `runGuardrails()` discovers and runs in sorted
order — finding zero of them is a failure, not a pass):

- **`agent-preflight.mjs`** — run before any work starts. Runs every
  guardrail, proving the baseline is green so a later red test cannot be
  confused with pre-existing breakage.
- **`agent-verify-red.mjs`** — the inverted gate. Requires a stable acceptance
  criterion ID matching `AC-[A-Z0-9]+-\d+` that is **declared as a heading in
  `docs/acceptance/*.md`** (an invented criterion like `AC-UNDEFINED-999` is
  rejected before anything runs), plus one explicit test command after `--`,
  then runs that command expecting **failure**:

  ```sh
  node scripts/agent-verify-red.mjs --criterion AC-SEARCH-001 -- pnpm vitest run search.test.ts
  ```

  If the command exits zero, the gate exits 1 with "RED evidence command
  passed; it did not prove the selected unmet criterion." A command killed by
  a signal is rejected too — a crash is not valid RED evidence.
- **`agent-verify-changed.mjs`** — the cheap inner loop after implementing:
  guardrails, then the project's test and typecheck commands (`pnpm test` and
  `pnpm run typecheck` here — adapt these two lines to your repository).
- **`agent-handoff.mjs`** — guardrails, `git diff --check` (whitespace errors
  and conflict markers), and `git status --short`, then a reminder to complete
  the criterion → test → implementation → doc traceability table.

`agent-verify-red.test.mjs` exercises every exit path against fixture copies:

```sh
node --test agent-verify-red.test.mjs
```

## The goal

"Write a failing test first" is a procedural rule, and procedural rules are
exactly what agents (and tired humans) shortcut: a test that asserts the
current behavior, a test that never runs, a test green for the wrong reason.
Prose guidance cannot prevent this; an exit code can. `runExpectedFailure`
turns the claim "this criterion is unmet" into machine-checked evidence, tied
to a named acceptance criterion so the red run is attributable, not vibes.

The surrounding lifecycle makes the evidence trustworthy: preflight proves
red-means-red (a dirty baseline could make anything fail), and every step
re-runs the guardrail bundle so quality checks are continuous rather than a
single pre-merge event.

This entry pairs with
[`acceptance-traceability-check`](../acceptance-traceability-check/) (a
natural first `check-*.mjs` guardrail — criterion IDs share the same grammar)
and [`claude-pretooluse-gate-guard`](../claude-pretooluse-gate-guard/): one
verifies the agent's evidence, the other constrains the agent's commands.

## Potential benefit

- Fabricated or vacuous TDD becomes mechanically impossible to hand off.
- Every red test is tied to a stable criterion ID, so the issue or PR can
  record provable RED evidence.
- Guardrails run at every lifecycle step for the cost of one command.
- A wrong invocation (malformed criterion, missing command) exits 2, distinct
  from a real gate failure's exit 1.

## Real problems caught

In `css-property-type-validator`, these four scripts are the executable
enforcement of the repository's agent guidance: `AGENTS.md` states the
acceptance-first workflow in prose, and the lifecycle makes it non-negotiable.
The guardrail bundle it runs includes acceptance traceability, architectural
boundary checks, and generated-file freshness, so an agent cannot even begin
work from an inconsistent tree.

## Honest limitations

A red test proves the criterion is unmet, not that the test is *good*: it can
fail for an irrelevant reason (typo, missing import) and still be accepted as
evidence. Read the failure output, not just the exit code. Guardrail discovery
trusts every `check-*.mjs` beside the scripts; a broken guardrail blocks the
whole lifecycle (by design). And `agent-verify-changed.mjs` is only as strong
as the project commands you put in it.
