import { spawnSync } from "node:child_process";

export const MAX_BYTES = 2 * 1024 * 1024;

export function git(cwd, args, { allowed = [0], input } = {}) {
  const result = spawnSync("git", args, {
    cwd, input, encoding: "utf8", timeout: 5000, maxBuffer: MAX_BYTES,
  });
  if (result.error || !allowed.includes(result.status)) {
    throw new Error(`git ${args[0]} failed: ${result.error?.message ?? result.stderr.trim()}`);
  }
  return { status: result.status, text: result.stdout.replace(/\r?\n$/, "") };
}

export function branchState(cwd) {
  if (git(cwd, ["rev-parse", "--is-inside-work-tree"]).text !== "true") {
    throw new Error("A non-bare Git working tree is required.");
  }
  const root = git(cwd, ["rev-parse", "--show-toplevel"]).text;
  const ref = git(cwd, ["symbolic-ref", "--quiet", "HEAD"], { allowed: [0, 1] });
  return { root, ref: ref.status === 0 ? ref.text : null };
}

export function assertWritableBranch(cwd) {
  const state = branchState(cwd);
  if (state.ref === null || state.ref === "refs/heads/main") {
    throw new Error(`${state.root}: ${state.ref === null ? "detached HEAD" : "main"} is read-only. Create or switch to a named feature branch before editing or committing.`);
  }
  return state;
}

export async function readStdin() {
  let size = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      throw new Error(`Hook input exceeds ${MAX_BYTES} bytes.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
