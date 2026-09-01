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

`check-generated-markers.mjs` adds the reverse direction, distilled from
`css-property-type-validator`:

```sh
node generated-artifact-drift-check/check-generated-markers.mjs [--root <dir>]
```

`generated-manifest.json` is the registry of every committed generated file.
The script verifies each listed file exists, then sweeps the tree (skipping
`.git` and `node_modules`) for source files whose leading comment carries an
`@generated` marker and fails on any marked file **not** listed in the
manifest. `check-generated-markers.test.mjs` exercises both directions:

```sh
node --test generated-artifact-drift-check/check-generated-markers.test.mjs
```

## The goal

Committed generated files are useful for consumers and review, but they create
two representations of the same information. The generator must prove that
the committed representation is exactly what the canonical source produces.

Checking only contents is insufficient: an obsolete output can survive after
a definition is renamed or removed. Checking only a snapshot is insufficient:
different property or collection order can create meaningless diffs. This
pattern covers both.

A per-generator `--check` still has a blind spot: it only protects the files
its own generator knows about. A new generator whose output is committed but
never wired into any check drifts invisibly. The marker sweep closes that
bypass — any file that self-identifies as generated must be registered in the
manifest, so "just don't list it" stops being a way to escape the freshness
discipline.

## Potential benefit

- Stale generated artifacts fail before merge.
- Removed definitions cannot leave ghost files in published packages.
- Regeneration produces stable diffs on every machine.
- Reviewers can distinguish an intentional source change from hand-edited
  output.
- A dependency upgrade that changes generation becomes visible immediately.
- A generated file cannot be committed without being registered in the
  manifest, so every generated artifact is covered by *some* check.

## Real problems caught

In `bcd-embed`, this pattern protects five JSON Schema documents derived from
canonical Zod schemas. Its tests reject stale document contents, missing
schemas, and unexpected `.schema.json` files. Review of the first version also
found that check mode compared a broader filename set than write mode; applying
the same filename filter in both modes removed that environmental discrepancy.

The marker sweep comes from `css-property-type-validator`, where the
generated-contract manifest is enforced in exactly these two directions: the
listed files must be present and current, and any `@generated`-marked source
outside the manifest fails the gate, so a new generated file cannot bypass the
registry by simply never being added to it.

## Honest limitations

Deterministic output can still be deterministically wrong. Test the generator's
semantics separately, preferably through an independent consumer. Do not use
`--check` as a substitute for reviewing changes to the canonical source.

The marker sweep only sees files that can carry a comment marker; pure JSON
artifacts (like this folder's `generated/catalog.json`) cannot self-identify
and must be listed in the manifest by hand. The sweep also checks presence,
not freshness — content verification remains the generator's job.
