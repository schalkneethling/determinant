import { readFile, writeFile } from "node:fs/promises";

const arguments_ = process.argv.slice(2);
const check = arguments_.includes("--check");
const unknownArguments = arguments_.filter((argument) => argument !== "--check");

if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
}

const directory = new URL("./", import.meta.url);
const config = JSON.parse(await readFile(new URL("fixture-config.json", directory), "utf8"));
const source = JSON.parse(await readFile(new URL(config.sourceFile, directory), "utf8"));

const atPath = (root, path) =>
  path.split(".").reduce((value, segment) => {
    if (value === null || typeof value !== "object" || !(segment in value)) {
      throw new Error(`Missing fixture path: ${path}`);
    }
    return value[segment];
  }, root);

const actualVersion = atPath(source, config.versionPath);
if (actualVersion !== config.expectedVersion) {
  throw new Error(
    `Expected source version ${config.expectedVersion}, received ${String(actualVersion)}.`,
  );
}

const document = {
  source: {
    file: config.sourceFile,
    version: actualVersion,
  },
  fragments: Object.fromEntries(config.fragmentPaths.map((path) => [path, atPath(source, path)])),
  subtrees: Object.fromEntries(config.subtreePaths.map((path) => [path, atPath(source, path)])),
};
const expected = `${JSON.stringify(document, null, 2)}\n`;
const output = new URL(config.outputFile, directory);

if (check) {
  const committed = await readFile(output, "utf8");
  if (committed !== expected) {
    throw new Error(`${config.outputFile} is not up to date.`);
  }
} else {
  await writeFile(output, expected);
}
