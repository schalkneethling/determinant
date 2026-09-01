# pinned-spec-reference-check

Pin your code's semantics to a dated specification snapshot, verify every
cited anchor still exists, and get **notified** when the living spec moves —
never auto-updated.

## What it is

Two dependency-free Node scripts, plus an example scheduled workflow:

- **`check-spec-links.mjs`** — extracts every URL matching a prefix (default
  `https://www.w3.org/`) from a source file, fetches each referenced page
  once, and asserts that each cited `#fragment` exists in the page as an
  `id=` or `name=` attribute. This catches the rot mode a plain link checker
  misses: a spec URL that still returns 200 while the anchor your comment or
  diagnostic cites has been renamed away.

  ```sh
  node check-spec-links.mjs                                # shipped example references
  node check-spec-links.mjs --source src/specification.ts  # your catalog
  ```

- **`check-spec-drift.mjs`** — reads `spec-pin.json`, which names the living
  URL of the specification, the approved publication date, and the dated
  snapshot URL your semantics were reviewed against. It fetches the living
  page and fails if neither the approved date nor the snapshot URL is still
  identified there — with an instruction, not an edit: *"Review drift; do not
  update semantics automatically."*

  ```sh
  node check-spec-drift.mjs --pin spec-pin.json
  ```

Both scripts bound their reads (256 KiB source, 8 MiB response) and fail
closed on network errors. The shipped `spec-pin.json` and
`spec-references.example.mjs` carry real values from the CSS Properties and
Values API Level 1 specification, so the folder is runnable as-is.

## The goal

Code that implements a specification makes normative claims. Two invariants
keep those claims honest:

1. **Every citation resolves.** If a diagnostic says "see §register-property",
   that anchor must exist in the cited document today, not just when the line
   was written.
2. **Semantics follow review, not upstream churn.** The spec is pinned to a
   dated snapshot. When the working draft republishes, the right response is a
   human reading the diff and deciding — not a bot bumping a URL and silently
   changing what the code claims to conform to. The drift check is therefore
   deliberately a notification gate with no fix mode.

Equally important is **where** these run: not in PR CI. Pull-request builds
must be hermetic and deterministic — a W3C server hiccup should never turn an
unrelated PR red. `contract-drift.example.yml` runs the checks on a weekly
cron plus `workflow_dispatch`, with read-only permissions and SHA-pinned
actions, so upstream movement surfaces as a scheduled signal instead of
random CI noise.

## Potential benefit

- Renamed or removed spec anchors are detected while the rename is fresh.
- The exact reviewed snapshot is recorded in one machine-checked file instead
  of tribal knowledge.
- Spec republication becomes a calm weekly review item, not a surprise.
- PR CI stays fully offline; flaky-network failures cannot block merges.

## Real problems caught

In `css-property-type-validator`, every semantic rule about `@property` is
traced to the CSS Properties and Values API Level 1 specification, and these
checks guard that catalog from a weekly `contract-drift` workflow alongside
similar drift checks for a pinned delivery service. The split — hermetic PR
CI, scheduled network canaries — is applied to every network-dependent gate
in that repository.

## Honest limitations

These checks verify that citations resolve and that the reviewed profile is
still current — they cannot verify that your implementation matches the cited
text. The anchor check only sees URLs that appear literally in the source
file; URLs assembled at runtime from base-plus-fragment constants are checked
only at page level. The drift check's string matching (a date and a snapshot
URL) is deliberately simple and could in principle match an unrelated
occurrence; keep the pinned strings specific. Both scripts need the network,
which is exactly why they belong in a scheduled workflow, not in PR CI.
