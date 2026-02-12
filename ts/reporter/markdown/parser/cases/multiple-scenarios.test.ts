import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "multiple scenarios";
export const events = [
  { kind: "ScenarioStart", data: { name: "first scenario" } },
  { kind: "BDDGiven", data: { description: "setup" } },
  { kind: "ActionStart", data: { description: "Do A" } },
  { kind: "ActionEnd", data: { ok: true } },
  { kind: "RevertingsStart", data: {} },
  { kind: "ActionStart", data: { description: "Cleanup A" } },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["delete", "configmap/my-config-1", "-n", "default"],
    },
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
  },
  { kind: "ActionEnd", data: { ok: true } },
  // Intentionally omit RevertingsEnd to ensure ScenarioEnd resets cleanup state.
  { kind: "ScenarioEnd", data: {} },

  { kind: "ScenarioStart", data: { name: "second scenario" } },
  // Intentionally start with an action without any BDD section to ensure the
  // previous scenario's BDD section does not leak.
  { kind: "ActionStart", data: { description: "Do B" } },
  {
    kind: "CommandRun",
    data: { cmd: "kubectl", args: ["get", "namespace/default", "-o", "yaml"] },
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
  },
  { kind: "RetryEnd", data: { attempts: 2, success: true, reason: "success" } },
  { kind: "ActionEnd", data: { ok: true } },
  { kind: "ScenarioEnd", data: {} },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "first scenario",
      overview: [{ name: "Do A", status: "success" }],
      details: [
        {
          type: "BDDSection",
          keyword: "given",
          description: "setup",
          actions: [{ name: "Do A", commands: [] }],
        },
      ],
      cleanup: [
        {
          action: "Cleanup A",
          status: "success",
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
      overview: [{ name: "Do B", status: "success" }],
      details: [
        {
          type: "Action",
          name: "Do B",
          attempts: 2,
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
