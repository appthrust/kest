import { Duration } from "../../../../duration";
import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "cleanup with duration timestamps";
export const events = [
  {
    kind: "ScenarioStart",
    data: { name: "cleanup timing" },
    timestamp: 1000,
  },
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
    timestamp: 2500,
  },
  { kind: "RevertingsStart", data: {}, timestamp: 2500 },
  {
    kind: "ActionStart",
    data: { description: "Delete Namespace `kest-abc12`" },
    timestamp: 2500,
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
    timestamp: 15_600,
  },
  { kind: "RevertingsEnd", data: {}, timestamp: 15_600 },
  { kind: "ScenarioEnd", data: {}, timestamp: 15_700 },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "cleanup timing",
      duration: new Duration(14_700),
      overview: [
        {
          name: "Apply Namespace `kest-abc12`",
          status: "success",
          duration: new Duration(1500),
        },
      ],
      details: [
        {
          type: "Action",
          name: "Apply Namespace `kest-abc12`",
          duration: new Duration(1500),
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
      cleanup: [
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
