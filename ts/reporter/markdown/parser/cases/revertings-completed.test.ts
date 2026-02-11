import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "revertings completed";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" } },
  { kind: "BDDGiven", data: { description: "create Namespace" } },
  {
    kind: "ActionStart",
    data: { description: "Apply Namespace `kest-abc12`" },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin: "apiVersion: v1\nkind: Namespace\nmetadata: \n  name: kest-abc12",
      stdinLanguage: "yaml",
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "namespace/kest-abc12 created\n",
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
  },
  {
    kind: "ActionEnd",
    data: { ok: true },
  },
  { kind: "BDDWhen", data: { description: "apply ConfigMap" } },
  {
    kind: "ActionStart",
    data: { description: 'Apply `ConfigMap` "my-config-1"' },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin:
        "apiVersion: v1\nkind: ConfigMap\nmetadata: \n  name: my-config-1\n  namespace: kest-abc12\ndata: \n  mode: demo-1",
      stdinLanguage: "yaml",
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "configmap/my-config-1 created\n",
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
  },
  {
    kind: "ActionEnd",
    data: { ok: true },
  },
  { kind: "BDDThen", data: { description: "confirm ConfigMap" } },
  {
    kind: "ActionStart",
    data: { description: 'Assert `ConfigMap` "my-config-1"' },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["get", "ConfigMap/my-config-1", "-n", "kest-abc12", "-o", "yaml"],
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout:
        "apiVersion: v1\ndata:\n  mode: demo-1\nkind: ConfigMap\nmetadata:\n  name: my-config-1\n  namespace: kest-abc12\n",
      stderr: "",
      stdoutLanguage: "yaml",
      stderrLanguage: "text",
    },
  },
  { kind: "RetryStart", data: {} },
  {
    kind: "RetryEnd",
    data: {
      attempts: 3,
      success: false,
      reason: "timeout",
      error: new Error("Timed out"),
    },
  },
  {
    kind: "ActionEnd",
    data: {
      ok: false,
      error: new Error(
        [
          "expect(received).toMatchObject(expected)",
          "",
          "  {",
          '    "data": {',
          '-     "mode": "demo",',
          '+     "mode": "demo-1",',
          "    },",
          "  }",
        ].join("\n")
      ),
    },
  },
  { kind: "RevertingsStart", data: {} },
  {
    kind: "ActionStart",
    data: { description: 'Delete `ConfigMap` "my-config-1"' },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["delete", "ConfigMap/my-config-1", "-n", "kest-abc12"],
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: 'configmap "my-config-1" deleted\n',
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
  },
  {
    kind: "ActionEnd",
    data: { ok: true },
  },
  {
    kind: "ActionStart",
    data: { description: "Delete Namespace `kest-abc12`" },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["delete", "namespace/kest-abc12"],
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: 'namespace "kest-abc12" deleted\n',
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
  },
  {
    kind: "ActionEnd",
    data: { ok: true },
  },
  { kind: "RevertingsEnd", data: {} },
] satisfies ReadonlyArray<Event>;

export const report = {
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
              command: {
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
              command: {
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
              command: {
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
