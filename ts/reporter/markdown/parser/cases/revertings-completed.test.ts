import { Duration } from "../../../../duration";
import type { Event } from "../../../../recording";
import type { Report } from "../../model";

const actionEndErrorMessage = [
  "expect(received).toMatchObject(expected)",
  "",
  "  {",
  '    "data": {',
  '-     "mode": "demo",',
  '+     "mode": "demo-1",',
  "    },",
  "  }",
].join("\n");

const actionEndError = new Error(actionEndErrorMessage);
actionEndError.stack =
  "Error: expect(received).toMatchObject(expected)\n    at Object.toMatchObject (example.test.ts:81:20)";

export const state = "revertings completed";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" }, timestamp: 0 },
  { kind: "BDDGiven", data: { description: "create Namespace" }, timestamp: 0 },
  {
    kind: "ActionStart",
    data: { description: "Apply Namespace `kest-abc12`" },
    timestamp: 0,
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin: "apiVersion: v1\nkind: Namespace\nmetadata: \n  name: kest-abc12",
      stdinLanguage: "yaml",
    },
    timestamp: 0,
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
    timestamp: 0,
  },
  {
    kind: "ActionEnd",
    data: { ok: true },
    timestamp: 0,
  },
  { kind: "BDDWhen", data: { description: "apply ConfigMap" }, timestamp: 0 },
  {
    kind: "ActionStart",
    data: { description: 'Apply `ConfigMap` "my-config-1"' },
    timestamp: 0,
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
    timestamp: 0,
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
    timestamp: 0,
  },
  {
    kind: "ActionEnd",
    data: { ok: true },
    timestamp: 0,
  },
  { kind: "BDDThen", data: { description: "confirm ConfigMap" }, timestamp: 0 },
  {
    kind: "ActionStart",
    data: { description: 'Assert `ConfigMap` "my-config-1"' },
    timestamp: 0,
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["get", "ConfigMap/my-config-1", "-n", "kest-abc12", "-o", "yaml"],
    },
    timestamp: 0,
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
    timestamp: 0,
  },
  { kind: "RetryStart", data: {}, timestamp: 0 },
  {
    kind: "RetryEnd",
    data: {
      attempts: 3,
      success: false,
      reason: "timeout",
      error: new Error("Timed out"),
    },
    timestamp: 0,
  },
  {
    kind: "ActionEnd",
    data: {
      ok: false,
      error: actionEndError,
    },
    timestamp: 0,
  },
  { kind: "RevertingsStart", data: {}, timestamp: 0 },
  {
    kind: "ActionStart",
    data: { description: 'Delete `ConfigMap` "my-config-1"' },
    timestamp: 0,
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["delete", "ConfigMap/my-config-1", "-n", "kest-abc12"],
    },
    timestamp: 0,
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
    timestamp: 0,
  },
  {
    kind: "ActionEnd",
    data: { ok: true },
    timestamp: 0,
  },
  {
    kind: "ActionStart",
    data: { description: "Delete Namespace `kest-abc12`" },
    timestamp: 0,
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["delete", "namespace/kest-abc12"],
    },
    timestamp: 0,
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
    timestamp: 0,
  },
  {
    kind: "ActionEnd",
    data: { ok: true },
    timestamp: 0,
  },
  { kind: "RevertingsEnd", data: {}, timestamp: 0 },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [
        {
          name: "Apply Namespace `kest-abc12`",
          status: "success",
          duration: new Duration(0),
        },
        {
          name: 'Apply `ConfigMap` "my-config-1"',
          status: "success",
          duration: new Duration(0),
        },
        {
          name: 'Assert `ConfigMap` "my-config-1"',
          status: "failure",
          duration: new Duration(0),
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
              duration: new Duration(0),
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
              duration: new Duration(0),
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
                  text: actionEndErrorMessage,
                  language: "diff",
                },
                stack:
                  "Error: expect(received).toMatchObject(expected)\n    at Object.toMatchObject (example.test.ts:81:20)",
              },
              duration: new Duration(0),
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
          duration: new Duration(0),
        },
        {
          action: "Delete Namespace `kest-abc12`",
          status: "success",
          command: {
            cmd: "kubectl",
            args: ["delete", "namespace/kest-abc12"],
            output: 'namespace "kest-abc12" deleted\n',
          },
          duration: new Duration(0),
        },
      ],
    },
  ],
} satisfies Report;
