# green-stamp-push-gate

Make "commit pushed while the quality gate was red" mechanically
impossible: the gate stamps the exact tree it validated, and a git
`pre-push` hook refuses to push any commit whose tree carries no stamp.

## What it is

Two small POSIX shell scripts:

- `stamp-green-tree.sh` — run as the final step of your quality gate
  (only on success). Hashes the working tree — tracked **and**
  untracked-unignored files, i.e. the content the gate actually
  tested — through a *temporary* git index (your real index is never
  touched) and appends the tree hash to `.git/green-tree-stamps`.
- `pre-push` — a repo-committed hook (via
  `git config core.hooksPath githooks`) that resolves each pushed tip's
  tree and refuses the push unless that exact tree hash is stamped.

Have the gate set `core.hooksPath` itself on success: then running the
gate once on a fresh clone installs the hook, and there is no separate
setup step to forget.

## The goal

A quality gate that merely *runs* is advisory: nothing binds "the gate
passed" to "this content may leave the machine." The failure mode this
closes is exit-code laundering — a commit or push chained after the
gate in one shell command, behind a pipe that eats the exit code or a
semicolon that ignores it. Stamping binds the guarantee to the **tree**,
which gives the right invariances for free:

- Amending a message, rebasing, or re-committing identical content
  keeps the stamp valid (same tree).
- Any content change invalidates it (different tree).
- No re-running the gate at push time: pushing a validated tree is
  instant; only genuinely unvalidated content pays the gate cost.
- Actor-agnostic: it binds humans, agents, and scripts equally.

## Potential benefit

The full pre-PR gate cost (minutes, if it includes browser tests) is
paid exactly once per validated tree, and a red or skipped gate can no
longer be followed by a push of that content — by anyone, chained or
not. Compare the alternatives: a `pre-commit` hook running the gate is
too slow and guards the wrong action (pushing is the outward act);
re-running the gate inside `pre-push` is deterministic but pays full
cost every push; CI-only enforcement rejects *after* the push, when
unreviewed red commits have already reached the shared remote.

## Real problems caught

Built after the same process failure happened **twice in one week** on
a benchmark-harness repo, both times by the AI agent doing the work:
a commit was pushed while the gate was red, because the commit was
chained in the same compound command as the gate — once behind
`| tail` (pipeline exit code masked), once behind semicolons (exit code
printed, then ignored). Discipline adopted after the first incident did
not survive to the second; that is the definition of a control that
needs to be mechanical. Since installation, the negative test (content
change committed without a gate run) is refused at push with zero refs
reaching the remote.

## Honest limitations

- `git push --no-verify` bypasses any pre-push hook. This is a guard
  against process failure, not against a deliberate actor — pair with
  CI if you need adversarial enforcement.
- Stamps live under `.git/` (machine-local, never committed): each
  clone must run the gate once before its first push. That is a
  feature — "this machine validated this tree" — but it surprises on
  machine number two.
- Merges made in a forge's web UI never pass through the hook.
- The stamp says the gate *ran and passed* on that tree; it says
  nothing about what the gate checks.

Companion: `../claude-pretooluse-gate-guard/` blocks the anti-pattern
command shape at the AI-agent tool layer, before a bad commit even
exists. That layer is fast feedback; this one carries the guarantee.
