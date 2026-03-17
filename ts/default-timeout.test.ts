import { expect, onTestFinished, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

test("setDefaultTimeout applies to all test files", () => {
  const tmpDir = join(import.meta.dir, ".tmp-default-timeout");
  mkdirSync(tmpDir, { recursive: true });
  onTestFinished(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const fixtureContent = `
import { test } from "${join(import.meta.dir, "test")}";
test("should timeout at KEST_DEFAULT_TIMEOUT", async () => {
  await Bun.sleep(10_000);
});
`;

  const file1 = join(tmpDir, "file1.test.ts");
  const file2 = join(tmpDir, "file2.test.ts");
  writeFileSync(file1, fixtureContent);
  writeFileSync(file2, fixtureContent);

  const result = Bun.spawnSync({
    cmd: ["bun", "test", file1, file2],
    env: { ...process.env, KEST_DEFAULT_TIMEOUT: "100" },
  });
  const stderr = result.stderr.toString();
  const matches = stderr.match(/timed out after 100ms/g);
  expect(matches).toHaveLength(2);
});
