#!/usr/bin/env node
import { lstatSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { assertWritableBranch, branchState, git, readStdin } from "./lib.mjs";

// Markers/whitespace verified against Codex parser.rs and streaming_parser.rs.
// This extracts touched paths, not a replacement for Codex's full patch parser.
function patchPaths(patch) {
  if (typeof patch !== "string") {
    throw new Error("Expected apply_patch tool_input.command to be a string.");
  }
  const lines = patch.trim().split(/\r?\n/);
  if (lines[0].trim() !== "*** Begin Patch" || lines.at(-1).trim() !== "*** End Patch") {
    throw new Error("Unsupported patch boundaries; use the standard apply_patch format.");
  }
  const paths = [];
  let inUpdate = false;
  for (const rawLine of lines.slice(1, -1)) {
    // Update hunks preserve leading spaces because they mark context lines.
    const line = inUpdate ? rawLine.trimEnd() : rawLine.trim();
    const match = /^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/.exec(line);
    if (match) {
      paths.push(match[2]);
      inUpdate = match[1] === "Update File" || match[1] === "Move to";
    } else if (line.startsWith("*** ") && line !== "*** End of File") {
      throw new Error("Unrecognized patch marker; cannot safely determine target paths.");
    }
  }
  if (paths.length === 0) {
    throw new Error("Patch contains no recognized target paths.");
  }
  return paths;
}

function existingPath(path) {
  try {
    return realpathSync(path);
  } catch (error) {
    if (error.code !== "ENOENT" || dirname(path) === path) {
      throw error;
    }
    try {
      lstatSync(path);
    } catch (missing) {
      if (missing.code === "ENOENT") {
        return existingPath(dirname(path));
      }
      throw missing;
    }
    // An entry exists but cannot be resolved: never treat a dangling symlink
    // as a new file in its lexical parent (it may point into protected main).
    throw new Error(`Cannot resolve existing path: ${path}`);
  }
}

function checkPatch(event) {
  if (event.hook_event_name !== "PreToolUse" || event.tool_name !== "apply_patch") {
    throw new Error("Unexpected hook event or tool; this adapter only supports apply_patch.");
  }
  if (typeof event.cwd !== "string" || !isAbsolute(event.cwd)) {
    throw new Error("Hook cwd must be an absolute path.");
  }
  // Check the session AND each target: absolute paths, sibling repositories,
  // nested repositories, symlinks, and both sides of a move need protection.
  assertWritableBranch(event.cwd);
  const checked = new Set();
  for (const path of patchPaths(event.tool_input?.command)) {
    if (path.includes("\0") || path.split(/[\\/]/).includes(".git")) {
      throw new Error("Direct writes to Git metadata are not supported by this guard.");
    }
    const absolute = resolve(event.cwd, path);
    for (const target of [existingPath(dirname(absolute)), existingPath(absolute)]) {
      // existingPath may return a file; Git must run from its parent.
      const directory = statSync(target).isDirectory() ? target : dirname(target);
      if (!checked.has(directory)) {
        assertWritableBranch(directory);
        checked.add(directory);
      }
    }
  }
}

function checkPush(input) {
  for (const line of input.trim().split("\n")) {
    if (!line) {
      continue;
    }
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4 || !/^[0-9a-f]+$/.test(fields[1]) || !/^[0-9a-f]+$/.test(fields[3])) {
      throw new Error("Malformed pre-push ref record; refusing the push.");
    }
    if (fields[2] === "refs/heads/main") {
      throw new Error("Push to main refused (including force updates and deletion). Push a feature branch and open a pull request.");
    }
  }
}

function sessionNotice(event) {
  if (event.hook_event_name !== "SessionStart" || typeof event.cwd !== "string" || !isAbsolute(event.cwd)) {
    throw new Error("Expected SessionStart with an absolute cwd.");
  }
  const state = branchState(event.cwd);
  if (state.ref !== null && state.ref !== "refs/heads/main") {
    return {};
  }
  const dirty = git(state.root, ["status", "--porcelain=v1", "--untracked-files=all"]).text !== "";
  const message = `${state.root}: ${state.ref === null ? "detached HEAD" : "main"} is read-only for discovery/review.${dirty ? " WARNING: existing changes are present; preserve them and ask how to move them." : " Use $start-work <slug> before editing."}`;
  return {
    systemMessage: message,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message },
  };
}

const mode = process.argv[2];
try {
  if (process.argv.length !== 3) {
    throw new Error("Usage: node protected-branch-guard/guard.mjs commit|pre-push|session-start|pre-tool-use|check");
  }
  if (mode === "commit" || mode === "check") {
    assertWritableBranch(process.cwd());
  } else if (mode === "pre-push") {
    checkPush(await readStdin());
  } else if (mode === "pre-tool-use") {
    checkPatch(JSON.parse(await readStdin()));
    // Empty success preserves Codex's normal approval/sandbox decision.
  } else if (mode === "session-start") {
    process.stdout.write(`${JSON.stringify(sessionNotice(JSON.parse(await readStdin())))}\n`);
  } else {
    throw new Error("Unknown branch guard mode.");
  }
} catch (error) {
  const reason = `Protected branch guard: ${error.message}`;
  if (mode === "session-start") {
    process.stdout.write(`${JSON.stringify({ systemMessage: reason })}\n`);
  } else if (mode === "pre-tool-use") {
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput: {
      hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason,
    } })}\n`);
    process.stderr.write(`${reason}\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write(`${reason}\n`);
    process.exitCode = 1;
  }
}
