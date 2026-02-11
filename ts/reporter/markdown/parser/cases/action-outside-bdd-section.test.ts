import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "action outside BDD section";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" } },
  { kind: "ActionStart", data: { description: "Get Pods" } },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["get", "pods", "-n", "default", "-o", "yaml"],
    },
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
  },
  { kind: "ActionEnd", data: { ok: true } },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [{ name: "Get Pods", status: "success" }],
      details: [
        {
          type: "Action",
          name: "Get Pods",
          command: {
            cmd: "kubectl",
            args: ["get", "pods", "-n", "default", "-o", "yaml"],
            stdout: { text: "kind: List\n", language: "yaml" },
            stderr: { text: "", language: "text" },
          },
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
