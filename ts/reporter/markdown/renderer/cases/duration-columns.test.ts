import { expect, test } from "bun:test";
import { Duration } from "../../../../duration";
import type { Report } from "../../model";
import { run } from "../renderer.test";

const report = {
  scenarios: [
    {
      name: "timed scenario",
      duration: new Duration(45_200),
      overview: [
        {
          name: "Apply Namespace `kest-abc12`",
          status: "success",
          duration: new Duration(800),
        },
        {
          name: 'Apply `ConfigMap` "my-config-1"',
          status: "success",
          duration: new Duration(2500),
        },
      ],
      details: [
        {
          type: "BDDSection",
          keyword: "given",
          description: "create Namespace",
          actions: [
            {
              name: "Apply Namespace `kest-abc12`",
              duration: new Duration(800),
              commands: [
                {
                  cmd: "kubectl",
                  args: ["apply", "-f", "-"],
                  stdin: {
                    text: "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: kest-abc12",
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
              duration: new Duration(2500),
              commands: [
                {
                  cmd: "kubectl",
                  args: ["apply", "-f", "-"],
                  stdin: {
                    text: "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: my-config-1\n  namespace: kest-abc12\ndata:\n  mode: demo",
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
      cleanup: [
        {
          action: 'Delete `ConfigMap` "my-config-1"',
          status: "success",
          duration: new Duration(1200),
          command: {
            cmd: "kubectl",
            args: ["delete", "ConfigMap/my-config-1", "-n", "kest-abc12"],
            output: 'configmap "my-config-1" deleted\n',
          },
        },
        {
          action: "Delete Namespace `kest-abc12`",
          status: "success",
          duration: new Duration(13_100),
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

const expected = (await import("./duration-columns.txt")).default;

test("duration columns in overview and cleanup tables", async () => {
  const result = await run({
    report,
    options: {
      enableANSI: false,
    },
  });
  expect(result).toBe(expected);
});
