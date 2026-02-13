import { expect, test } from "bun:test";
import type { Report } from "../../model";
import { run } from "../renderer.test";

const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [
        {
          name: 'Apply `ClusterDeployment` "my-cd" (expected error)',
          status: "success",
        },
      ],
      details: [
        {
          type: "BDDSection",
          keyword: "then",
          description: "the update should be rejected",
          actions: [
            {
              name: 'Apply `ClusterDeployment` "my-cd" (expected error)',
              attempts: 1,
              commands: [
                {
                  cmd: "kubectl",
                  args: ["apply", "-f", "-"],
                  stdin: {
                    text: "apiVersion: cluster.example.com/v1\nkind: ClusterDeployment\nmetadata:\n  name: my-cd",
                    language: "yaml",
                  },
                  stdout: { text: "", language: "text" },
                  stderr: {
                    text: 'admission webhook "validate.cluster.example.com" denied the request: field is immutable\n',
                    language: "text",
                  },
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

const expected = (await import("./multiple-commands-in-action.txt")).default;

test("renders multiple commands in a single action", async () => {
  const result = await run({
    report,
    options: {
      enableANSI: false,
    },
  });
  expect(result).toBe(expected);
});
