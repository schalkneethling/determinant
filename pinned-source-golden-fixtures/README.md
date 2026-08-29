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

In a real project, point `sourceFile` at a file under `node_modules`, pin that
package exactly in the lockfile, and replace the sample paths and assertions
with cases meaningful to the domain.

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

## Real problems caught

The `bcd-embed` fixtures pin Browser Compatibility Data 8.0.13 and verify
source fragments directly against the installed package. Targeted invariants
protect add/remove/re-add histories, approximate versions, absent versus
explicitly unknown targets, nested depth, and five support states. A review
found that summary selection could choose a lower-precedence prefixed or
partial statement over canonical support; a competing-branches fixture and
semantic assertion now guard that behavior.

## Honest limitations

The extractor proves provenance, not representativeness. Humans still choose
the paths and must revisit them when the domain changes. Keep source fragments
small enough to review, and use a larger subtree only when scale itself is a
required test condition.
