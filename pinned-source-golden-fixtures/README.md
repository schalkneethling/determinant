# pinned-source-golden-fixtures

Reproducible fixture extraction from a version-pinned upstream source,
paired with targeted assertions that prove each advertised edge case exists.

## What it is

The example contains:

- `sample-source.json` — a stand-in for a pinned dependency's published data.
- `fixture-config.json` — the required source version and exact paths to copy.
- `extract-fixtures.mjs` — write and non-mutating `--check` modes.
- `golden-fixtures.json` — the committed extraction.
- `fixture-invariants.test.mjs` — semantic checks using Node's built-in test
  runner.

Run the complete example with:

```sh
node pinned-source-golden-fixtures/extract-fixtures.mjs --check
node --test pinned-source-golden-fixtures/fixture-invariants.test.mjs
```

`extract-fixtures.mjs` resolves `sourceFile` relative to this example directory.
In a real project, a dependency installed in the repository root therefore
needs a path such as `../node_modules/package/data.json`. Pin that package
exactly in the lockfile, then replace the sample paths and assertions with
cases meaningful to the domain.

## The goal

A golden fixture should answer two independent questions:

1. Is this still the exact upstream data selected from the pinned version?
2. Does it genuinely contain the edge condition its name promises?

Snapshots alone answer neither reliably. They accept hand-edited data and can
continue passing after an edge case disappears. Extraction plus semantic
assertions makes provenance and intent executable.

## Potential benefit

- Fixture provenance is reviewable and reproducible.
- Upstream upgrades expose their fixture delta immediately.
- Named adversarial cases cannot silently become ordinary cases.
- Large realistic subtrees can be retained without hand-copy errors.
- Tests document why each fixture exists, not merely what bytes it contains.

## Problems this example catches

The checked-in sample pins source version 3.2.1. Its assertions prove that the
demo support history contains a removal followed by a re-add, and that the
child entry preserves explicit `null` values. Changing the version, removing
the re-add, or silently dropping those nulls makes the example fail.

## Honest limitations

The extractor proves provenance, not representativeness. Humans still choose
the paths and must revisit them when the domain changes. Keep source fragments
small enough to review, and use a larger subtree only when scale itself is a
required test condition.
