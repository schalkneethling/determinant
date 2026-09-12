#!/usr/bin/env node
import { resolve } from "node:path";
import { assertWritableBranch, branchState, git } from "./lib.mjs";

try {
  const [slug, flag, destination, ...extra] = process.argv.slice(2);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? "") ||
      (flag !== undefined && (flag !== "--worktree" || !destination)) || extra.length > 0) {
    throw new Error("Usage: node protected-branch-guard/start-work.mjs <lowercase-hyphenated-slug> [--worktree <path>]");
  }
  const { root } = branchState(process.cwd());
  if (git(root, ["status", "--porcelain=v1", "--untracked-files=all"]).text) {
    throw new Error("Working tree is dirty. Preserve existing work; do not stash, reset, or commit it automatically.");
  }
  const branch = `codex/${slug}`;
  git(root, ["check-ref-format", `refs/heads/${branch}`]);
  const base = git(root, ["rev-parse", "--verify", "refs/heads/main^{commit}"]).text;
  const remote = git(root, ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"], { allowed: [0, 1] });
  if (remote.status === 0 && remote.text !== base) {
    throw new Error("Local main and cached origin/main differ. Review and synchronize main separately before starting work.");
  }
  let target = root;
  if (flag === "--worktree") {
    target = resolve(process.cwd(), destination);
    git(root, ["worktree", "add", "--no-track", "-b", branch, target, base]);
  } else {
    git(root, ["switch", "--no-track", "-c", branch, base]);
  }
  if (assertWritableBranch(target).ref !== `refs/heads/${branch}`) {
    throw new Error("Created branch does not match the requested branch; stop and inspect.");
  }
  process.stdout.write(`Ready: ${branch}\nWorking directory: ${target}\nBase: local main (${base})\nNo fetch, pull, commit, or push was performed.\n`);
} catch (error) {
  process.stderr.write(`Start work refused: ${error.message}\n`);
  process.exitCode = 1;
}
