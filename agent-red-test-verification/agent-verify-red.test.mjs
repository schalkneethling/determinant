import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = fileURLToPath(new URL(".", import.meta.url));

async function createFixture({ guardrail } = {}) {
  const root = await mkdtemp(join(tmpdir(), "agent-red-"));
  await mkdir(join(root, "lib"));
  for (const script of ["agent-verify-red.mjs", "agent-preflight.mjs"]) {
    await copyFile(join(here, script), join(root, script));
  }
  await copyFile(join(here, "lib", "agent-lifecycle.mjs"), join(root, "lib", "agent-lifecycle.mjs"));
  await mkdir(join(root, "docs", "acceptance"), { recursive: true });
  await writeFile(
    join(root, "docs", "acceptance", "search.md"),
    "## AC-SEARCH-001 Fixture criterion\n\n## Traceability\n\n| Criterion/scenario | Implementation |\n| --- | --- |\n| AC-SEARCH-001 | pending |\n",
  );
  if (guardrail === "passing") {
    await writeFile(join(root, "check-fixture.mjs"), "process.exitCode = 0;\n");
  } else if (guardrail === "failing") {
    await writeFile(
      join(root, "check-fixture.mjs"),
      'process.stderr.write("fixture guardrail violation\\n");\nprocess.exitCode = 1;\n',
    );
  }
  return root;
}

function runScript(root, script, args = []) {
  return spawnSync(process.execPath, [join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

const failingTest = ["node", "--eval", "process.exit(1)"];
const passingTest = ["node", "--eval", "process.exit(0)"];
const crashingTest = ["node", "--eval", 'process.kill(process.pid, "SIGKILL")'];

test("verify-red requires a well-formed criterion", async () => {
  const root = await createFixture({ guardrail: "passing" });
  try {
    for (const args of [[], ["--criterion", "SEARCH-1", "--", ...failingTest]]) {
      const result = runScript(root, "agent-verify-red.mjs", args);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /Usage: agent-verify-red --criterion AC-AREA-001/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verify-red requires an explicit test command after --", async () => {
  const root = await createFixture({ guardrail: "passing" });
  try {
    const result = runScript(root, "agent-verify-red.mjs", ["--criterion", "AC-SEARCH-001"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /requires one explicit test command after --/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an undeclared criterion is rejected before any test command runs", async () => {
  const root = await createFixture({ guardrail: "passing" });
  try {
    const result = runScript(root, "agent-verify-red.mjs", [
      "--criterion",
      "AC-UNDEFINED-999",
      "--",
      ...failingTest,
    ]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /AC-UNDEFINED-999 is not declared/);
    assert.doesNotMatch(result.stdout, /RED evidence captured/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a signal-terminated test command is not valid RED evidence", async () => {
  const root = await createFixture({ guardrail: "passing" });
  try {
    const result = runScript(root, "agent-verify-red.mjs", [
      "--criterion",
      "AC-SEARCH-001",
      "--",
      ...crashingTest,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /terminated by signal SIGKILL; a crash is not valid RED evidence/);
    assert.doesNotMatch(result.stdout, /RED evidence captured/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failing test command is accepted as RED evidence", async () => {
  const root = await createFixture({ guardrail: "passing" });
  try {
    const result = runScript(root, "agent-verify-red.mjs", [
      "--criterion",
      "AC-SEARCH-001",
      "--",
      ...failingTest,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /RED evidence captured for AC-SEARCH-001/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a passing test command is rejected: it proves nothing is unmet", async () => {
  const root = await createFixture({ guardrail: "passing" });
  try {
    const result = runScript(root, "agent-verify-red.mjs", [
      "--criterion",
      "AC-SEARCH-001",
      "--",
      ...passingTest,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /did not prove the selected unmet criterion/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failing guardrail blocks RED verification before the test command runs", async () => {
  const root = await createFixture({ guardrail: "failing" });
  try {
    const result = runScript(root, "agent-verify-red.mjs", [
      "--criterion",
      "AC-SEARCH-001",
      "--",
      ...failingTest,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /fixture guardrail violation/);
    assert.doesNotMatch(result.stdout, /RED evidence captured/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preflight refuses to pass with zero guardrail scripts", async () => {
  const root = await createFixture();
  try {
    const result = runScript(root, "agent-preflight.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing to pass vacuously/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preflight passes when every guardrail passes", async () => {
  const root = await createFixture({ guardrail: "passing" });
  try {
    const result = runScript(root, "agent-preflight.mjs");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Agent preflight passed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
