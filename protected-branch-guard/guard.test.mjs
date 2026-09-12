import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = dirname(fileURLToPath(import.meta.url));

function fixture(t, { install = true } = {}) {
  const temp = mkdtempSync(join(tmpdir(), "protected-branch-guard-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, "repo with spaces");
  const remote = join(temp, "remote.git");
  mkdirSync(root);
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(temp, "no-global-config"), GIT_TERMINAL_PROMPT: "0" });
  function run(command, args, { cwd = root, input, status = 0 } = {}) {
    const result = spawnSync(command, args, { cwd, env, input, encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    assert.ifError(result.error);
    if (status !== null) {
      assert.equal(result.status, status, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
    }
    return result;
  }
  const git = (args, options) => run("git", args, options);
  const script = (name, args = [], options = {}) => run(process.execPath, [join(root, "protected-branch-guard", name), ...args], options);
  git(["init", "--initial-branch=main"]);
  git(["config", "user.email", "test@example.invalid"]);
  git(["config", "user.name", "Branch Guard Test"]);
  git(["config", "commit.gpgSign", "false"]);
  cpSync(source, join(root, "protected-branch-guard"), { recursive: true });
  writeFileSync(join(root, "example.txt"), "before\n");
  git(["add", "."]);
  git(["commit", "-m", "fixture base"]);
  git(["init", "--bare", "--initial-branch=main", remote]);
  git(["remote", "add", "origin", remote]);
  git(["push", "origin", "main"]);
  git(["switch", "-c", "codex/trial"]);
  if (install) {
    script("install.mjs");
    git(["add", "."]);
    git(["commit", "-m", "install trial hooks"]);
  }
  const patch = (path = "example.txt") => `*** Begin Patch\n*** Update File: ${path}\n@@\n-before\n+after\n*** End Patch`;
  const event = (command = patch()) => ({ hook_event_name: "PreToolUse", tool_name: "apply_patch", cwd: root, tool_input: { command } });
  const guard = (payload, status = 0) => script("guard.mjs", ["pre-tool-use"], { input: JSON.stringify(payload), status });
  return { temp, root, remote, run, git, script, patch, event, guard };
}

test("real Git commits are blocked on main, including --no-verify and unborn main", (t) => {
  const f = fixture(t);
  f.git(["switch", "main"]);
  const before = f.git(["rev-parse", "HEAD"]).stdout;
  for (const options of [[], ["--no-verify"]]) {
    const result = f.git(["commit", "--allow-empty", "-m", "must not exist", ...options], { status: 1 });
    assert.match(result.stderr, /main.*read-only/);
    assert.equal(f.git(["rev-parse", "HEAD"]).stdout, before);
  }
  const unborn = join(f.temp, "unborn");
  mkdirSync(unborn);
  f.git(["init", "--initial-branch=main"], { cwd: unborn });
  f.script("guard.mjs", ["commit"], { cwd: unborn, status: 1 });
});

test("pre-push blocks destination main: fast-forward, force, force-with-lease, deletion and multi-ref", (t) => {
  const f = fixture(t);
  const before = f.git(["--git-dir", f.remote, "rev-parse", "refs/heads/main"]).stdout;
  for (const args of [
    ["HEAD:main"], ["--force", "HEAD:main"], ["--force-with-lease", "HEAD:main"],
    ["+HEAD:refs/heads/main"], ["--delete", "main"], ["HEAD:refs/heads/allowed", "HEAD:main"],
  ]) {
    const result = f.git(["push", "origin", ...args], { status: 1 });
    assert.match(result.stderr, /Push to main refused/);
    assert.equal(f.git(["--git-dir", f.remote, "rev-parse", "refs/heads/main"]).stdout, before);
  }
  f.git(["--git-dir", f.remote, "show-ref", "--verify", "refs/heads/allowed"], { status: 128 });
  f.git(["push", "origin", "HEAD:refs/heads/codex/trial"]);
  f.git(["tag", "main"]);
  f.git(["push", "origin", "refs/tags/main:refs/tags/main"]);
  f.git(["push", "origin", "--delete", "codex/trial"]);
});

test("documents the real pre-push --no-verify bypass on a disposable remote", (t) => {
  const f = fixture(t);
  f.git(["push", "--no-verify", "origin", "HEAD:main"]);
  assert.equal(f.git(["--git-dir", f.remote, "rev-parse", "main"]).stdout, f.git(["rev-parse", "HEAD"]).stdout);
});

test("pre-push handles SHA-256 records and fails closed on malformed input", (t) => {
  const f = fixture(t);
  const record = `refs/heads/topic ${"a".repeat(64)} refs/heads/main ${"0".repeat(64)}\n`;
  f.script("guard.mjs", ["pre-push"], { input: record, status: 1 });
  f.script("guard.mjs", ["pre-push"], { input: "broken record\n", status: 1 });
  f.script("guard.mjs", ["pre-push"], { input: "", status: 0 });
});

test("patch guard allows feature work, rejects main and detached HEAD, rechecks every call", (t) => {
  const f = fixture(t);
  f.guard(f.event());
  f.git(["switch", "main"]);
  const result = f.guard(f.event(), 2);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  f.git(["switch", "codex/trial"]);
  f.guard(f.event());
  f.git(["switch", "--detach"]);
  f.guard(f.event(), 2);
  f.git(["commit", "--allow-empty", "-m", "detached"], { status: 1 });
});

test("patch guard resolves absolute, sibling, symlink, add, delete and move targets", (t) => {
  const f = fixture(t);
  const mainWorktree = join(f.temp, "main checkout");
  f.git(["worktree", "add", mainWorktree, "main"]);
  f.guard(f.event(f.patch(join(mainWorktree, "example.txt"))), 2);
  f.guard(f.event(f.patch("../main checkout/example.txt")), 2);
  symlinkSync(mainWorktree, join(f.root, "linked-main"), "dir");
  f.guard(f.event(f.patch("linked-main/example.txt")), 2);
  for (const marker of ["Add File", "Delete File"]) {
    f.guard(f.event(`*** Begin Patch\n*** ${marker}: ${mainWorktree}/new/dir/file.txt\n${marker === "Add File" ? "+new\n" : ""}*** End Patch`), 2);
  }
  f.guard(f.event(`*** Begin Patch\n*** Update File: example.txt\n*** Move to: ${mainWorktree}/moved.txt\n@@\n-before\n+after\n*** End Patch`), 2);
  f.guard(f.event("*** Begin Patch\n*** Add File: new/dir/file.txt\n+new\n*** End Patch"));
  f.guard(f.event("*** Begin Patch\n*** Delete File: example.txt\n*** End Patch"));
});

test("malformed, unsupported and oversized hook input cannot authorize a patch", (t) => {
  const f = fixture(t);
  for (const event of [null, {}, { ...f.event(), cwd: "relative" }, { ...f.event(), tool_name: "Bash" }, f.event("invalid"), f.event("*** Begin Patch\n*** Environment ID: remote\n*** Add File: file\n+x\n*** End Patch"), f.event(f.patch(".git/config"))]) {
    f.guard(event, 2);
  }
  f.script("guard.mjs", ["pre-tool-use"], { input: "{", status: 2 });
  f.script("guard.mjs", ["pre-tool-use"], { input: " ".repeat(2 * 1024 * 1024 + 1), status: 2 });
});

test("parser-compatible indented headers and trailing whitespace cannot hide main targets", (t) => {
  const f = fixture(t);
  const target = join(f.temp, "main checkout");
  f.git(["worktree", "add", target, "main"]);
  f.guard(f.event(`*** Begin Patch\n*** Add File: okay.txt\n+okay\n  *** Add File: ${target}/new.txt  \n+blocked\n*** End Patch`), 2);
  f.guard(f.event(`*** Begin Patch\n*** Add File: okay.txt\n+okay\n  *** Environment ID: remote\n*** End Patch`), 2);
});

test("dangling symlinks cannot hide a new target in a main worktree", (t) => {
  const f = fixture(t);
  const target = join(f.temp, "main checkout");
  f.git(["worktree", "add", target, "main"]);
  symlinkSync(join(target, "new.txt"), join(f.root, "dangling.txt"));
  f.guard(f.event("*** Begin Patch\n*** Add File: dangling.txt\n+blocked\n*** End Patch"), 2);
});

test("installer refuses dangling symlinks instead of writing outside the repository", (t) => {
  const f = fixture(t, { install: false });
  mkdirSync(join(f.root, ".codex"));
  const outside = join(f.temp, "must-not-create.json");
  symlinkSync(outside, join(f.root, ".codex", "hooks.json"));
  f.script("install.mjs", [], { status: 1 });
  assert.equal(existsSync(outside), false);
});

test("session hook is advisory, distinguishes dirty main, and stays quiet on feature branches", (t) => {
  const f = fixture(t);
  const input = JSON.stringify({ hook_event_name: "SessionStart", cwd: f.root, source: "startup" });
  assert.deepEqual(JSON.parse(f.script("guard.mjs", ["session-start"], { input }).stdout), {});
  f.git(["switch", "main"]);
  assert.match(f.script("guard.mjs", ["session-start"], { input }).stdout, /read-only/);
  writeFileSync(join(f.root, "untracked.txt"), "preserve me");
  assert.match(f.script("guard.mjs", ["session-start"], { input }).stdout, /existing changes/);
  assert.match(f.script("guard.mjs", ["session-start"], { input: "bad json" }).stdout, /systemMessage/);
});

test("start-work uses main, not the previous feature, and never tracks main for pushes", (t) => {
  const f = fixture(t);
  const base = f.git(["rev-parse", "main"]).stdout;
  f.script("start-work.mjs", ["next-task"]);
  assert.equal(f.git(["symbolic-ref", "HEAD"]).stdout.trim(), "refs/heads/codex/next-task");
  assert.equal(f.git(["rev-parse", "HEAD"]).stdout, base);
  f.git(["config", "--get", "branch.codex/next-task.remote"], { status: 1 });
  f.script("start-work.mjs", ["next-task"], { status: 1 });
  assert.equal(f.git(["rev-parse", "HEAD"]).stdout, base);
});

test("start-work refuses dirty work, invalid names and divergent cached main", (t) => {
  const f = fixture(t);
  for (const args of [[], ["main;echo"], ["Uppercase"], ["okay", "--unknown"], ["okay", "--worktree"]]) {
    f.script("start-work.mjs", args, { status: 1 });
  }
  writeFileSync(join(f.root, "untracked.txt"), "preserve me");
  f.script("start-work.mjs", ["dirty"], { status: 1 });
  assert.equal(readFileSync(join(f.root, "untracked.txt"), "utf8"), "preserve me");
  f.git(["add", "untracked.txt"]);
  f.git(["commit", "-m", "save fixture"]);
  f.git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
  f.script("start-work.mjs", ["stale"], { status: 1 });
  f.git(["show-ref", "--verify", "refs/heads/codex/stale"], { status: 128 });
});

test("new linked worktree retains Git protection and leaves the original checkout alone", (t) => {
  const f = fixture(t);
  const target = join(f.temp, "new worktree");
  f.script("start-work.mjs", ["parallel", "--worktree", target]);
  assert.equal(f.git(["symbolic-ref", "HEAD"]).stdout.trim(), "refs/heads/codex/trial");
  f.git(["commit", "--allow-empty", "-m", "linked feature"], { cwd: target });
  f.git(["switch", "main"], { cwd: target });
  f.git(["commit", "--allow-empty", "-m", "blocked"], { cwd: target, status: 1 });
});

test("installer preserves unrelated Codex hooks and is idempotent", (t) => {
  const f = fixture(t, { install: false });
  mkdirSync(join(f.root, ".codex"));
  const path = join(f.root, ".codex", "hooks.json");
  const custom = { hooks: [{ type: "command", command: "true" }] };
  writeFileSync(path, JSON.stringify({ description: "mine", hooks: { Stop: [custom] } }));
  f.script("install.mjs");
  const before = readFileSync(path, "utf8");
  f.script("install.mjs");
  assert.equal(readFileSync(path, "utf8"), before);
  assert.deepEqual(JSON.parse(before).hooks.Stop, [custom]);
  assert.equal(JSON.parse(before).description, "mine");
});

test("installer refuses existing Git hooks without changing configuration", (t) => {
  const f = fixture(t, { install: false });
  writeFileSync(join(f.root, ".git", "hooks", "pre-push"), "existing hook");
  f.script("install.mjs", [], { status: 1 });
  assert.equal(existsSync(join(f.root, ".codex", "hooks.json")), false);
  f.git(["config", "--get", "core.hooksPath"], { status: 1 });
  f.git(["config", "core.hooksPath", "other-hooks"]);
  f.script("install.mjs", [], { status: 1 });
  assert.equal(f.git(["config", "--get", "core.hooksPath"]).stdout.trim(), "other-hooks");
});

test("installer refuses main, malformed Codex configuration and conflicting skills", (t) => {
  const f = fixture(t, { install: false });
  f.git(["switch", "main"]);
  f.script("install.mjs", [], { status: 1 });
  f.git(["switch", "codex/trial"]);
  mkdirSync(join(f.root, ".codex"));
  const path = join(f.root, ".codex", "hooks.json");
  writeFileSync(path, "not json");
  f.script("install.mjs", [], { status: 1 });
  assert.equal(readFileSync(path, "utf8"), "not json");
  writeFileSync(path, '{"hooks":{}}');
  const skill = join(f.root, ".agents", "skills", "start-work");
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "existing skill");
  f.script("install.mjs", [], { status: 1 });
  assert.equal(readFileSync(path, "utf8"), '{"hooks":{}}');
});

test("configured Codex command runs from a subdirectory with the documented wire shape", (t) => {
  const f = fixture(t);
  const config = JSON.parse(readFileSync(join(f.root, ".codex", "hooks.json")));
  const group = config.hooks.PreToolUse[0];
  assert.equal(new RegExp(group.matcher).test("apply_patch"), true);
  assert.equal(new RegExp(group.matcher).test("Bash"), false);
  const cwd = join(f.root, "protected-branch-guard");
  f.run("/bin/sh", ["-c", group.hooks[0].command], { cwd, input: JSON.stringify(f.event()) });
  f.git(["switch", "main"]);
  const result = f.run("/bin/sh", ["-c", group.hooks[0].command], { cwd, input: JSON.stringify(f.event()), status: 2 });
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, "PreToolUse");
  assert.equal(output.permissionDecision, "deny");
});
