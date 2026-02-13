import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state =
  "retry collapses commands to last attempt (single command per attempt)";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" } },
  { kind: "BDDThen", data: { description: "verify config" } },
  {
    kind: "ActionStart",
    data: { description: 'Assert `ConfigMap` "my-config"' },
  },
  // Initial attempt
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["get", "ConfigMap/my-config", "-n", "kest-abc12", "-o", "yaml"],
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "apiVersion: v1\ndata:\n  mode: v1\n",
      stderr: "",
      stdoutLanguage: "yaml",
      stderrLanguage: "text",
    },
  },
  { kind: "RetryStart", data: {} },
  // Retry 1
  { kind: "RetryAttempt", data: { attempt: 1 } },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["get", "ConfigMap/my-config", "-n", "kest-abc12", "-o", "yaml"],
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "apiVersion: v1\ndata:\n  mode: v2\n",
      stderr: "",
      stdoutLanguage: "yaml",
      stderrLanguage: "text",
    },
  },
  // Retry 2 (last) – this is the one that should remain
  { kind: "RetryAttempt", data: { attempt: 2 } },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["get", "ConfigMap/my-config", "-n", "kest-abc12", "-o", "yaml"],
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "apiVersion: v1\ndata:\n  mode: v3\n",
      stderr: "",
      stdoutLanguage: "yaml",
      stderrLanguage: "text",
    },
  },
  {
    kind: "RetryEnd",
    data: { attempts: 2, success: true, reason: "success" },
  },
  { kind: "ActionEnd", data: { ok: true } },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [{ name: 'Assert `ConfigMap` "my-config"', status: "success" }],
      details: [
        {
          type: "BDDSection",
          keyword: "then",
          description: "verify config",
          actions: [
            {
              name: 'Assert `ConfigMap` "my-config"',
              attempts: 2,
              commands: [
                {
                  cmd: "kubectl",
                  args: [
                    "get",
                    "ConfigMap/my-config",
                    "-n",
                    "kest-abc12",
                    "-o",
                    "yaml",
                  ],
                  stdout: {
                    text: "apiVersion: v1\ndata:\n  mode: v3\n",
                    language: "yaml",
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
