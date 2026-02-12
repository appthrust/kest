import { expect, test } from "bun:test";
import type { Report } from "../../model";
import { run } from "../renderer.test";

const report = {
  scenarios: [
    {
      name: "stdin yaml highlight",
      overview: [
        { name: 'Apply `ConfigMap` "my-config-1"', status: "success" },
      ],
      details: [
        {
          type: "BDDSection",
          keyword: "when",
          description: "apply ConfigMap",
          actions: [
            {
              name: 'Apply `ConfigMap` "my-config-1"',
              commands: [
                {
                  cmd: "kubectl",
                  args: ["apply", "-f", "-"],
                  stdin: {
                    text: [
                      "apiVersion: v1",
                      "kind: ConfigMap",
                      "metadata: ",
                      "  name: my-config-1",
                      "  namespace: kest-abc12",
                      "data: ",
                      "  mode: demo-1",
                    ].join("\n"),
                    language: "yaml",
                  },
                  stdout: {
                    text: "configmap/my-config-1 created\n",
                    language: "text",
                  },
                  stderr: { text: "", language: "text" },
                },
              ],
            },
          ],
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;

const expected = (await import("./ansi-stdin-yaml-highlight.txt")).default;

test("ansi stdin YAML highlight", async () => {
  const result = await run({
    report,
    options: {
      enableANSI: true,
    },
  });
  const normalizedExpected = expected.endsWith("\n")
    ? expected
    : `${expected}\n`;
  expect(result).toBe(normalizedExpected);
});
