# Determinant

A collection of deterministic tools and scripts employed across
projects to enforce determinism and raise the quality of the code (and
prose) we produce — human and agent alike.

## Layout

One clearly named folder per tool or scenario, containing the relevant
files plus a short `README.md` that states:

- **What it is** — the tool/script and the files in the folder.
- **The goal** — what property it enforces and why that matters.
- **Potential benefit** — what adopting it buys a project.
- **Real problems caught** — where history and context allow, concrete
  examples the tool caught in real use (and, just as important, honest
  limitations: what it does _not_ catch).

## Collection

| Folder                                                               | Enforces                                                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`markdownlint/`](markdownlint/)                                     | Markdown structure and formatting consistency as a build gate                                             |
| [`languagetool-prose-lint/`](languagetool-prose-lint/)               | Prose quality (spelling, grammar, consistency) via the local LanguageTool CLI, offline and version-pinned |
| [`deterministic-pnpm-install/`](deterministic-pnpm-install/)         | Reproducible dependency installation across local development and CI                                      |
| [`generated-artifact-drift-check/`](generated-artifact-drift-check/) | Exact regeneration and stale-file detection for committed generated artifacts                             |
| [`package-tarball-smoke-test/`](package-tarball-smoke-test/)         | Runtime, asset, export-map, and TypeScript checks against the package users actually receive              |
| [`pinned-source-golden-fixtures/`](pinned-source-golden-fixtures/)   | Reproducible fixture extraction plus semantic assertions for important edge cases                         |
| [`dual-schema-validation/`](dual-schema-validation/)                 | Agreement between a canonical runtime schema and independently consumable JSON Schema                     |
| [`green-stamp-push-gate/`](green-stamp-push-gate/)                   | Only trees that passed the quality gate can be pushed — gate stamps the exact tree, pre-push hook enforces |
| [`claude-pretooluse-gate-guard/`](claude-pretooluse-gate-guard/)     | Denies AI-agent commands that chain a gate run with git commit/push, before a bad commit exists           |
