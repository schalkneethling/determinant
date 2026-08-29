# dual-schema-validation

One fixture corpus validated through both a canonical runtime schema and an
independently consumable JSON Schema.

## What it is

The complete example uses Zod for the canonical application contract and Ajv
for the published JSON Schema. From a clean checkout, install its locked
dependencies and then run the fixtures from the repository root:

```sh
npm ci --prefix dual-schema-validation
node dual-schema-validation/validate.mjs dual-schema-validation/fixtures/valid.json
node dual-schema-validation/validate.mjs dual-schema-validation/fixtures/invalid-structural.json
node dual-schema-validation/validate.mjs dual-schema-validation/fixtures/invalid-relational.json
```

The valid fixture passes both validators. The structurally invalid fixture
fails both. The relational fixture deliberately demonstrates a boundary: JSON
Schema accepts its shape, while Zod rejects a summary count that disagrees with
the items. The command returns non-zero unless both validators pass.

## The goal

When a project publishes JSON Schema derived from a richer runtime contract,
it effectively supports two validators. The same positive and negative corpus
should exercise both. Agreement catches conversion drift; intentional
disagreement documents constraints the portable schema cannot express.

This is stronger than testing the generated document only for snapshot
stability. It asks an independent implementation to consume it and compares
observable validation behavior.

## Potential benefit

- Published schema files are proven usable by an independent validator.
- Runtime and wire-contract drift appears as a focused test failure.
- Structural and relational failures remain distinguishable.
- Consumers get portable validation without forcing the application library
  into every language or runtime.
- Error-path comparison makes malformed fixtures easier to diagnose.

## Real problems caught

In `bcd-embed`, the shared corpus rejected empty required collections, unknown
fields, invalid dates and identifiers, incorrect nullability, malformed branch
identities, and conditional error payloads through both validators. The richer
Zod checks additionally caught an incorrect support summary chosen from a
lower-precedence statement. That distinction is now explicit rather than an
accidental gap between formats.

## Honest limitations

Two validators agreeing does not prove the intended contract is correct; they
may encode the same mistake. Keep malformed controls hand-authored from the
requirements, and identify every intentional relational gap in documentation
and targeted runtime tests.
