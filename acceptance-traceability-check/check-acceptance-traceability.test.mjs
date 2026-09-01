import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./check-acceptance-traceability.mjs", import.meta.url));
const shippedExample = fileURLToPath(new URL(".", import.meta.url));

function runCheck(root) {
  return spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
}

async function writeAcceptanceDocument(content) {
  const root = await mkdtemp(join(tmpdir(), "acceptance-traceability-"));
  await mkdir(join(root, "docs", "acceptance"), { recursive: true });
  await writeFile(join(root, "docs", "acceptance", "fixture.md"), content);
  return root;
}

test("the shipped example document passes", () => {
  const result = runCheck(shippedExample);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /complete for 1 document\(s\)/);
});

test("a missing acceptance directory fails instead of passing vacuously", async () => {
  const root = await mkdtemp(join(tmpdir(), "acceptance-traceability-"));
  try {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No acceptance documents found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a criterion absent from the traceability table fails", async () => {
  const root = await writeAcceptanceDocument(
    [
      "## AC-DEMO-001 First",
      "## AC-DEMO-002 Second",
      "",
      "## Traceability",
      "",
      "| Criterion/scenario | Implementation |",
      "| ------------------ | -------------- |",
      "| AC-DEMO-001        | `src/a.mjs`    |",
      "",
    ].join("\n"),
  );
  try {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AC-DEMO-002 must occur exactly once .*\(found 0\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a criterion duplicated in the traceability table fails", async () => {
  const root = await writeAcceptanceDocument(
    [
      "## AC-DEMO-001 First",
      "",
      "## Traceability",
      "",
      "| Criterion/scenario | Implementation |",
      "| ------------------ | -------------- |",
      "| AC-DEMO-001        | `src/a.mjs`    |",
      "| AC-DEMO-001        | `src/b.mjs`    |",
      "",
    ].join("\n"),
  );
  try {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AC-DEMO-001 must occur exactly once .*\(found 2\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a duplicate criterion heading across documents fails", async () => {
  const root = await writeAcceptanceDocument(
    [
      "## AC-DEMO-001 First",
      "",
      "## Traceability",
      "",
      "| Criterion/scenario | Implementation |",
      "| ------------------ | -------------- |",
      "| AC-DEMO-001        | `src/a.mjs`    |",
      "",
    ].join("\n"),
  );
  try {
    await writeFile(
      join(root, "docs", "acceptance", "second.md"),
      [
        "## AC-DEMO-001 Duplicate",
        "",
        "## Traceability",
        "",
        "| Criterion/scenario | Implementation |",
        "| ------------------ | -------------- |",
        "| AC-DEMO-001        | `src/c.mjs`    |",
        "",
      ].join("\n"),
    );
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /duplicate criterion heading AC-DEMO-001/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a missing traceability section fails", async () => {
  const root = await writeAcceptanceDocument("## AC-DEMO-001 First\n\nNo table here.\n");
  try {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing a Traceability section/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
