import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixtures = JSON.parse(
  await readFile(new URL("golden-fixtures.json", import.meta.url), "utf8"),
);

test("records the exact pinned source version", () => {
  assert.equal(fixtures.source.version, "3.2.1");
});

test("contains a remove-and-re-add history", () => {
  const history = fixtures.fragments["features.widget.support"].demo;
  assert.deepEqual(
    history.map(({ version_removed: removed }) => removed),
    ["2", null],
  );
  assert.equal(history.at(-1).version_added, "3");
});

test("preserves an explicit unknown child inside the realistic subtree", () => {
  const subtree = fixtures.subtrees["features.widget"];
  assert.equal(subtree.child.support.demo[0].version_added, null);
});
