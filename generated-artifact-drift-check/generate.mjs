import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";

const arguments_ = process.argv.slice(2);
const check = arguments_.includes("--check");
const unknownArguments = arguments_.filter((argument) => argument !== "--check");

if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
}

const source = JSON.parse(await readFile(new URL("./source.json", import.meta.url), "utf8"));
const outputDirectory = new URL("./generated/", import.meta.url);
const definitions = [
  [
    "catalog.json",
    {
      schemaVersion: source.schemaVersion,
      entries: source.entries.toSorted((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      ),
    },
  ],
];
const expectedFiles = definitions.map(([filename]) => filename).sort();

let actualFiles = [];
try {
  actualFiles = (await readdir(outputDirectory))
    .filter((filename) => filename.endsWith(".json"))
    .sort();
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
    throw error;
  }
}

if (check) {
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `Generated file set differs: expected ${expectedFiles.join(", ")}; found ${actualFiles.join(", ")}.`,
    );
  }
} else {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    actualFiles
      .filter((filename) => !expectedFiles.includes(filename))
      .map((filename) => unlink(new URL(filename, outputDirectory))),
  );
}

for (const [filename, document] of definitions) {
  const expected = `${JSON.stringify(document, null, 2)}\n`;
  const output = new URL(filename, outputDirectory);

  if (check) {
    const committed = await readFile(output, "utf8");
    if (committed !== expected) {
      throw new Error(`${filename} is not up to date.`);
    }
  } else {
    await writeFile(output, expected);
  }
}
