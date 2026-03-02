import { Duration } from "../../../../duration";
import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "action outside BDD section";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" }, timestamp: 0 },
  { kind: "ActionStart", data: { description: "Get Pods" }, timestamp: 0 },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["get", "pods", "-n", "default", "-o", "yaml"],
    },
    timestamp: 0,
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "kind: List\n",
      stderr: "",
      stdoutLanguage: "yaml",
      stderrLanguage: "text",
    },
    timestamp: 0,
  },
  { kind: "ActionEnd", data: { ok: true }, timestamp: 0 },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [
        { name: "Get Pods", status: "success", duration: new Duration(0) },
      ],
      details: [
        {
          type: "Action",
          name: "Get Pods",
          duration: new Duration(0),
          commands: [
            {
              cmd: "kubectl",
              args: ["get", "pods", "-n", "default", "-o", "yaml"],
              stdout: { text: "kind: List\n", language: "yaml" },
              stderr: { text: "", language: "text" },
            },
          ],
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
