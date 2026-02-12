import { expect, test } from "bun:test";
import type { Report } from "../../model";
import { run } from "../renderer.test";

const report = {
  scenarios: [
    {
      name: "code block highlight",
      overview: [{ name: "Get ConfigMap", status: "success" }],
      details: [
        {
          type: "BDDSection",
          keyword: "then",
          description: "confirm ConfigMap",
          actions: [
            {
              name: "Get ConfigMap",
              commands: [
                {
                  cmd: "kubectl",
                  args: [
                    "get",
                    "ConfigMap/my-config-1",
                    "-n",
                    "kest-abc12",
                    "-o",
                    "yaml",
                  ],
                  stdout: {
                    text: [
                      "apiVersion: v1",
                      "kind: ConfigMap",
                      "metadata:",
                      "  name: my-config-1",
                      "  namespace: kest-abc12",
                      "",
                    ].join("\n"),
                    language: "yaml",
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

const expected = (await import("./ansi-code-block-highlight.txt")).default;

test("ansi code block highlight", async () => {
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
