import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { runExpectedFailure, runGuardrails, usage } from "./lib/agent-lifecycle.mjs";

const MAX_ACCEPTANCE_READ_BYTES = 2 * 1024 * 1024;

async function criterionIsDeclared(criterion) {
  const acceptanceDirectory = join(process.cwd(), "docs", "acceptance");
  let entries;
  try {
    entries = await readdir(acceptanceDirectory);
  } catch {
    return false;
  }
  const headingPattern = new RegExp(`^##\\s+${criterion}\\b`, "m");
  for (const name of entries.filter((entry) => entry.endsWith(".md"))) {
    const filePath = join(acceptanceDirectory, name);
    const stat = await lstat(filePath);
    if (!stat.isFile() || stat.size > MAX_ACCEPTANCE_READ_BYTES) {
      continue;
    }
    if (headingPattern.test(await readFile(filePath, "utf8"))) {
      return true;
    }
  }
  return false;
}

const args = process.argv.slice(2);
const criterionIndex = args.indexOf("--criterion");
const separatorIndex = args.indexOf("--");
const criterion = criterionIndex === -1 ? undefined : args[criterionIndex + 1];

if (!criterion || !/^AC-[A-Z0-9]+-\d+$/.test(criterion)) {
  usage("Usage: agent-verify-red --criterion AC-AREA-001 -- <test command> [arguments]");
} else if (separatorIndex === -1 || separatorIndex === args.length - 1) {
  usage("RED verification requires one explicit test command after --.");
} else if (!(await criterionIsDeclared(criterion))) {
  usage(
    `Criterion ${criterion} is not declared as a heading in docs/acceptance/*.md; RED evidence must trace to a declared criterion.`,
  );
} else if (runGuardrails()) {
  const [command, ...commandArgs] = args.slice(separatorIndex + 1);
  if (runExpectedFailure(command, commandArgs)) {
    process.stdout.write(
      `RED evidence captured for ${criterion}. Record the intended failure in the issue or PR.\n`,
    );
  }
}
