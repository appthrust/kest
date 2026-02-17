import { expect, test } from "bun:test";
import type { Report } from "../../model";
import { run } from "../renderer.test";

const report = {
  scenarios: [
    {
      name: "debug scenario",
      overview: [
        { name: "Apply Namespace `kest-xyz99`", status: "success" },
        { name: 'Assert `ConfigMap` "my-config"', status: "failure" },
      ],
      details: [
        {
          type: "BDDSection",
          keyword: "given",
          description: "create Namespace",
          actions: [
            {
              name: "Apply Namespace `kest-xyz99`",
              commands: [
                {
                  cmd: "kubectl",
                  args: ["apply", "-f", "-"],
                  stdin: {
                    text: "apiVersion: v1\nkind: Namespace\nmetadata: \n  name: kest-xyz99",
                    language: "yaml",
                  },
                  stdout: {
                    text: "namespace/kest-xyz99 created\n",
                    language: "text",
                  },
                  stderr: { text: "", language: "text" },
                },
              ],
            },
          ],
        },
        {
          type: "BDDSection",
          keyword: "then",
          description: "assert something",
          actions: [
            {
              name: 'Assert `ConfigMap` "my-config"',
              attempts: 2,
              commands: [],
              error: {
                message: {
                  text: "expected value to match",
                  language: "text",
                },
              },
            },
          ],
        },
      ],
      cleanup: [],
      cleanupSkipped: true,
    },
  ],
} satisfies Report;

const expected = (await import("./revertings-skipped.txt")).default;

test("revertings skipped", async () => {
  const result = await run({
    report,
    options: {
      enableANSI: false,
    },
  });
  expect(result).toBe(expected);
});
