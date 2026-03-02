import { Duration } from "../../../../duration";
import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "multiple scenarios";
export const events = [
  { kind: "ScenarioStart", data: { name: "first scenario" }, timestamp: 0 },
  { kind: "BDDGiven", data: { description: "setup" }, timestamp: 0 },
  { kind: "ActionStart", data: { description: "Do A" }, timestamp: 0 },
  { kind: "ActionEnd", data: { ok: true }, timestamp: 0 },
  { kind: "RevertingsStart", data: {}, timestamp: 0 },
  { kind: "ActionStart", data: { description: "Cleanup A" }, timestamp: 0 },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["delete", "configmap/my-config-1", "-n", "default"],
    },
    timestamp: 0,
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "configmap deleted\n",
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
    timestamp: 0,
  },
  { kind: "ActionEnd", data: { ok: true }, timestamp: 0 },
  // Intentionally omit RevertingsEnd to ensure ScenarioEnd resets cleanup state.
  { kind: "ScenarioEnd", data: {}, timestamp: 0 },

  { kind: "ScenarioStart", data: { name: "second scenario" }, timestamp: 0 },
  // Intentionally start with an action without any BDD section to ensure the
  // previous scenario's BDD section does not leak.
  { kind: "ActionStart", data: { description: "Do B" }, timestamp: 0 },
  {
    kind: "CommandRun",
    data: { cmd: "kubectl", args: ["get", "namespace/default", "-o", "yaml"] },
    timestamp: 0,
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: default\n",
      stderr: "",
      stdoutLanguage: "yaml",
      stderrLanguage: "text",
    },
    timestamp: 0,
  },
  {
    kind: "RetryEnd",
    data: { attempts: 2, success: true, reason: "success" },
    timestamp: 0,
  },
  { kind: "ActionEnd", data: { ok: true }, timestamp: 0 },
  { kind: "ScenarioEnd", data: {}, timestamp: 0 },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "first scenario",
      duration: new Duration(0),
      overview: [
        { name: "Do A", status: "success", duration: new Duration(0) },
      ],
      details: [
        {
          type: "BDDSection",
          keyword: "given",
          description: "setup",
          actions: [{ name: "Do A", duration: new Duration(0), commands: [] }],
        },
      ],
      cleanup: [
        {
          action: "Cleanup A",
          status: "success",
          duration: new Duration(0),
          command: {
            cmd: "kubectl",
            args: ["delete", "configmap/my-config-1", "-n", "default"],
            output: "configmap deleted\n",
          },
        },
      ],
    },
    {
      name: "second scenario",
      duration: new Duration(0),
      overview: [
        { name: "Do B", status: "success", duration: new Duration(0) },
      ],
      details: [
        {
          type: "Action",
          name: "Do B",
          attempts: 2,
          duration: new Duration(0),
          commands: [
            {
              cmd: "kubectl",
              args: ["get", "namespace/default", "-o", "yaml"],
              stdout: {
                text: "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: default\n",
                language: "yaml",
              },
              stderr: { text: "", language: "text" },
            },
          ],
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
