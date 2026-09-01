import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";

import {
  MAX_GUARDRAIL_READ_BYTES,
  fail,
  listFiles,
  parseRootArgument,
  pathExists,
  readTextBounded,
  sha256,
} from "./guardrail-utils.mjs";

test("parseRootArgument defaults to the working directory", () => {
  assert.equal(parseRootArgument([]), process.cwd());
});

test("parseRootArgument resolves an explicit root", () => {
  assert.equal(parseRootArgument(["--root", "some/dir"]), resolve("some/dir"));
});

test("parseRootArgument rejects a missing or flag-like value", () => {
  assert.throws(() => parseRootArgument(["--root"]));
  assert.throws(() => parseRootArgument(["--root", "--require"]));
});

test("readTextBounded reads a regular file and rejects oversized or non-regular paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "guardrail-utils-"));
  try {
    const file = join(root, "small.txt");
    await writeFile(file, "bounded content\n");
    assert.equal(await readTextBounded(file), "bounded content\n");

    await assert.rejects(() => readTextBounded(file, 4), /exceeds 4 bytes/);
    await assert.rejects(() => readTextBounded(root), /Expected a regular file/);
    assert.ok(MAX_GUARDRAIL_READ_BYTES > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("listFiles walks recursively in deterministic sorted order", async () => {
  const root = await mkdtemp(join(tmpdir(), "guardrail-utils-"));
  try {
    await mkdir(join(root, "b-nested"));
    await writeFile(join(root, "zeta.md"), "z");
    await writeFile(join(root, "alpha.md"), "a");
    await writeFile(join(root, "b-nested", "middle.md"), "m");
    await writeFile(join(root, "ignored.txt"), "i");

    const files = await listFiles(root, (filePath) => filePath.endsWith(".md"));
    assert.deepEqual(
      files.map((filePath) => filePath.slice(root.length + 1).split(sep).join("/")),
      ["alpha.md", "b-nested/middle.md", "zeta.md"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("listFiles returns an empty list for a missing root instead of throwing", async () => {
  assert.deepEqual(await listFiles(join(tmpdir(), "guardrail-utils-does-not-exist"), () => true), []);
});

test("pathExists distinguishes missing paths from other errors", async () => {
  assert.equal(await pathExists(tmpdir()), true);
  assert.equal(await pathExists(join(tmpdir(), "guardrail-utils-does-not-exist")), false);
});

test("sha256 is stable for identical content", () => {
  assert.equal(
    sha256("determinant\n"),
    "ee2d01621c5f1ad286f86c19c5f98e4ad57c5fa40098223d426bf28100de0927",
  );
});

test("fail reports every message and sets the exit code once", () => {
  const previousExitCode = process.exitCode;
  const written = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = (chunk) => {
    written.push(String(chunk));
    return true;
  };
  try {
    fail(["first violation", "second violation"]);
  } finally {
    process.stderr.write = originalWrite;
  }
  assert.deepEqual(written, ["first violation\n", "second violation\n"]);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});
