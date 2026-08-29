# package-tarball-smoke-test

A consumer-level smoke test that validates the tarball produced by
`npm pack`, outside the source workspace.

## What it is

`package-smoke-test.mjs` packs a package into a temporary directory,
extracts it beneath a fresh `node_modules`, and then checks:

- named JavaScript exports from the package root and subpaths;
- JSON or other CommonJS-loadable asset subpaths and identifying fields;
- public TypeScript type exports with the project's real compiler;
- required or forbidden text in packed declarations and other text assets;
- runtime resolution with only explicitly linked package dependencies.

Copy `package-smoke.example.json` to `.package-smoke.json` in the package
root and adapt its package name, exports, dependencies, and type imports.
Then run:

```sh
node path/to/package-smoke-test.mjs --package-root .
```

The script also accepts `--config path/to/config.json`. Temporary files are
removed even when a check fails.

## The goal

Monorepo tests normally import source files or workspace links. Those paths
can hide a broken `files` list, export map, declaration path, generated asset,
or build order. The tarball is the real product. This test exercises exactly
what a registry consumer receives, from a directory that cannot fall back to
workspace source resolution.

## Potential benefit

- Missing build output fails before publication.
- Incorrect root and subpath exports are tested through Node resolution.
- Type declarations are checked from the packed layout, not the source tree.
- Generated JSON, WASM, CSS, or other package assets can be asserted directly.
- Accidental reliance on undeclared workspace dependencies becomes visible.

## Real problems caught

The `bcd-embed` schema package uses this pattern to prove that its JavaScript,
declarations, fixtures, and five JSON Schema subpaths survive packing. During
the same work, inspecting the packed declaration caught a temporary `.ts`
specifier that should have remained `.js`; the source-level test suite was
green because it could resolve the TypeScript source directly. A
`mustNotContain` declaration assertion now makes that boundary error an
executable check.

## Honest limitations

This is a smoke test, not a complete downstream integration suite. It checks
only the exports named in its config. Add an entry whenever the public surface
grows. The example uses the system `npm` and `tar` executables and symlinks
already-installed dependencies into the isolated environment; projects that
must test installation scripts or another operating system need an additional
clean-install job.
