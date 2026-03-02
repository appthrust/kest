import { Duration } from "../../../../duration";
import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "first action completed";
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
      ],
      details: [
        {
          type: "BDDSection",
          keyword: "given",
          description: "create Namespace",
          actions: [
            {
              name: "Apply Namespace `kest-abc12`",
              duration: new Duration(0),
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
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
