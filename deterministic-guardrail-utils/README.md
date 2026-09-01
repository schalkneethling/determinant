# deterministic-guardrail-utils

The shared substrate that repository guardrail scripts are built on: bounded
file reads, deterministic directory walks, testable roots, and
collect-everything error reporting.

## What it is

`guardrail-utils.mjs` is a dependency-free ES module exporting six small
functions. In its source project every quality gate imports these instead of
touching `node:fs` directly, so the safety discipline is uniform:

- `readTextBounded(path, limit)` — `lstat` first, reject non-regular files and
  anything over the limit, read, then **re-check the byte length after the
  read**. The re-check closes the window in which a file grows (or is swapped)
  between the size check and the read.
- `listFiles(root, predicate)` — recursive walk with entries sorted by plain
  code-unit comparison at every level (never `localeCompare`, whose order can
  vary with the host's locale and ICU data), so the file order — and therefore
  the error order, hash order, and diff order of anything built on it — is
  identical on every machine. A missing root returns an empty list instead of
  throwing.
- `parseRootArgument(argv)` — every guardrail accepts `--root <dir>`, which
  means every guardrail can be pointed at a fixture tree and tested like any
  other program, instead of only ever running against the real repository.
- `fail(messages)` — print **all** violations, then set `process.exitCode = 1`
  once. Guardrails accumulate errors and report the complete list in a single
  run, rather than throwing on the first finding and forcing a fix-rerun loop.
- `pathExists(path)` — treats only `ENOENT` as "missing"; any other filesystem
  error propagates instead of being swallowed into a false negative.
- `sha256(content)` — stable content fingerprints for freshness manifests.

`guardrail-utils.test.mjs` exercises all of it against temporary fixture
trees:

```sh
node --test guardrail-utils.test.mjs
```

## The goal

Guardrail scripts are trusted with veto power over merges, so they must be
more disciplined than the code they police. Three properties matter:

1. **Bounded input.** A gate that calls `readFile` on whatever it finds can be
   wedged by a giant or non-regular file. Checking size before *and* after the
   read makes the bound real, not advisory.
2. **Deterministic traversal.** `readdir` order is platform-dependent, and
   `localeCompare` order is environment-dependent. Sorting by code units at
   every level makes output, error messages, and derived hashes byte-identical
   across machines and CI.
3. **Testability.** `--root` turns "a script that inspects this repo" into "a
   program with an input", which is the difference between guardrails you can
   test and guardrails you have to trust.

One habit lives in callers rather than in this module, and matters as much:
**a scan that matches zero files is a failure, not a pass.** A renamed
directory or a wrong glob silently disables a gate that only checks the files
it found; gates built on this substrate assert a non-empty file list first.

## Potential benefit

- Every new guardrail inherits the same input-safety and determinism
  guarantees instead of re-deciding them.
- Complete violation lists per run — one CI round-trip instead of one per
  finding.
- Guardrails become unit-testable against fixture trees, so the gates
  themselves can be trusted (and refactored) with evidence.
- Stable ordering means guardrail output can itself be snapshot-tested.

## Real problems caught

In `css-property-type-validator`, this module underlies more than a dozen
gates (acceptance traceability, architectural boundary checks, generated-file
freshness, and the agent lifecycle bundle), and the gates are themselves
tested via `--root` fixture trees. The zero-files-is-a-failure habit is
applied in its boundary checks precisely because an empty glob had the same
observable result as a passing scan.

## Honest limitations

This is a substrate, not a gate: it enforces nothing by itself. The post-read
byte re-check narrows the read-time race, but is not a defense against a
deliberately adversarial concurrent writer — it targets accidents, not
attacks. `listFiles` walks everything under the root (there is no exclusion
list), so point it at bounded trees like `docs/` or `src`, not at a directory
containing `node_modules`.
