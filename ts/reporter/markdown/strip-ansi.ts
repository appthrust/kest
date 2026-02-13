export function stripAnsi(input: string): string {
  // Prefer Bun's built-in ANSI stripper when available.
  if (typeof Bun !== "undefined" && typeof Bun.stripANSI === "function") {
    return Bun.stripANSI(input);
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intended
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}
