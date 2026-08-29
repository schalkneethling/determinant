# generated-artifact-drift-check

A generator with a strict `--check` mode for artifacts that are committed to
source control.

## What it is

`generate.mjs` derives `generated/catalog.json` from `source.json`. It has two
modes:

```sh
node generated-artifact-drift-check/generate.mjs
node generated-artifact-drift-check/generate.mjs --check
```

Write mode regenerates the expected artifacts and removes stale generated
`.json` files. Check mode writes nothing: it verifies the exact filename set
and byte-for-byte contents. Unknown command-line arguments fail rather than
being ignored.

The included catalog is deliberately small, but the control flow is the
reusable part: one canonical source, explicit ordering, canonical
serialization, exact file-set comparison, and a non-mutating CI mode.

## The goal

Committed generated files are useful for consumers and review, but they create
two representations of the same information. The generator must prove that
the committed representation is exactly what the canonical source produces.

Checking only contents is insufficient: an obsolete output can survive after
a definition is renamed or removed. Checking only a snapshot is insufficient:
different property or collection order can create meaningless diffs. This
pattern covers both.

## Potential benefit

- Stale generated artifacts fail before merge.
- Removed definitions cannot leave ghost files in published packages.
- Regeneration produces stable diffs on every machine.
- Reviewers can distinguish an intentional source change from hand-edited
  output.
- A dependency upgrade that changes generation becomes visible immediately.

## Real problems caught

In `bcd-embed`, this pattern protects five JSON Schema documents derived from
canonical Zod schemas. Its tests reject stale document contents, missing
schemas, and unexpected `.schema.json` files. Review of the first version also
found that check mode compared a broader filename set than write mode; applying
the same filename filter in both modes removed that environmental discrepancy.

## Honest limitations

Deterministic output can still be deterministically wrong. Test the generator's
semantics separately, preferably through an independent consumer. Do not use
`--check` as a substitute for reviewing changes to the canonical source.
