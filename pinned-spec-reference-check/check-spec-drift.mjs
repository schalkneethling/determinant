import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const pinIndex = args.indexOf("--pin");
const pinPath = resolve(pinIndex === -1 ? "spec-pin.json" : args[pinIndex + 1]);

const stat = await lstat(pinPath);
if (!stat.isFile() || stat.size > 64 * 1024)
  throw new Error(`${pinPath} must be a regular file no larger than 64 KiB.`);
const pin = JSON.parse(await readFile(pinPath, "utf8"));
for (const field of ["livingUrl", "approvedPublication", "approvedSnapshot"]) {
  if (typeof pin[field] !== "string" || pin[field].length === 0)
    throw new Error(`${pinPath} must define a non-empty ${field}.`);
}

const response = await fetch(pin.livingUrl, {
  headers: { "User-Agent": "pinned-spec-reference-check" },
});
if (!response.ok)
  throw new Error(`Unable to inspect the official specification: ${response.status}`);
const text = await response.text();
if (Buffer.byteLength(text) > 8 * 1024 * 1024)
  throw new Error("Official specification response exceeded 8 MiB.");

if (!text.includes(pin.approvedPublication) && !text.includes(pin.approvedSnapshot)) {
  console.error(
    `The latest published specification no longer identifies the approved ${pin.approvedPublication} profile. Review drift; do not update semantics automatically.`,
  );
  process.exitCode = 1;
} else {
  console.log(`Approved specification profile remains identifiable: ${pin.approvedSnapshot}`);
}
