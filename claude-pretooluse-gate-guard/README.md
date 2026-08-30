# claude-pretooluse-gate-guard

A Claude Code `PreToolUse` hook that denies any Bash tool call chaining
a quality-gate run with `git commit` or `git push` in the same command —
the command shape that lets a red gate be followed by a push.

## What it is

- `gate-guard.sh` — reads the hook's stdin JSON, extracts the command,
  and returns a `permissionDecision: "deny"` (with an explanatory
  reason the agent sees) when the command contains both the gate
  substring (`GATE_PATTERN`, default `pre-pr`) and `git commit` /
  `git push`. Everything else passes untouched.
- `settings-snippet.json` — the `.claude/settings.json` wiring
  (project-scoped, committed, so every collaborator's agent sessions
  get the rule).

Install: copy `gate-guard.sh` to `.claude/hooks/`, merge the snippet
into `.claude/settings.json`, adjust `GATE_PATTERN`. Requires `jq`.

## The goal

In one compound shell command, a `git commit`/`git push` cannot depend
on the gate's exit code being *read* — only on shell operators. A `;`
runs the mutation unconditionally; a `| tail` masks the pipeline
status; even `&&` silently encodes "trust the operator, not the
reading of the result." The reliable pattern is: run the gate as its
own command, read the exit code, then mutate in a separate command.
This hook makes that pattern the only one an agent can execute —
feedback arrives *before a bad commit exists*, with the working rule
stated in the denial reason so the agent self-corrects.

## Potential benefit

Zero-cost insurance for agent-driven repos: no runtime overhead beyond
a `jq` call per Bash invocation, no false friction on normal commits or
lone gate runs (pipe-tested), and the denial text teaches the
convention instead of just blocking.

## Real problems caught

Generalized from a benchmark-harness repo where an AI agent pushed
red-gate commits twice in one week — once with the gate's exit code
masked by a pipe, once with it printed and then ignored by semicolon
chaining. The guard's pipe-test corpus includes the literal command
from the second incident; it is denied, while benign commits and
gate-alone runs pass.

## Honest limitations

- **This layer is feedback, not the guarantee.** It only governs Bash
  tool calls made through Claude Code in sessions where the hook is
  loaded; a human terminal, another tool, or a session started before
  `.claude/` existed (the settings watcher only picks up directories
  present at session start — reload via `/hooks`) all bypass it. The
  deterministic layer is `../green-stamp-push-gate/`, which binds at
  `git push` for every actor.
- Substring matching: a command that merely *mentions* both strings
  (e.g. echoing documentation text) is denied — a priced-in false
  positive; rephrase or split the command.
- An agent could still split gate and commit into two commands and
  ignore the gate's result between them; the push gate is what makes
  that unprofitable.

Pair of: `../green-stamp-push-gate/` (deterministic enforcement at
push time). Adopt both — this one for fast in-session correction, that
one for the actual invariant.
