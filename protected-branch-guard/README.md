# protected-branch-guard

Layered, local protection against accidentally editing or committing on
`main`, or pushing any update to remote `main`. Keep server-side branch
protection enabled: these are accident guards, not a security boundary.

## What it is

- `guard.mjs` and `lib.mjs`: one shared branch policy, with Git and Codex
  adapters. The only protected branch is exactly `refs/heads/main`.
- `git-hooks/pre-commit`: early rejection of commits on `main`.
- `git-hooks/prepare-commit-msg`: the same branch-only check, also reached
  by `git commit --no-verify`. This does not replace pre-commit quality checks.
- `git-hooks/pre-push`: rejects resolved destination `refs/heads/main`,
  including force updates, deletion, and any source branch. A tag named
  `main` is not the branch `main`.
- `hooks.codex.json`: advisory `SessionStart` and synchronous `PreToolUse`
  for `apply_patch`. No prompt hook or model call is involved.
- `start-work.mjs`: creates `codex/<slug>` from local `main`, either in the
  current checkout or a new worktree. Does not reuse/reset existing branches.
- `start-work/SKILL.md`: optional convenience entry point for that script.
- `install.mjs`: installs this scenario in a repository without replacing
  unrelated hooks or a different existing start-work skill.
- `guard.test.mjs`: integration tests using disposable repositories and local
  bare remotes. No GitHub credentials or network are needed for tests.

Requires Node.js 22+ and Git on `PATH`; the Git wrappers also require a POSIX
shell. The trial was exercised with Node 25 and Git 2.55 on macOS. Windows
and alternate Git implementations have not been qualified.

## The goal

Enforce at the operation boundary, not once per conversation. Reading on
`main` is useful; the first attempted patch should require a feature branch.
Later patches must check again because a human or another task can change
branches during the same conversation. A successful check is not cached.

Both commits and agent patches require a named, non-main branch. Detached
HEAD is refused rather than treated as a feature branch. Unborn `main` is
also protected. Push policy checks the destination, not the current branch.

## Install and trial

This collection does not activate scenarios automatically. In an adopting
repository, first create a feature branch, then copy this entire directory
to `<repository>/protected-branch-guard`. Preserve executable permissions.
Run from that repository:

```sh
node --test protected-branch-guard/guard.test.mjs
node protected-branch-guard/install.mjs
```

The installer refuses to run on `main` or detached HEAD. It sets the
repository-local `core.hooksPath` to `protected-branch-guard/git-hooks`,
merges the example into `.codex/hooks.json`, and copies the skill to
`.agents/skills/start-work/SKILL.md`. It is safe to rerun for the same version.
Review and commit those files on the installation branch.

Every clone must install its local Git hook configuration. Keep the scenario
files in every worktree where these hooks are used. Merge the installation
before using the helper to create branches from `main`; otherwise those new
branches do not yet contain the guard files or Codex configuration.

If existing Git hooks or a different `core.hooksPath` are found, the installer
stops before changing files. Integrate with the existing hook runner manually;
do not replace it. Both `pre-commit` and `prepare-commit-msg` must invoke
`guard.mjs commit`: `git commit --no-verify` bypasses `pre-commit`, but
`prepare-commit-msg` still runs. A combined
pre-push runner must preserve Git's stdin records and replay the same records
to every guard; chaining readers on one consumed stdin stream is incorrect.
This matters when combining with [the green-stamp push gate](../green-stamp-push-gate/).

In Codex, review and trust the new hook definitions using `/hooks`, then
reload/resume the intended repository's task. Trust is a user action; the
installer neither grants it nor disables the sandbox. The adapter uses the
documented `.codex/hooks.json` format, not `.cursor/hooks.json`.

For a live smoke test, use a disposable clone. On clean `main`, ask Codex to
read a file (allowed), then use `apply_patch` to edit it (must be denied,
file unchanged). Inspect the Hooks output for `PreToolUse` and the denial.
Create a feature branch with the helper, repeat the patch (allowed), then
return to clean `main` in the same task and confirm denial again. Check the
session warning on clean and dirty `main`; it must not create a branch or
alter existing work. Hook-script tests alone do not prove host discovery,
trust, or interception is enabled.

## Starting the next piece of work

```sh
node protected-branch-guard/start-work.mjs issue-123-description
```

For a separate checkout:

```sh
node protected-branch-guard/start-work.mjs issue-123-description --worktree ../issue-123
```

Use `$start-work issue-123-description` in Codex, or select the skill from
the skill picker. This is a skill-backed convenience command, not a new
built-in `/start-work` command. A new worktree does not automatically move
the existing task there; use the reported absolute directory for subsequent
work. The original checkout remains unchanged.

The helper refuses tracked or untracked changes, invalid slugs, existing
branches, a missing local `main`, or a difference between local `main` and
cached `origin/main`. It does not fetch, pull, stash, reset, commit, or push.
Cached refs do not prove remote freshness: fetch and review/synchronize the
base separately when needed. A new branch has no upstream pointing at main.

## Potential benefit

- Normal Git operations are guarded regardless of who invokes them.
- A new task is not required for every piece of work.
- Read-only prompts and shell inspection do not run the patch hook.
- Session checks warn without prematurely choosing a branch name.
- Local Node/Git checks incur process latency, not model/API calls. Successful
  patch checks emit no model context; denials and warnings stay concise.
- The installer makes hook conflicts visible instead of silently disabling
  existing quality gates.

## Problems exercised by this example

The motivating problem is the user's repeated experience of work beginning
on `main`. No production catches are claimed yet. The test suite exercises
real Git commit/push rejection, including commit bypass flags, alternate
push refspecs, main deletion, and all-or-nothing multi-ref rejection. It also
tests detached HEAD, linked worktrees, main/feature transitions, malformed
input, installation conflicts, and dirty-work preservation.

Patch tests include absolute/sibling paths, directory symlinks, new paths,
both sides of renames, whitespace-tolerant headers, and dangling symlinks.
Three regression tests initially failed during implementation: an indented
second header escaped path checking, a dangling file symlink hid a target,
and a dangling configuration symlink allowed installation outside the repo.
Those cases now fail safely. The session repository and every target's
repository must be writable; paths outside a Git worktree are refused.
Push records are parsed independently of SHA-1/SHA-256 object-ID width.
The tests also demonstrate `git push --no-verify` succeeding against a
disposable remote, making the local enforcement limit explicit.

## Honest limitations

- The Codex adapter covers `apply_patch`, not arbitrary shell commands,
  formatters, scripts, MCP writes, GitHub API mutations, or another editor.
  Parsing arbitrary shell syntax is not attempted. Never claim all writes
  on main are prevented by this adapter.
- Git hooks cover their documented entry points, not every way to create a
  commit or move a ref. Git plumbing, hook/config changes, or direct writes
  to Git metadata can bypass them. Fast-forward updates to local main are
  not blocked. Server-side branch protection remains essential.
- Codex skips untrusted/disabled hooks. Failure to launch Node, a missing
  script, a host timeout, or a host configuration error is not guaranteed to
  block a tool call. Once running, this adapter returns explicit denial for
  malformed input and Git/path errors. There is no invented `failClosed`
  setting in the Codex example.
- No local hook is tamper-proof. Do not grant trust automatically. Recheck
  integration after upgrading Codex or changing hook definitions.
- Patch extraction accepts the standard local patch markers, not lenient
  heredoc wrappers, remote environment markers, or unknown future grammar.
  Codex itself still validates and applies the patch.
- Checks and writes are separate operations. Another process can switch a
  shared checkout after a check; prefer dedicated worktrees for concurrent
  work. This is not a filesystem lock or a transactional security boundary.
- Installation performs all conflict checks first, but is not transactional
  across filesystem/Git failures. Inspect partial changes if disk or Git
  configuration writes fail. Global hooks and configs are never modified.

## Sources and verification

Checked against the official [Codex hook documentation](https://developers.openai.com/codex/hooks)
and [skill documentation](https://developers.openai.com/codex/skills) on
2026-09-02. In particular, `apply_patch` is the canonical tool name and its
patch is in `tool_input.command`; `cwd` identifies the session directory.
Hook output uses `hookSpecificOutput.permissionDecision`, not the older
lower-case event/permission format from other agent integrations.

The path markers come from the [Codex patch parser at a pinned revision](https://github.com/openai/codex/blob/5e26f7621c1c470fe62350d61c9eb4d6c772a0da/codex-rs/apply-patch/src/parser.rs)
and its [streaming parser's whitespace rules](https://github.com/openai/codex/blob/5e26f7621c1c470fe62350d61c9eb4d6c772a0da/codex-rs/apply-patch/src/streaming_parser.rs).
Git lifecycle/bypass behavior follows the [Git hooks reference](https://git-scm.com/docs/githooks).
The tests run actual Git operations and the exact configured Codex command
with documented wire payloads; live host interception remains the smoke
test above, not a claim inferred from those tests.
