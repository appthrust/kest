import { expect, test } from "bun:test";
import type { Report } from "../../model";
import { run } from "../renderer.test";

const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [
        { name: "Apply Namespace `kest-abc12`", status: "success" },
        { name: 'Apply `ConfigMap` "my-config-1"', status: "success" },
        { name: 'Assert `ConfigMap` "my-config-1"', status: "failure" },
      ],
      details: [
        {
          type: "BDDSection",
          keyword: "given",
          description: "create Namespace",
          actions: [
            {
              name: "Apply Namespace `kest-abc12`",
              commands: [
                {
                  cmd: "kubectl",
                  args: ["apply", "-f", "-"],
                  stdin: {
                    text: "apiVersion: v1\nkind: Namespace\nmetadata: \n  name: kest-abc12",
                    language: "yaml",
                  },
                  stdout: {
                    text: "namespace/kest-abc12 created\n",
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
                    text: "apiVersion: v1\nkind: ConfigMap\nmetadata: \n  name: my-config-1\n  namespace: kest-abc12\ndata: \n  mode: demo-1",
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
        {
          type: "BDDSection",
          keyword: "then",
          description: "confirm ConfigMap",
          actions: [
            {
              name: 'Assert `ConfigMap` "my-config-1"',
              attempts: 3,
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
                    text: "apiVersion: v1\ndata:\n  mode: demo-1\nkind: ConfigMap\nmetadata:\n  name: my-config-1\n  namespace: kest-abc12\n",
                    language: "yaml",
                  },
                  stderr: { text: "", language: "text" },
                },
              ],
              error: {
                message: {
                  text: [
                    "expect(received).toMatchObject(expected)",
                    "",
                    "  {",
                    '    "data": {',
                    '-     "mode": "demo",',
                    '+     "mode": "demo-1",',
                    "    },",
                    "  }",
                  ].join("\n"),
                  language: "diff",
                },
              },
            },
          ],
        },
      ],
      cleanup: [
        {
          action: 'Delete `ConfigMap` "my-config-1"',
          status: "success",
          command: {
            cmd: "kubectl",
            args: ["delete", "ConfigMap/my-config-1", "-n", "kest-abc12"],
            output: 'configmap "my-config-1" deleted\n',
          },
        },
        {
          action: "Delete Namespace `kest-abc12`",
          status: "success",
          command: {
            cmd: "kubectl",
            args: ["delete", "namespace/kest-abc12"],
            output: 'namespace "kest-abc12" deleted\n',
          },
        },
      ],
    },
  ],
} satisfies Report;

const expected = (await import("./revertings-completed.txt")).default;

test("revertings completed", async () => {
  const result = await run({
    report,
    options: {
      enableANSI: false,
    },
  });
  expect(result).toBe(expected);
});
