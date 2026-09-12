#!/usr/bin/env node
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertWritableBranch, git, MAX_BYTES } from "./lib.mjs";

function read(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > MAX_BYTES) {
    throw new Error(`Expected a regular file smaller than ${MAX_BYTES} bytes: ${path}`);
  }
  const contents = readFileSync(path, "utf8");
  if (Buffer.byteLength(contents) > MAX_BYTES) {
    throw new Error(`File grew beyond ${MAX_BYTES} bytes: ${path}`);
  }
  return contents;
}

function rejectSymlinks(root, target) {
  for (let current = target; current !== root; current = dirname(current)) {
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(`Refusing installation through a symlink: ${current}`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

try {
  if (process.argv.length !== 2) {
    throw new Error("Usage: node protected-branch-guard/install.mjs");
  }
  const { root } = assertWritableBranch(process.cwd());
  const source = join(root, "protected-branch-guard");
  if (realpathSync(dirname(fileURLToPath(import.meta.url))) !== realpathSync(source)) {
    throw new Error("Copy this entire folder to <repository>/protected-branch-guard before installing.");
  }
  const hookPath = "protected-branch-guard/git-hooks";
  const existing = git(root, ["config", "--get", "core.hooksPath"], { allowed: [0, 1] });
  if (existing.status === 0 && existing.text !== hookPath) {
    throw new Error("Existing core.hooksPath would be replaced. Integrate the guards into your hook runner manually.");
  }
  if (existing.status === 1) {
    const defaultHooks = resolve(root, git(root, ["rev-parse", "--git-path", "hooks"]).text);
    if (existsSync(defaultHooks) && readdirSync(defaultHooks).some((name) => !name.endsWith(".sample"))) {
      throw new Error("Existing Git hooks would be hidden. Integrate the guards into your hook runner manually.");
    }
  }
  const configPath = join(root, ".codex", "hooks.json");
  const skillPath = join(root, ".agents", "skills", "start-work", "SKILL.md");
  rejectSymlinks(root, configPath);
  rejectSymlinks(root, skillPath);
  const snippet = JSON.parse(read(join(source, "hooks.codex.json")));
  const config = existsSync(configPath) ? JSON.parse(read(configPath)) : { hooks: {} };
  if (!config || typeof config !== "object" || Array.isArray(config) ||
      !config.hooks || typeof config.hooks !== "object" || Array.isArray(config.hooks)) {
    throw new Error("Existing hooks.json must contain an object-valued hooks field.");
  }
  for (const [event, groups] of Object.entries(snippet.hooks)) {
    if (config.hooks[event] !== undefined && !Array.isArray(config.hooks[event])) {
      throw new Error(`Invalid hook groups for ${event}.`);
    }
    config.hooks[event] ??= [];
    for (const group of groups) {
      if (!config.hooks[event].some((entry) => JSON.stringify(entry) === JSON.stringify(group))) {
        config.hooks[event].push(group);
      }
    }
  }
  const skill = read(join(source, "start-work", "SKILL.md"));
  if (existsSync(skillPath) && read(skillPath) !== skill) {
    throw new Error("Existing start-work skill differs; refusing to overwrite it.");
  }
  // All conflict checks finish before changing configuration or files.
  for (const hook of ["pre-commit", "prepare-commit-msg", "pre-push"]) {
    const path = join(source, "git-hooks", hook);
    read(path);
  }
  for (const hook of ["pre-commit", "prepare-commit-msg", "pre-push"]) {
    chmodSync(join(source, "git-hooks", hook), 0o755);
  }
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  mkdirSync(dirname(skillPath), { recursive: true });
  writeFileSync(skillPath, skill);
  git(root, ["config", "--local", "core.hooksPath", hookPath]);
  process.stdout.write("Installed Git branch guards, merged Codex hooks, and installed $start-work.\nReview and trust the new hooks in Codex /hooks before relying on the patch guard.\nCommit the scenario, .codex/hooks.json, and .agents/skills/start-work on your feature branch.\n");
} catch (error) {
  process.stderr.write(`Install refused: ${error.message}\n`);
  process.exitCode = 1;
}
