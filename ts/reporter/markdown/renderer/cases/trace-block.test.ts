import { expect, test } from "bun:test";
import type { Report } from "../../model";
import { run } from "../renderer.test";

const report = {
  scenarios: [
    {
      name: "trace test",
      overview: [{ name: 'Assert `ConfigMap` "my-config"', status: "failure" }],
      details: [
        {
          type: "BDDSection",
          keyword: "then",
          description: "confirm ConfigMap",
          actions: [
            {
              name: 'Assert `ConfigMap` "my-config"',
              attempts: 3,
              commands: [
                {
                  cmd: "kubectl",
                  args: ["get", "ConfigMap/my-config", "-o", "yaml"],
                  stdout: { text: "", language: "text" },
                  stderr: { text: "", language: "text" },
                },
              ],
              error: {
                message: {
                  text: [
                    "expect(received).toMatchObject(expected)",
                    "",
                    "  {",
                    '-     "mode": "a",',
                    '+     "mode": "b",',
                    "  }",
                  ].join("\n"),
                  language: "diff",
                },
                stack: [
                  "    at /Users/test/project/src/test.ts:10:5",
                  "    at /Users/test/project/node_modules/some-lib/index.js:20:10",
                ].join("\n"),
              },
            },
          ],
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;

const expected = (await import("./trace-block.txt")).default;

test("renders trace block after error message", async () => {
  const result = await run({
    report,
    options: {
      enableANSI: false,
    },
  });
  expect(result).toBe(expected);
});
