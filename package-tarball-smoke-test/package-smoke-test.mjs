import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    config: { type: "string" },
    "package-root": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
});

const usage = `Usage: node package-smoke-test.mjs --package-root <path> [--config <path>]

The default config is <package-root>/.package-smoke.json.`;

if (values.help) {
  console.log(usage);
  process.exit(0);
}

if (!values["package-root"]) throw new Error(`--package-root is required.\n\n${usage}`);

const packageRoot = resolve(values["package-root"]);
const configPath = values.config
  ? isAbsolute(values.config)
    ? values.config
    : resolve(process.cwd(), values.config)
  : join(packageRoot, ".package-smoke.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const temporaryDirectory = await mkdtemp(join(tmpdir(), "package-smoke-"));

const specifier = (subpath) =>
  subpath === "." ? config.packageName : `${config.packageName}/${subpath.slice(2)}`;
const packagePath = (...parts) => join(...config.packageName.split("/"), ...parts);

try {
  const packed = spawnSync(
    "npm",
    ["pack", "--ignore-scripts", "--pack-destination", temporaryDirectory],
    { cwd: packageRoot, encoding: "utf8" },
  );
  if (packed.status !== 0) throw new Error(packed.stderr || packed.stdout);

  const tarball = packed.stdout.trim().split("\n").at(-1);
  if (!tarball) throw new Error("npm pack did not report a tarball.");

  const extracted = spawnSync(
    "tar",
    ["-xf", join(temporaryDirectory, tarball), "-C", temporaryDirectory],
    { encoding: "utf8" },
  );
  if (extracted.status !== 0) throw new Error(extracted.stderr || extracted.stdout);

  const extractedPackage = join(temporaryDirectory, "node_modules", packagePath());
  await mkdir(dirname(extractedPackage), { recursive: true });
  await rename(join(temporaryDirectory, "package"), extractedPackage);

  for (const definition of config.textFiles ?? []) {
    const contents = await readFile(join(extractedPackage, definition.path), "utf8");
    for (const expected of definition.mustContain ?? []) {
      if (!contents.includes(expected)) {
        throw new Error(`${definition.path} does not contain ${JSON.stringify(expected)}.`);
      }
    }
    for (const forbidden of definition.mustNotContain ?? []) {
      if (contents.includes(forbidden)) {
        throw new Error(`${definition.path} contains forbidden text ${JSON.stringify(forbidden)}.`);
      }
    }
  }

  for (const dependency of config.linkedDependencies ?? []) {
    const source = join(packageRoot, "node_modules", ...dependency.split("/"));
    const destination = join(temporaryDirectory, "node_modules", ...dependency.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await symlink(source, destination, "dir");
  }

  const runtimeSmoke = join(temporaryDirectory, "smoke.mjs");
  await writeFile(
    runtimeSmoke,
    `import { createRequire } from "node:module";
const runtimeExports = ${JSON.stringify(config.runtimeExports ?? [])};
const jsonExports = ${JSON.stringify(config.jsonExports ?? [])};
const packageName = ${JSON.stringify(config.packageName)};
const specifier = (subpath) => subpath === "." ? packageName : \`${"${packageName}"}/${"${subpath.slice(2)}"}\`;
for (const definition of runtimeExports) {
  const imported = await import(specifier(definition.subpath));
  for (const name of definition.names) {
    if (!(name in imported)) throw new Error(\`Missing export \${name} from \${definition.subpath}\`);
  }
}
const require = createRequire(import.meta.url);
for (const definition of jsonExports) {
  const imported = require(specifier(definition.subpath));
  if (imported[definition.property] !== definition.equals) {
    throw new Error(\`Unexpected \${definition.property} from \${definition.subpath}\`);
  }
}
`,
  );
  const runtime = spawnSync(process.execPath, [runtimeSmoke], {
    cwd: temporaryDirectory,
    encoding: "utf8",
    env: process.env,
  });
  if (runtime.status !== 0) throw new Error(runtime.stderr || runtime.stdout);

  const typeSmoke = join(temporaryDirectory, "smoke.ts");
  const imports = (config.typeImports ?? []).map(
    (definition) =>
      `import type { ${definition.names.join(", ")} } from ${JSON.stringify(specifier(definition.subpath))};`,
  );
  await writeFile(typeSmoke, `${imports.join("\n")}\n`);
  await writeFile(
    join(temporaryDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "bundler",
          noEmit: true,
          strict: true,
          target: "ESNext",
        },
        include: ["smoke.ts"],
      },
      null,
      2,
    )}\n`,
  );
  const compiler = resolve(packageRoot, config.typescriptCompiler);
  const types = spawnSync(
    process.execPath,
    [compiler, "--project", join(temporaryDirectory, "tsconfig.json")],
    { cwd: temporaryDirectory, encoding: "utf8", env: process.env },
  );
  if (types.status !== 0) throw new Error(types.stderr || types.stdout);

  console.log(`Package smoke test passed for ${config.packageName}.`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
