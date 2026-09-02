---
name: start-work
description: Start a new piece of work on a named feature branch using the repository's protected-branch-guard script. Use when asked to start work or create a work branch, not for read-only discovery.
---

# Start work

Use this skill only after the user has asked to begin work or create a branch.
Confirm the intended repository. If the user supplies a slug alongside the
skill invocation, read it from their prompt and pass it unchanged as the
script's first argument. Otherwise, derive a concise lowercase hyphenated
slug from the requested work. Pass the slug as one argument, never as shell
code; let the script reject invalid values rather than silently renaming them.

Read `<repository>/protected-branch-guard/start-work.mjs` for its current CLI.
Run it from the intended repository:

```sh
node protected-branch-guard/start-work.mjs <slug>
```

For example, `$start-work fix-feed-order` means running
`node protected-branch-guard/start-work.mjs fix-feed-order`. The skill reads
the name from the prompt; arguments are not automatically forwarded to the
script. The script then parses and validates its command-line arguments.

Use `--worktree <path>` when the user asks for a separate checkout. Report its
absolute path and use that directory for subsequent work; creating a worktree
does not move this task's working directory automatically.

If the script refuses because of existing changes, branch collisions, or a
stale local main, stop and explain. Do not reset, stash, bypass hooks, overwrite
an existing branch, commit, or push to make the command succeed. Fetching or
updating main is a separate, explicitly authorized operation.

Report the verified branch and directory. The script is a convenience entry
point; Git and Codex hooks independently enforce the branch policy.
