import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "second action completed";
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
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [
        { name: "Apply Namespace `kest-abc12`", status: "success" },
        { name: 'Apply `ConfigMap` "my-config-1"', status: "success" },
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
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
