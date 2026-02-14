import { describe, expect, test } from "bun:test";
import { parseStack } from "./parse-stack";

describe("parseStack", () => {
  test("parses standard Bun stack with message and frames", () => {
    const stack = [
      "Error: real throw",
      "    at inner (/path/to/file.ts:5:13)",
      "    at outer (/path/to/file.ts:8:3)",
      "    at /path/to/file.ts:11:3",
      "    at moduleEvaluation (native:1:11)",
    ].join("\n");

    expect(parseStack(stack)).toEqual([
      { funcName: "inner", filePath: "/path/to/file.ts", line: 5, col: 13 },
      { funcName: "outer", filePath: "/path/to/file.ts", line: 8, col: 3 },
      { filePath: "/path/to/file.ts", line: 11, col: 3 },
      { funcName: "moduleEvaluation", filePath: "native", line: 1, col: 11 },
    ]);
  });

  test("parses Bun stack with diff output in message", () => {
    const stack = [
      "Error: expect(received).toMatchObject(expected)",
      "",
      "  {",
      '-   "mode": "expected",',
      '+   "mode": "actual",',
      "  }",
      "",
      "- Expected  - 1",
      "+ Received  + 1",
      "",
      "    at toMatchObject (unknown:1:1)",
      "    at /Users/suin/project/example/example.test.ts:5:30",
      "    at moduleEvaluation (native:1:11)",
    ].join("\n");

    expect(parseStack(stack)).toEqual([
      { funcName: "toMatchObject", filePath: "unknown", line: 1, col: 1 },
      {
        filePath: "/Users/suin/project/example/example.test.ts",
        line: 5,
        col: 30,
      },
      { funcName: "moduleEvaluation", filePath: "native", line: 1, col: 11 },
    ]);
  });

  test("parses Bun stack with code snippet lines (NNN | ...)", () => {
    const stack = [
      "Error: boom",
      "      10 |   const x = 1;",
      "      11 |   throw new Error('boom');",
      "                ^",
      "    at fn (/path/to/file.ts:11:12)",
      "    at /path/to/file.ts:20:5",
    ].join("\n");

    expect(parseStack(stack)).toEqual([
      { funcName: "fn", filePath: "/path/to/file.ts", line: 11, col: 12 },
      { filePath: "/path/to/file.ts", line: 20, col: 5 },
    ]);
  });

  test("parses V8-style stack traces", () => {
    const stack = [
      "Error: something went wrong",
      "    at Object.<anonymous> (/project/src/index.ts:10:15)",
      "    at Module._compile (node:internal/modules/cjs/loader:1356:14)",
      "    at node:internal/modules/run_main:135:12",
    ].join("\n");

    expect(parseStack(stack)).toEqual([
      {
        funcName: "Object.<anonymous>",
        filePath: "/project/src/index.ts",
        line: 10,
        col: 15,
      },
      {
        funcName: "Module._compile",
        filePath: "node:internal/modules/cjs/loader",
        line: 1356,
        col: 14,
      },
      {
        filePath: "node:internal/modules/run_main",
        line: 135,
        col: 12,
      },
    ]);
  });

  test("parses async frames", () => {
    const stack = [
      "Error: async error",
      "    at async fetchData (/project/src/api.ts:20:10)",
      "    at async main (/project/src/index.ts:5:3)",
    ].join("\n");

    expect(parseStack(stack)).toEqual([
      {
        funcName: "fetchData",
        filePath: "/project/src/api.ts",
        line: 20,
        col: 10,
      },
      {
        funcName: "main",
        filePath: "/project/src/index.ts",
        line: 5,
        col: 3,
      },
    ]);
  });

  test("parses anonymous frames (bare file path without function name)", () => {
    const stack = [
      "Error: anon",
      "    at /project/src/index.ts:42:7",
      "    at /project/src/helper.ts:10:3",
    ].join("\n");

    expect(parseStack(stack)).toEqual([
      { filePath: "/project/src/index.ts", line: 42, col: 7 },
      { filePath: "/project/src/helper.ts", line: 10, col: 3 },
    ]);
  });

  test("parses native frames", () => {
    const stack = [
      "Error: native",
      "    at moduleEvaluation (native:1:11)",
      "    at processTicksAndRejections (native:7:38)",
    ].join("\n");

    expect(parseStack(stack)).toEqual([
      { funcName: "moduleEvaluation", filePath: "native", line: 1, col: 11 },
      {
        funcName: "processTicksAndRejections",
        filePath: "native",
        line: 7,
        col: 38,
      },
    ]);
  });

  test("parses frames with parenthesized location but no function name", () => {
    const stack = ["Error: paren", "    at (/project/src/index.ts:10:5)"].join(
      "\n"
    );

    expect(parseStack(stack)).toEqual([
      { filePath: "/project/src/index.ts", line: 10, col: 5 },
    ]);
  });

  test("returns empty array for empty string", () => {
    expect(parseStack("")).toEqual([]);
  });

  test("returns empty array for undefined-like input", () => {
    expect(parseStack(undefined as unknown as string)).toEqual([]);
    expect(parseStack(null as unknown as string)).toEqual([]);
  });

  test("returns empty array for string with no at-lines", () => {
    const stack = [
      "Error: just a message",
      "no stack frames here",
      "nothing to parse",
    ].join("\n");

    expect(parseStack(stack)).toEqual([]);
  });

  test("skips caret lines and snippet lines", () => {
    const stack = [
      "Error: boom",
      "      5 |   const x = doSomething();",
      "            ^",
      "    at doSomething (/path/to/file.ts:5:13)",
    ].join("\n");

    expect(parseStack(stack)).toEqual([
      {
        funcName: "doSomething",
        filePath: "/path/to/file.ts",
        line: 5,
        col: 13,
      },
    ]);
  });

  test("handles mixed async and sync frames", () => {
    const stack = [
      "Error: mixed",
      "    at sync1 (/path/a.ts:1:1)",
      "    at async async1 (/path/b.ts:2:2)",
      "    at /path/c.ts:3:3",
      "    at async /path/d.ts:4:4",
    ].join("\n");

    expect(parseStack(stack)).toEqual([
      { funcName: "sync1", filePath: "/path/a.ts", line: 1, col: 1 },
      { funcName: "async1", filePath: "/path/b.ts", line: 2, col: 2 },
      { filePath: "/path/c.ts", line: 3, col: 3 },
      { filePath: "/path/d.ts", line: 4, col: 4 },
    ]);
  });
});
