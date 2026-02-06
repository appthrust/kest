import { expect, test } from "bun:test";
import { exec } from "./exec";

test("exec returns output and calls revert", async () => {
  let reverted = false;
  let sawShell = false;
  let sawShellOnRevert = false;

  const fn = exec.mutate();
  const { output, revert } = await fn({
    do: ({ $ }) => {
      sawShell = typeof $ === "function";
      return Promise.resolve("my-output");
    },
    revert: ({ $ }) => {
      sawShellOnRevert = typeof $ === "function";
      reverted = true;
      return Promise.resolve();
    },
  });

  expect(output).toBe("my-output");
  expect(sawShell).toBe(true);
  expect(reverted).toBe(false);

  await revert();
  expect(sawShellOnRevert).toBe(true);
  expect(reverted).toBe(true);
});

test("exec provides noop revert when omitted", async () => {
  const fn = exec.mutate();
  const { output, revert } = await fn({
    do: () => Promise.resolve(123),
  });

  expect(output).toBe(123);
  await revert(); // should not throw
});
