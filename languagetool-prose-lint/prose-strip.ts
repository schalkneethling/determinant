/**
 * Markdown → prose stripping for the prose-lint gate (ADR-0012).
 *
 * Removes the content classes that are not prose while preserving the
 * line grid, so LanguageTool findings map back to real file lines:
 *   - fenced code blocks → blank lines. Fences follow CommonMark
 *     closing rules: a fence closes only on a delimiter of the SAME
 *     character (backtick or tilde) with at least the opening run's
 *     length and no info string — so a ``` line inside a ```` block is
 *     content, not a closer.
 *   - inline code spans → a neutral noun ("code"/"item", chosen by the
 *     span's first letter so a/an agreement stays checkable)
 *   - URLs, bare identifiers (camelCase / dotted / digit-bearing),
 *     table rows → neutralized
 */
export function stripToProse(markdown: string): string {
  const out: string[] = [];
  let fence: { char: string; len: number } | null = null;
  for (const line of markdown.split("\n")) {
    // CommonMark: a fence delimiter may be indented at most 3 spaces;
    // 4+ is an indented code block line, which is not fence state.
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (m?.[1] !== undefined) {
      const delim = m[1];
      const rest = m[2] ?? "";
      const char = delim.charAt(0);
      if (fence === null) {
        fence = { char, len: delim.length };
        out.push("");
        continue;
      }
      if (char === fence.char && delim.length >= fence.len && rest.trim() === "") {
        fence = null;
      }
      // A shorter or mismatched delimiter inside an open fence is content.
      out.push("");
      continue;
    }
    if (fence !== null) {
      out.push("");
      continue;
    }
    let l = line;
    // Inline code → neutral noun, space-padded so it never glues to
    // adjacent characters, preserving the vowel/consonant start so a/an
    // agreement in the surrounding prose stays checkable.
    l = l.replace(/`([^`]*)`/g, (_m, inner: string) =>
      /^[aeiouAEIOU]/.test(inner) ? " item " : " code ",
    );
    l = l.replace(/https?:\/\/\S+/g, "url");
    // Bare identifiers in prose (camelCase, dotted, digit-bearing, or
    // path-like tokens) are not words; neutralize before spell-check.
    l = l.replace(/\b\w*(?:[a-z][A-Z]|\w\.\w|\d)\w*(?:[./-]\w+)*\b/g, "code");
    // Collapse placeholder runs so the word-repeat rule sees one token,
    // and re-attach possessives split by the space padding.
    l = l.replace(/\b(?:code|item)(?:\W+(?:code|item))+\b/g, "code");
    l = l.replace(/\b(code|item) '/g, "$1'");
    l = l.replace(/ {2,}/g, " ");
    l = l.replace(/^\s*\|.*\|\s*$/g, ""); // table rows: cells are fragments, not sentences
    out.push(l);
  }
  return out.join("\n");
}
