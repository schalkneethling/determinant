import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./check-determinism-rules.mjs", import.meta.url));
const violations = fileURLToPath(new URL("./fixtures/violations.mjs", import.meta.url));
const clean = fileURLToPath(new URL("./fixtures/clean.mjs", import.meta.url));

function runGate(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

test("every seeded violation is reported", () => {
  const result = runGate([violations]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /violations\.mjs:2 \[no-locale-sensitive-sort\]/);
  assert.match(result.stderr, /violations\.mjs:7 \[no-unbounded-response-read\]/);
  assert.match(result.stderr, /violations\.mjs:13 \[no-unbounded-response-read\]/);
  assert.match(result.stderr, /violations\.mjs:17 \[no-unbounded-inline-fetch-read\]/);
  assert.equal(result.stderr.trim().split("\n").length, 4);
});

test("deterministic code passes clean", () => {
  const result = runGate([clean]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Determinism rules passed/);
});

test("zero targets is a usage error, not a pass", () => {
  const result = runGate([]);
  assert.equal(result.status, 2);
});
