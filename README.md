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
  limitations: what it does *not* catch).

## Collection

| Folder | Enforces |
| --- | --- |
| [`markdownlint/`](markdownlint/) | Markdown structure and formatting consistency as a build gate |
| [`languagetool-prose-lint/`](languagetool-prose-lint/) | Prose quality (spelling, grammar, consistency) via the local LanguageTool CLI, offline and version-pinned |
