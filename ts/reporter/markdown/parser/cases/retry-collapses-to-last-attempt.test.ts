import { Duration } from "../../../../duration";
import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state =
  "retry collapses commands to last attempt (single command per attempt)";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" }, timestamp: 0 },
  { kind: "BDDThen", data: { description: "verify config" }, timestamp: 0 },
  {
    kind: "ActionStart",
    data: { description: 'Assert `ConfigMap` "my-config"' },
    timestamp: 0,
  },
  // Initial attempt
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["get", "ConfigMap/my-config", "-n", "kest-abc12", "-o", "yaml"],
    },
    timestamp: 0,
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
    timestamp: 0,
  },
  { kind: "RetryStart", data: {}, timestamp: 0 },
  // Retry 1
  { kind: "RetryAttempt", data: { attempt: 1 }, timestamp: 0 },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["get", "ConfigMap/my-config", "-n", "kest-abc12", "-o", "yaml"],
    },
    timestamp: 0,
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
    timestamp: 0,
  },
  // Retry 2 (last) – this is the one that should remain
  { kind: "RetryAttempt", data: { attempt: 2 }, timestamp: 0 },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["get", "ConfigMap/my-config", "-n", "kest-abc12", "-o", "yaml"],
    },
    timestamp: 0,
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
    timestamp: 0,
  },
  {
    kind: "RetryEnd",
    data: { attempts: 2, success: true, reason: "success" },
    timestamp: 0,
  },
  { kind: "ActionEnd", data: { ok: true }, timestamp: 0 },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [
        {
          name: 'Assert `ConfigMap` "my-config"',
          status: "success",
          duration: new Duration(0),
        },
      ],
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
              duration: new Duration(0),
            },
          ],
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
