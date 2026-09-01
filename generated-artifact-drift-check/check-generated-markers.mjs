import { lstat, readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const MAX_READ_BYTES = 2 * 1024 * 1024;
const GENERATED_MARKER = /^\s*(?:\/\/|\/\*|\*|#|<!--)\s*@generated\b/mu;
const SWEPT_EXTENSIONS = /\.(?:[cm]?[jt]s|json|md|ya?ml)$/u;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);

const arguments_ = process.argv.slice(2);
const rootIndex = arguments_.indexOf("--root");
const rootValue = rootIndex === -1 ? process.cwd() : arguments_[rootIndex + 1];
if (!rootValue || rootValue.startsWith("-")) {
  throw new Error("--root requires a directory path.");
}
const unknownArguments = arguments_.filter(
  (argument, index) => argument !== "--root" && index !== rootIndex + 1,
);
if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
}

const root = resolve(rootValue);
const manifestPath = resolve(root, "generated-manifest.json");

async function readTextBounded(filePath) {
  const stat = await lstat(filePath);
  if (!stat.isFile()) {
    throw new Error(`Expected a regular file: ${filePath}`);
  }
  if (stat.size > MAX_READ_BYTES) {
    throw new Error(`Refusing to read ${filePath}: larger than ${MAX_READ_BYTES} bytes.`);
  }
  const content = await readFile(filePath, "utf8");
  if (Buffer.byteLength(content, "utf8") > MAX_READ_BYTES) {
    throw new Error(`Refusing ${filePath}: content grew beyond ${MAX_READ_BYTES} bytes.`);
  }
  return content;
}

async function listSweptFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const candidate = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(...(await listSweptFiles(candidate)));
      }
    } else if (entry.isFile() && SWEPT_EXTENSIONS.test(entry.name)) {
      files.push(candidate);
    }
  }
  return files;
}

const manifest = JSON.parse(await readTextBounded(manifestPath));
const errors = [];
const listed = new Set();

if (!Array.isArray(manifest.generated)) {
  errors.push(`${relative(root, manifestPath)}: "generated" must be an array of paths.`);
} else {
  for (const entry of manifest.generated) {
    if (typeof entry !== "string" || entry.length === 0) {
      errors.push(`${relative(root, manifestPath)}: each entry must be a non-empty path.`);
      continue;
    }
    if (listed.has(entry)) {
      errors.push(`${relative(root, manifestPath)}: duplicate entry ${entry}.`);
      continue;
    }
    listed.add(entry);
    try {
      const stat = await lstat(resolve(root, entry));
      if (!stat.isFile()) {
        errors.push(`Listed generated file is not a regular file: ${entry}.`);
      }
    } catch {
      errors.push(`Listed generated file is missing: ${entry}.`);
    }
  }

  for (const filePath of await listSweptFiles(root)) {
    if (filePath === manifestPath) {
      continue;
    }
    const relativePath = relative(root, filePath);
    if (listed.has(relativePath)) {
      continue;
    }
    if (GENERATED_MARKER.test(await readTextBounded(filePath))) {
      errors.push(`Generated file is not listed in generated-manifest.json: ${relativePath}.`);
    }
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    process.stderr.write(`${message}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`Generated-file manifest is complete (${listed.size} file(s) listed).\n`);
}
