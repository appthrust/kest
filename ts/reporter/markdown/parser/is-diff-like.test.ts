import { expect, test } from "bun:test";
import { isDiffLike } from "./index";

test("returns true when message contains both + and - lines", () => {
  const message = [
    " unchanged",
    "-removed line",
    "+added line",
    " unchanged",
  ].join("\n");
  expect(isDiffLike(message)).toBe(true);
});

test("returns true with typical diff output", () => {
  const message = [
    "--- a/file.txt",
    "+++ b/file.txt",
    "@@ -1,3 +1,3 @@",
    " line1",
    "-old line",
    "+new line",
    " line3",
  ].join("\n");
  expect(isDiffLike(message)).toBe(true);
});

test("returns false when only + lines exist", () => {
  const message = ["+added line 1", "+added line 2"].join("\n");
  expect(isDiffLike(message)).toBe(false);
});

test("returns false when only - lines exist", () => {
  const message = ["-removed line 1", "-removed line 2"].join("\n");
  expect(isDiffLike(message)).toBe(false);
});

test("returns false for plain text without diff markers", () => {
  expect(isDiffLike("just a normal error message")).toBe(false);
});

test("returns false for empty string", () => {
  expect(isDiffLike("")).toBe(false);
});

test("ignores --- lines (not counted as minus)", () => {
  const message = ["--- a/file.txt", "+added line"].join("\n");
  expect(isDiffLike(message)).toBe(false);
});

test("ignores +++ lines (not counted as plus)", () => {
  const message = ["+++ b/file.txt", "-removed line"].join("\n");
  expect(isDiffLike(message)).toBe(false);
});

test("returns false when only --- and +++ lines exist", () => {
  const message = ["--- a/file.txt", "+++ b/file.txt"].join("\n");
  expect(isDiffLike(message)).toBe(false);
});

test("handles \\r\\n line endings", () => {
  const message = "-removed line\r\n+added line";
  expect(isDiffLike(message)).toBe(true);
});

test("returns true when - line comes before + line", () => {
  const message = ["-removed", "+added"].join("\n");
  expect(isDiffLike(message)).toBe(true);
});

test("returns true when + line comes before - line", () => {
  const message = ["+added", "-removed"].join("\n");
  expect(isDiffLike(message)).toBe(true);
});

test("returns true with multiline diff containing many changes", () => {
  const message = [
    " context",
    "-old1",
    "-old2",
    "+new1",
    "+new2",
    " context",
  ].join("\n");
  expect(isDiffLike(message)).toBe(true);
});

test("returns true with bun test toMatchObject failure output", () => {
  const message = [
    "expect(received).toMatchObject(expected)",
    "",
    "  {",
    '    "data": {',
    '-     "mode": "demo",',
    '+     "mode": "demo-1",',
    "    },",
    "  }",
  ].join("\n");
  expect(isDiffLike(message)).toBe(true);
});

test("returns true with bun test toEqual failure output", () => {
  const message = [
    "expect(received).toEqual(expected)",
    "",
    "- Expected  - 1",
    "+ Received  + 1",
    "",
    "  Object {",
    '-   "key": "expected",',
    '+   "key": "actual",',
    "  }",
  ].join("\n");
  expect(isDiffLike(message)).toBe(true);
});

test("does not handle ANSI codes (caller should strip them first)", () => {
  // isDiffLike expects plain text; ANSI-colored input should be
  // pre-processed with stripAnsi before calling isDiffLike.
  const message = [
    '\x1b[31m-     "mode": "demo",\x1b[39m',
    '\x1b[32m+     "mode": "demo-1",\x1b[39m',
  ].join("\n");
  expect(isDiffLike(message)).toBe(false);
});
