import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source");
const prefixIndex = args.indexOf("--prefix");
const sourcePath = resolve(
  sourceIndex === -1 ? "spec-references.example.mjs" : args[sourceIndex + 1],
);
const prefix = prefixIndex === -1 ? "https://www.w3.org/" : args[prefixIndex + 1];
if (!prefix.startsWith("https://")) throw new Error("--prefix must be an https:// URL prefix.");

const stat = await lstat(sourcePath);
if (!stat.isFile() || stat.size > 256 * 1024)
  throw new Error(`${sourcePath} must be a regular file no larger than 256 KiB.`);
const bytes = await readFile(sourcePath);
if (bytes.byteLength > 256 * 1024)
  throw new Error(`${sourcePath} exceeded its post-read byte limit.`);

const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const urlPattern = new RegExp(`${escapedPrefix}[^"'\\s)]+`, "gu");
const urls = [...new Set(bytes.toString("utf8").match(urlPattern) ?? [])];
if (urls.length === 0) throw new Error(`${sourcePath} contains no URLs starting with ${prefix}.`);

const pages = new Map();
for (const value of urls) {
  const url = new URL(value);
  const fragment = url.hash.slice(1);
  url.hash = "";
  const key = url.href;
  if (!pages.has(key)) pages.set(key, new Set());
  if (fragment) pages.get(key).add(decodeURIComponent(fragment));
}

async function readBodyBounded(response, limit) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const failures = [];
for (const [page, fragments] of pages) {
  const response = await fetch(page, {
    headers: { "User-Agent": "pinned-spec-reference-check" },
  });
  if (!response.ok) {
    failures.push(`${page}: ${response.status}`);
    continue;
  }
  const text = await readBodyBounded(response, 8 * 1024 * 1024);
  if (text === null) {
    failures.push(`${page}: response exceeded 8 MiB`);
    continue;
  }
  for (const fragment of fragments) {
    const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    if (!new RegExp(`(?:id|name)=["']${escaped}["']`, "u").test(text))
      failures.push(`${page}#${fragment}: anchor not found`);
  }
}

if (failures.length > 0) {
  console.error(`Specification link check failed:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${urls.length} specification reference(s) across ${pages.size} page(s).`);
}
