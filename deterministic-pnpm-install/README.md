# deterministic-pnpm-install

A small set of package-manager and CI settings that makes a pnpm install
mean the same thing on a developer machine and in CI.

## What it is

Three adoption examples:

- `package.example.json` pins the exact pnpm release and supported Node
  runtime.
- `pnpm-workspace.example.yaml` makes engine and peer failures strict,
  stabilizes pnpm's virtual-store behavior, and explicitly permits the
  install scripts the project has reviewed.
- `ci.example.yml` installs with `--frozen-lockfile` before running the
  repository's complete quality gate.

Copy the relevant fields into the corresponding files in a pnpm
workspace. Keep the versions deliberate; the values here are examples,
not an instruction to upgrade every project to them.

## The goal

Dependency installation is part of the build. A different package-manager
release, a rewritten lockfile, an ignored native build, or a permissive peer
dependency graph can change the program before a test executes. The goal is
to make those differences explicit and fail early.

The build allowlist is particularly important: dependency lifecycle scripts
can execute arbitrary code during installation. An allowlist records which
packages genuinely need that privilege and makes additions reviewable.

## Potential benefit

- Local and CI installs resolve the same dependency graph.
- A stale lockfile fails CI instead of being silently rewritten.
- Unsupported Node versions and invalid peer graphs stop immediately.
- New dependency build scripts require an intentional, reviewable decision.
- Package-manager upgrades become small instrument changes with an isolated
  diff.

## Real problems caught

While building the `bcd-embed` contract tooling:

- A repository pinned a pnpm release that was not available; aligning on a
  verified release restored reproducible installation.
- A globally installed pnpm 11.20.0 refused to run a project pinned to
  11.24.0 instead of quietly mutating the lockfile with the wrong version.
- pnpm blocked `esbuild`'s postinstall until it was explicitly added to the
  workspace build allowlist. That interruption made the new executable
  dependency visible during review.
- `enableGlobalVirtualStore` needed an explicit value because pnpm otherwise
  selected different experimental defaults locally and in CI.

## Honest limitations

This does not make an upstream registry or package trustworthy. Lockfile
integrity, dependency review, provenance, and vulnerability management remain
separate concerns. Build-script approval means "expected to run," not "safe
forever."
