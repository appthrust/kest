import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderTrace } from "./render";

function tmpFile(): string {
  return join(
    tmpdir(),
    `test-render-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`
  );
}

describe("renderTrace", () => {
  test("full trace with snippet and frames", async () => {
    const filePath = tmpFile();
    const lines = [
      "import { test } from 'bun:test';",
      "",
      "test('example', () => {",
      "  const x = 1;",
      "  const y = 2;",
      "  expect(x).toBe(y);",
      "});",
    ];
    await Bun.write(filePath, lines.join("\n"));

    const rawStack = [
      "Error: expect(received).toBe(expected)",
      "    at toBe (unknown:1:1)",
      `    at ${filePath}:6:14`,
      "    at moduleEvaluation (native:1:11)",
    ].join("\n");

    const result = await renderTrace(rawStack, {
      workspaceRoot: tmpdir(),
    });

    expect(result).toBe(
      [
        "1 | import { test } from 'bun:test';",
        "2 | ",
        "3 | test('example', () => {",
        "4 |   const x = 1;",
        "5 |   const y = 2;",
        "6 |   expect(x).toBe(y);",
        "                 ^",
        "",
        "at toBe (unknown:1:1)",
        `at ${filePath}:6:14`,
        "at moduleEvaluation (native:1:11)",
      ].join("\n")
    );
  });

  test("snippet with multi-digit line numbers pads correctly", async () => {
    const filePath = tmpFile();
    // Create file with 100+ lines
    const fileLines = Array.from({ length: 105 }, (_, i) => `line ${i + 1}`);
    await Bun.write(filePath, fileLines.join("\n"));

    const rawStack = ["Error: boom", `    at ${filePath}:103:3`].join("\n");

    const result = await renderTrace(rawStack, {
      workspaceRoot: tmpdir(),
    });

    expect(result).toBe(
      [
        " 98 | line 98",
        " 99 | line 99",
        "100 | line 100",
        "101 | line 101",
        "102 | line 102",
        "103 | line 103",
        "        ^",
        "",
        `at ${filePath}:103:3`,
      ].join("\n")
    );
  });

  test("trace without workspaceRoot returns frames only", async () => {
    const rawStack = [
      "Error: something",
      "    at doStuff (/project/src/index.ts:10:5)",
      "    at /project/src/helper.ts:20:3",
    ].join("\n");

    const result = await renderTrace(rawStack, {});

    expect(result).toBe(
      [
        "at doStuff (/project/src/index.ts:10:5)",
        "at /project/src/helper.ts:20:3",
      ].join("\n")
    );
  });

  test("trace with unreadable file returns frames only", async () => {
    const rawStack = [
      "Error: gone",
      "    at /nonexistent/file.ts:5:10",
      "    at main (/project/src/index.ts:1:1)",
    ].join("\n");

    const result = await renderTrace(rawStack, {
      workspaceRoot: "/nonexistent",
    });

    expect(result).toBe(
      [
        "at /nonexistent/file.ts:5:10",
        "at main (/project/src/index.ts:1:1)",
      ].join("\n")
    );
  });

  test("all-library frames (no user frame) returns frames only", async () => {
    const workspaceRoot = "/workspace/project";
    const rawStack = [
      "Error: internal",
      "    at toMatchObject (unknown:1:1)",
      `    at ${workspaceRoot}/ts/actions/assert.ts:32:19`,
      `    at ${workspaceRoot}/node_modules/some-lib/index.js:5:3`,
      "    at moduleEvaluation (native:1:11)",
    ].join("\n");

    const result = await renderTrace(rawStack, { workspaceRoot });

    expect(result).toBe(
      [
        "at toMatchObject (unknown:1:1)",
        `at ${workspaceRoot}/ts/actions/assert.ts:32:19`,
        `at ${workspaceRoot}/node_modules/some-lib/index.js:5:3`,
        "at moduleEvaluation (native:1:11)",
      ].join("\n")
    );
  });

  test("empty stack string returns undefined", async () => {
    const result = await renderTrace("", {});
    expect(result).toBeUndefined();
  });

  test("invalid stack string with no at-lines returns undefined", async () => {
    const rawStack = [
      "Error: just a message",
      "no frames here",
      "nothing parseable",
    ].join("\n");

    const result = await renderTrace(rawStack, {});
    expect(result).toBeUndefined();
  });

  test("caret position accounts for gutter width", async () => {
    const filePath = tmpFile();
    const fileLines = ["alpha", "beta", "gamma"];
    await Bun.write(filePath, fileLines.join("\n"));

    const rawStack = ["Error: err", `    at ${filePath}:2:3`].join("\n");

    const result = await renderTrace(rawStack, {
      workspaceRoot: tmpdir(),
    });

    expect(result).toBe(
      ["1 | alpha", "2 | beta", "      ^", "", `at ${filePath}:2:3`].join("\n")
    );
  });

  test("handles frames with and without function names", async () => {
    const rawStack = [
      "Error: mixed",
      "    at named (/a.ts:1:1)",
      "    at /b.ts:2:2",
      "    at async asyncNamed (/c.ts:3:3)",
    ].join("\n");

    const result = await renderTrace(rawStack, {});

    expect(result).toBe(
      [
        "at named (/a.ts:1:1)",
        "at /b.ts:2:2",
        "at asyncNamed (/c.ts:3:3)",
      ].join("\n")
    );
  });
});

// ANSI helper to build expected values
function fgExpect(hex: string, s: string): string {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
}

function fgBoldExpect(hex: string, s: string): string {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `\x1b[1;38;2;${r};${g};${b}m${s}\x1b[0m`;
}

// Catppuccin Mocha palette
const overlay0 = "#6c7086";
const subtext0 = "#a6adc8";
const textColor = "#cdd6f4";
const peach = "#fab387";
const flamingo = "#f2cdcd";
const red = "#f38ba8";
const maroon = "#eba0ac";

function stripAnsi(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require control characters
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("renderTrace ANSI", () => {
  test("ANSI frames have correct colors for normal frame with funcName", async () => {
    const workspaceRoot = "/ws/project";
    const rawStack = [
      "Error: boom",
      `    at doStuff (${workspaceRoot}/src/helper.ts:10:5)`,
    ].join("\n");

    const result = await renderTrace(rawStack, {
      workspaceRoot,
      enableANSI: true,
    });

    if (result == null) {
      throw new Error("result is undefined");
    }
    const lines = result.split("\n");
    // Only one frame, no snippet (file doesn't exist)
    const frameLine = lines[0];

    // Verify each ANSI-colored part is present
    expect(frameLine).toContain(fgExpect(overlay0, "at"));
    expect(frameLine).toContain(fgExpect(textColor, "doStuff"));
    expect(frameLine).toContain(fgExpect(overlay0, "("));
    expect(frameLine).toContain(fgExpect(subtext0, `${workspaceRoot}/`));
    expect(frameLine).toContain(fgExpect(peach, "src/helper.ts"));
    expect(frameLine).toContain(fgExpect(overlay0, ":"));
    expect(frameLine).toContain(fgExpect(flamingo, "10"));
    expect(frameLine).toContain(fgExpect(overlay0, "5"));
    expect(frameLine).toContain(fgExpect(overlay0, ")"));
  });

  test("ANSI frames without funcName omit parens", async () => {
    const workspaceRoot = "/ws/project";
    const rawStack = [
      "Error: boom",
      `    at ${workspaceRoot}/src/index.ts:20:3`,
    ].join("\n");

    const result = await renderTrace(rawStack, {
      workspaceRoot,
      enableANSI: true,
    });

    expect(result).toBeDefined();
    const frameLine = result?.split("\n")[0];

    expect(frameLine).toContain(fgExpect(overlay0, "at"));
    expect(frameLine).toContain(fgExpect(subtext0, `${workspaceRoot}/`));
    expect(frameLine).toContain(fgExpect(peach, "src/index.ts"));
    expect(frameLine).toContain(fgExpect(flamingo, "20"));
    // No parens
    expect(frameLine).not.toContain(fgExpect(overlay0, "("));
    expect(frameLine).not.toContain(fgExpect(overlay0, ")"));
  });

  test("snippet source frame gets bold Red/Maroon colors", async () => {
    const filePath = tmpFile();
    const workspaceRoot = tmpdir();
    await Bun.write(filePath, "line1\nline2\nline3\n");

    const rawStack = ["Error: fail", `    at ${filePath}:2:3`].join("\n");

    const result = await renderTrace(rawStack, {
      workspaceRoot,
      enableANSI: true,
    });

    if (result == null) {
      throw new Error("result is undefined");
    }
    const lines = result.split("\n");
    // Last line should be the frame (after snippet + blank line)
    const frameLine = lines.at(-1);

    // File part should be bold Red
    const relPath = filePath.slice(
      (workspaceRoot.endsWith("/") ? workspaceRoot : `${workspaceRoot}/`).length
    );
    expect(frameLine).toContain(fgBoldExpect(red, relPath));
    // Line number should be bold Maroon
    expect(frameLine).toContain(fgBoldExpect(maroon, "2"));
  });

  test("same file but different line gets normal colors, not snippet source", async () => {
    const filePath = tmpFile();
    const workspaceRoot = tmpdir();
    await Bun.write(filePath, "line1\nline2\nline3\nline4\nline5\n");

    const rawStack = [
      "Error: fail",
      `    at ${filePath}:2:3`,
      `    at ${filePath}:5:1`,
    ].join("\n");

    const result = await renderTrace(rawStack, {
      workspaceRoot,
      enableANSI: true,
    });

    if (result == null) {
      throw new Error("result is undefined");
    }
    const lines = result.split("\n");
    // Last two lines are frames
    const frame2 = lines.at(-1);

    // Second frame (line 5) should use normal Peach/Flamingo, not bold Red/Maroon
    expect(frame2).toContain(fgExpect(flamingo, "5"));
    expect(frame2).not.toContain(fgBoldExpect(maroon, "5"));
  });

  test("ANSI snippet uses Shiki highlighting with bold Maroon caret", async () => {
    const filePath = tmpFile();
    const workspaceRoot = tmpdir();
    await Bun.write(filePath, "const x = 1;\nconst y = 2;\n");

    const rawStack = ["Error: fail", `    at ${filePath}:2:7`].join("\n");

    const result = await renderTrace(rawStack, {
      workspaceRoot,
      enableANSI: true,
    });

    if (result == null) {
      throw new Error("result is undefined");
    }
    const lines = result.split("\n");

    // The caret line should contain bold Maroon "^"
    // Find the caret line (contains "^" when stripped)
    const caretLine = lines.find((l) => stripAnsi(l).trim() === "^");
    expect(caretLine).toBeDefined();
    expect(caretLine).toContain(fgBoldExpect(maroon, `${" ".repeat(10)}^`));

    // Snippet lines should contain ANSI codes (from Shiki)
    expect(lines[0]).toContain("\x1b[");
  });

  test("ANSI frame without workspaceRoot has no subtext0 root part", async () => {
    const rawStack = [
      "Error: boom",
      "    at doStuff (/some/path/file.ts:10:5)",
    ].join("\n");

    const result = await renderTrace(rawStack, {
      enableANSI: true,
    });

    expect(result).toBeDefined();
    const frameLine = result?.split("\n")[0];

    // No subtext0 root part
    expect(frameLine).not.toContain(fgExpect(subtext0, "/some/path/"));
    // Entire path is Peach
    expect(frameLine).toContain(fgExpect(peach, "/some/path/file.ts"));
  });

  test("ANSI plain-text content matches non-ANSI when stripped", async () => {
    const rawStack = [
      "Error: something",
      "    at doStuff (/project/src/index.ts:10:5)",
      "    at /project/src/helper.ts:20:3",
    ].join("\n");

    const ansiResult = await renderTrace(rawStack, { enableANSI: true });
    const plainResult = await renderTrace(rawStack, {});

    if (ansiResult == null) {
      throw new Error("ansiResult is undefined");
    }
    if (plainResult == null) {
      throw new Error("plainResult is undefined");
    }

    // Stripped ANSI should match plain text
    expect(stripAnsi(ansiResult)).toBe(plainResult);
  });
});
