import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = fileURLToPath(new URL("..", import.meta.url));

export function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = typeof result.status === "number" ? result.status : 1;
    return false;
  }
  return true;
}

export function runExpectedFailure(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status === 0) {
    process.stderr.write(
      "RED evidence command passed; it did not prove the selected unmet criterion.\n",
    );
    process.exitCode = 1;
    return false;
  }
  if (typeof result.status !== "number") {
    process.stderr.write(
      `RED evidence command was terminated by signal ${result.signal}; a crash is not valid RED evidence.\n`,
    );
    process.exitCode = 1;
    return false;
  }
  return true;
}

export function runGuardrails() {
  const scripts = readdirSync(scriptsDirectory)
    .filter((name) => name.startsWith("check-") && name.endsWith(".mjs"))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  if (scripts.length === 0) {
    process.stderr.write(
      `No guardrail scripts (check-*.mjs) found in ${scriptsDirectory}; refusing to pass vacuously.\n`,
    );
    process.exitCode = 1;
    return false;
  }

  return scripts.every((script) => run(process.execPath, [join(scriptsDirectory, script)]));
}

export function usage(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}
