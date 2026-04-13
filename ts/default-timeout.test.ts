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

  for (const file of [file1, file2]) {
    const result = Bun.spawnSync({
      cmd: ["bun", "test", file],
      env: { ...process.env, KEST_DEFAULT_TIMEOUT: "100" },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("timed out after 100ms");
  }
});
