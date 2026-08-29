import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { z } from "zod";

const { values, positionals } = parseArgs({
  options: {
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
  strict: true,
});

const usage = "Usage: node validate.mjs <fixture.json>";
if (values.help) {
  console.log(usage);
  process.exit(0);
}
if (positionals.length !== 1) throw new Error(usage);

const itemSchema = z.strictObject({ id: z.string().min(1) });
const responseSchema = z
  .strictObject({
    items: z.array(itemSchema).min(1),
    summary: z.strictObject({ total: z.int().nonnegative() }),
  })
  .refine((value) => value.summary.total === value.items.length, {
    path: ["summary", "total"],
    message: "Summary total must equal the number of items.",
  });

const jsonSchema = JSON.parse(
  await readFile(new URL("response.schema.json", import.meta.url), "utf8"),
);
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateJsonSchema = ajv.compile(jsonSchema);

const value = JSON.parse(await readFile(positionals[0], "utf8"));
const zodResult = responseSchema.safeParse(value);
const jsonSchemaValid = validateJsonSchema(value);

console.log(`${zodResult.success ? "PASS" : "FAIL"} canonical Zod schema`);
if (!zodResult.success) {
  for (const issue of zodResult.error.issues) {
    console.log(`  /${issue.path.map(String).join("/")}: ${issue.message}`);
  }
}

console.log(`${jsonSchemaValid ? "PASS" : "FAIL"} published JSON Schema`);
for (const error of validateJsonSchema.errors ?? []) {
  console.log(`  ${error.instancePath || "/"}: ${error.message}`);
}

process.exit(zodResult.success && jsonSchemaValid ? 0 : 1);
