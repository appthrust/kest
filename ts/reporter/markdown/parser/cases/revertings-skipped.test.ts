import { Duration } from "../../../../duration";
import type { Event } from "../../../../recording";
import type { Report } from "../../model";

const actionEndError = new Error("expected value to match");

export const state = "revertings skipped";
export const events = [
  { kind: "ScenarioStart", data: { name: "debug scenario" }, timestamp: 0 },
  { kind: "BDDGiven", data: { description: "create Namespace" }, timestamp: 0 },
  {
    kind: "ActionStart",
    data: { description: "Apply Namespace `kest-xyz99`" },
    timestamp: 0,
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin: "apiVersion: v1\nkind: Namespace\nmetadata: \n  name: kest-xyz99",
      stdinLanguage: "yaml",
    },
    timestamp: 0,
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "namespace/kest-xyz99 created\n",
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
    timestamp: 0,
  },
  { kind: "ActionEnd", data: { ok: true }, timestamp: 0 },
  { kind: "BDDThen", data: { description: "assert something" }, timestamp: 0 },
  {
    kind: "ActionStart",
    data: { description: 'Assert `ConfigMap` "my-config"' },
    timestamp: 0,
  },
  { kind: "RetryStart", data: {}, timestamp: 0 },
  {
    kind: "RetryEnd",
    data: {
      attempts: 2,
      success: false,
      reason: "timeout",
      error: new Error("Timed out"),
    },
    timestamp: 0,
  },
  {
    kind: "ActionEnd",
    data: {
      ok: false,
      error: actionEndError,
    },
    timestamp: 0,
  },
  { kind: "RevertingsSkipped", data: {}, timestamp: 0 },
  { kind: "ScenarioEnd", data: {}, timestamp: 0 },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "debug scenario",
      overview: [
        {
          name: "Apply Namespace `kest-xyz99`",
          status: "success",
          duration: new Duration(0),
        },
        {
          name: 'Assert `ConfigMap` "my-config"',
          status: "failure",
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
              name: "Apply Namespace `kest-xyz99`",
              commands: [
                {
                  cmd: "kubectl",
                  args: ["apply", "-f", "-"],
                  stdin: {
                    text: "apiVersion: v1\nkind: Namespace\nmetadata: \n  name: kest-xyz99",
                    language: "yaml",
                  },
                  stdout: {
                    text: "namespace/kest-xyz99 created\n",
                    language: "text",
                  },
                  stderr: { text: "", language: "text" },
                },
              ],
              duration: new Duration(0),
            },
          ],
        },
        {
          type: "BDDSection",
          keyword: "then",
          description: "assert something",
          actions: [
            {
              name: 'Assert `ConfigMap` "my-config"',
              attempts: 2,
              commands: [],
              error: {
                message: {
                  text: "expected value to match",
                  language: "text",
                },
                stack: actionEndError.stack,
              },
              duration: new Duration(0),
            },
          ],
        },
      ],
      cleanup: [],
      cleanupSkipped: true,
      duration: new Duration(0),
    },
  ],
} satisfies Report;
