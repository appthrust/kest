import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSnippet } from "./read-snippet";

function tmpFile(): string {
  return join(
    tmpdir(),
    `test-snippet-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`
  );
}

const sampleContent = Array.from(
  { length: 30 },
  (_, i) => `line ${i + 1}`
).join("\n");

test("reads snippet around the given line", async () => {
  const path = tmpFile();
  await Bun.write(path, sampleContent);

  const result = await readSnippet(path, 20, 5);
  expect(result).toEqual({
    lines: [
      { lineNumber: 15, code: "line 15" },
      { lineNumber: 16, code: "line 16" },
      { lineNumber: 17, code: "line 17" },
      { lineNumber: 18, code: "line 18" },
      { lineNumber: 19, code: "line 19" },
      { lineNumber: 20, code: "line 20" },
    ],
    caretCol: 5,
  });
});

test("returns fewer lines when error is near beginning of file", async () => {
  const path = tmpFile();
  await Bun.write(path, sampleContent);

  const result = await readSnippet(path, 3, 10);
  expect(result).toEqual({
    lines: [
      { lineNumber: 1, code: "line 1" },
      { lineNumber: 2, code: "line 2" },
      { lineNumber: 3, code: "line 3" },
    ],
    caretCol: 10,
  });
});

test("returns single line when error is on line 1", async () => {
  const path = tmpFile();
  await Bun.write(path, sampleContent);

  const result = await readSnippet(path, 1, 1);
  expect(result).toEqual({
    lines: [{ lineNumber: 1, code: "line 1" }],
    caretCol: 1,
  });
});

test("returns undefined for file not found", async () => {
  const result = await readSnippet("/nonexistent/path/file.ts", 10, 5);
  expect(result).toBeUndefined();
});

test("returns undefined when line exceeds file length", async () => {
  const path = tmpFile();
  await Bun.write(path, "only one line");

  const result = await readSnippet(path, 100, 1);
  expect(result).toBeUndefined();
});

test("returns undefined when line is 0", async () => {
  const path = tmpFile();
  await Bun.write(path, sampleContent);

  const result = await readSnippet(path, 0, 1);
  expect(result).toBeUndefined();
});

test("returns undefined when line is negative", async () => {
  const path = tmpFile();
  await Bun.write(path, sampleContent);

  const result = await readSnippet(path, -1, 1);
  expect(result).toBeUndefined();
});

test("respects custom contextLines parameter", async () => {
  const path = tmpFile();
  await Bun.write(path, sampleContent);

  const result = await readSnippet(path, 20, 3, 2);
  expect(result).toEqual({
    lines: [
      { lineNumber: 18, code: "line 18" },
      { lineNumber: 19, code: "line 19" },
      { lineNumber: 20, code: "line 20" },
    ],
    caretCol: 3,
  });
});

test("handles contextLines of 0 (only the error line)", async () => {
  const path = tmpFile();
  await Bun.write(path, sampleContent);

  const result = await readSnippet(path, 15, 7, 0);
  expect(result).toEqual({
    lines: [{ lineNumber: 15, code: "line 15" }],
    caretCol: 7,
  });
});

test("handles last line of file", async () => {
  const path = tmpFile();
  await Bun.write(path, sampleContent);

  const result = await readSnippet(path, 30, 1);
  expect(result).toEqual({
    lines: [
      { lineNumber: 25, code: "line 25" },
      { lineNumber: 26, code: "line 26" },
      { lineNumber: 27, code: "line 27" },
      { lineNumber: 28, code: "line 28" },
      { lineNumber: 29, code: "line 29" },
      { lineNumber: 30, code: "line 30" },
    ],
    caretCol: 1,
  });
});

test("handles file with empty lines", async () => {
  const path = tmpFile();
  await Bun.write(path, "line 1\n\nline 3\n\nline 5");

  const result = await readSnippet(path, 3, 2);
  expect(result).toEqual({
    lines: [
      { lineNumber: 1, code: "line 1" },
      { lineNumber: 2, code: "" },
      { lineNumber: 3, code: "line 3" },
    ],
    caretCol: 2,
  });
});
