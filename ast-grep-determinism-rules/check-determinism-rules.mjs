import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AST_GREP_PACKAGE = "@ast-grep/cli@0.45.3";

const configPath = fileURLToPath(new URL("./sgconfig.yml", import.meta.url));
const targets = process.argv.slice(2);
if (targets.length === 0) {
  process.stderr.write("Usage: check-determinism-rules.mjs <path> [path ...]\n");
  process.exitCode = 2;
} else {
  const scan = spawnSync(
    "npx",
    [
      "--yes",
      "--package",
      AST_GREP_PACKAGE,
      "ast-grep",
      "scan",
      "--config",
      configPath,
      "--json=compact",
      ...targets,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (scan.error) {
    throw scan.error;
  }
  if (scan.status !== 0 && !scan.stdout.trim()) {
    throw new Error(`ast-grep scan failed: ${scan.stderr}`);
  }

  const findings = JSON.parse(scan.stdout);
  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(
        `${finding.file}:${finding.range.start.line + 1} [${finding.ruleId}] ${finding.message}\n`,
      );
    }
    process.exitCode = 1;
  } else {
    process.stdout.write(`Determinism rules passed for ${targets.join(", ")}.\n`);
  }
}
