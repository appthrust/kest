import { describe, expect, test } from "bun:test";
import { findUserFrame } from "./find-user-frame";
import type { StackFrame } from "./parse-stack";

const workspaceRoot = "/Users/dev/project";

function frame(filePath: string, opts?: { funcName?: string }): StackFrame {
  return { filePath, line: 10, col: 5, ...opts };
}

describe("findUserFrame", () => {
  test("returns user code frame from mixed stack with kest internals", () => {
    const frames: Array<StackFrame> = [
      frame("unknown:1:1", { funcName: "toMatchObject" }),
      frame(`${workspaceRoot}/ts/actions/assert.ts`),
      frame(`${workspaceRoot}/ts/retry.ts`),
      frame(`${workspaceRoot}/example/example.test.ts`, {
        funcName: "test",
      }),
      frame(`${workspaceRoot}/ts/test.ts`),
    ];
    const result = findUserFrame(frames, workspaceRoot);
    expect(result).toEqual(
      frame(`${workspaceRoot}/example/example.test.ts`, {
        funcName: "test",
      })
    );
  });

  test("returns undefined when all frames are library code", () => {
    const frames: Array<StackFrame> = [
      frame("unknown:1:1"),
      frame(`${workspaceRoot}/ts/actions/assert.ts`),
      frame(`${workspaceRoot}/ts/retry.ts`),
      frame(`${workspaceRoot}/ts/test.ts`),
    ];
    expect(findUserFrame(frames, workspaceRoot)).toBeUndefined();
  });

  test("skips node_modules frames", () => {
    const frames: Array<StackFrame> = [
      frame(`${workspaceRoot}/node_modules/some-lib/index.js`),
      frame(`${workspaceRoot}/node_modules/@scope/pkg/dist/main.js`),
      frame(`${workspaceRoot}/src/app.test.ts`),
    ];
    const result = findUserFrame(frames, workspaceRoot);
    expect(result).toEqual(frame(`${workspaceRoot}/src/app.test.ts`));
  });

  test("skips native frames", () => {
    const frames: Array<StackFrame> = [
      frame("native:something"),
      frame(`${workspaceRoot}/src/app.test.ts`),
    ];
    const result = findUserFrame(frames, workspaceRoot);
    expect(result).toEqual(frame(`${workspaceRoot}/src/app.test.ts`));
  });

  test("skips frames with filePath starting with <", () => {
    const frames: Array<StackFrame> = [
      frame("<anonymous>"),
      frame("<bun internals>"),
      frame(`${workspaceRoot}/src/app.test.ts`),
    ];
    const result = findUserFrame(frames, workspaceRoot);
    expect(result).toEqual(frame(`${workspaceRoot}/src/app.test.ts`));
  });

  test("returns user frame when it is the first frame", () => {
    const frames: Array<StackFrame> = [
      frame(`${workspaceRoot}/tests/unit.test.ts`),
      frame(`${workspaceRoot}/ts/retry.ts`),
    ];
    const result = findUserFrame(frames, workspaceRoot);
    expect(result).toEqual(frame(`${workspaceRoot}/tests/unit.test.ts`));
  });

  test("returns user frame when it is the last frame", () => {
    const frames: Array<StackFrame> = [
      frame("unknown:1:1"),
      frame(`${workspaceRoot}/ts/actions/assert.ts`),
      frame(`${workspaceRoot}/ts/retry.ts`),
      frame(`${workspaceRoot}/tests/integration.test.ts`),
    ];
    const result = findUserFrame(frames, workspaceRoot);
    expect(result).toEqual(frame(`${workspaceRoot}/tests/integration.test.ts`));
  });

  test("returns user frame when it is in the middle", () => {
    const frames: Array<StackFrame> = [
      frame("unknown:1:1"),
      frame(`${workspaceRoot}/example/example.test.ts`),
      frame(`${workspaceRoot}/ts/test.ts`),
    ];
    const result = findUserFrame(frames, workspaceRoot);
    expect(result).toEqual(frame(`${workspaceRoot}/example/example.test.ts`));
  });

  test("normalizes workspaceRoot without trailing slash", () => {
    const frames: Array<StackFrame> = [
      frame("/Users/dev/project/ts/actions/assert.ts"),
      frame("/Users/dev/project/src/app.test.ts"),
    ];
    const result = findUserFrame(frames, "/Users/dev/project");
    expect(result).toEqual(frame("/Users/dev/project/src/app.test.ts"));
  });

  test("normalizes workspaceRoot with trailing slash", () => {
    const frames: Array<StackFrame> = [
      frame("/Users/dev/project/ts/actions/assert.ts"),
      frame("/Users/dev/project/src/app.test.ts"),
    ];
    const result = findUserFrame(frames, "/Users/dev/project/");
    expect(result).toEqual(frame("/Users/dev/project/src/app.test.ts"));
  });

  test("returns undefined for empty frames array", () => {
    expect(findUserFrame([], workspaceRoot)).toBeUndefined();
  });

  test("does not skip ts/ paths outside workspaceRoot", () => {
    const frames: Array<StackFrame> = [
      frame("/other/workspace/ts/something.ts"),
    ];
    const result = findUserFrame(frames, workspaceRoot);
    expect(result).toEqual(frame("/other/workspace/ts/something.ts"));
  });
});
