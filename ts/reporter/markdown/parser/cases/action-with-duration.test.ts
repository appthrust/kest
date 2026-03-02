import { Duration } from "../../../../duration";
import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "action with duration timestamps";
export const events = [
  { kind: "ScenarioStart", data: { name: "timed scenario" }, timestamp: 1000 },
  { kind: "BDDGiven", data: { description: "create Namespace" }, timestamp: 0 },
  {
    kind: "ActionStart",
    data: { description: "Apply Namespace `kest-abc12`" },
    timestamp: 1000,
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
    timestamp: 1800,
  },
  { kind: "BDDWhen", data: { description: "apply ConfigMap" }, timestamp: 0 },
  {
    kind: "ActionStart",
    data: { description: 'Apply `ConfigMap` "my-config-1"' },
    timestamp: 1800,
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin:
        "apiVersion: v1\nkind: ConfigMap\nmetadata: \n  name: my-config-1\n  namespace: kest-abc12\ndata: \n  mode: demo",
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
    timestamp: 4300,
  },
  { kind: "ScenarioEnd", data: {}, timestamp: 4500 },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "timed scenario",
      duration: new Duration(3500),
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
              duration: new Duration(2500),
              commands: [
                {
                  cmd: "kubectl",
                  args: ["apply", "-f", "-"],
                  stdin: {
                    text: "apiVersion: v1\nkind: ConfigMap\nmetadata: \n  name: my-config-1\n  namespace: kest-abc12\ndata: \n  mode: demo",
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
