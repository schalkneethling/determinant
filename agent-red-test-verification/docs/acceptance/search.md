# Search acceptance criteria

Stable criterion IDs use the form `AC-AREA-NNN`. Each ID below is a heading,
and each must appear exactly once in the Traceability table.

## AC-SEARCH-001 Empty query returns no results

- In scope: a query of zero characters after trimming.
- Out of scope: whitespace-only rendering concerns.
- Observable result: the result list is empty and no request is issued.

## AC-SEARCH-002 Results are ordered deterministically

- In scope: identical corpus and query produce identical ordering.
- Out of scope: relevance quality.
- Observable result: two runs over the same input emit byte-identical output.

## Traceability

| Criterion/scenario | Test                                | Implementation      |
| ------------------ | ----------------------------------- | ------------------- |
| AC-SEARCH-001      | `search.test.mjs` (empty query)     | `src/search.mjs`    |
| AC-SEARCH-002      | `search.test.mjs` (stable ordering) | `src/order-by.mjs`  |
