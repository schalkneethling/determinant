import { describe, expect, it } from "vitest";
import { stripToProse } from "./prose-strip.js";

describe("stripToProse fences", () => {
  it("keeps a triple-backtick delimiter inside a four-backtick fence as content", () => {
    const md = [
      "Before.",
      "````markdown",
      "```js",
      "still fenced",
      "```",
      "also still fenced",
      "````",
      "After.",
    ].join("\n");
    const lines = stripToProse(md).split("\n");
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe("Before.");
    // Everything from the ```` opener through its closer is blanked,
    // including the inner ``` lines and the text between them.
    for (const i of [1, 2, 3, 4, 5, 6]) expect(lines[i]).toBe("");
    expect(lines[7]).toBe("After.");
  });

  it("does not close a backtick fence with a tilde delimiter", () => {
    const md = ["```", "~~~", "inside", "```", "outside prose."].join("\n");
    const lines = stripToProse(md).split("\n");
    expect(lines[1]).toBe(""); // ~~~ is content of the open backtick fence
    expect(lines[2]).toBe("");
    expect(lines[4]).toBe("outside prose.");
  });

  it("requires the closing run to be at least the opening length", () => {
    const md = ["`````", "```", "inside", "`````", "outside prose."].join("\n");
    const lines = stripToProse(md).split("\n");
    expect(lines[2]).toBe("");
    expect(lines[4]).toBe("outside prose.");
  });

  it("still closes ordinary fences and preserves the line grid", () => {
    const md = ["One.", "```text", "x = 1", "```", "Two."].join("\n");
    const lines = stripToProse(md).split("\n");
    expect(lines).toEqual(["One.", "", "", "", "Two."]);
  });
});

describe("stripToProse indented code blocks", () => {
  it("does not enter fence state on a 4-space-indented delimiter line", () => {
    const md = [
      "Prose before.",
      "    ```",
      "Prose after stays visible.",
    ].join("\n");
    const lines = stripToProse(md).split("\n");
    expect(lines[2]).toBe("Prose after stays visible.");
  });

  it("still opens a fence indented up to 3 spaces", () => {
    const md = ["   ```", "hidden", "   ```", "visible."].join("\n");
    const lines = stripToProse(md).split("\n");
    expect(lines[1]).toBe("");
    expect(lines[3]).toBe("visible.");
  });
});
