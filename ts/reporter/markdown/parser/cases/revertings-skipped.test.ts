import type { Event } from "../../../../recording";
import type { Report } from "../../model";

const actionEndError = new Error("expected value to match");

export const state = "revertings skipped";
export const events = [
  { kind: "ScenarioStart", data: { name: "debug scenario" } },
  { kind: "BDDGiven", data: { description: "create Namespace" } },
  {
    kind: "ActionStart",
    data: { description: "Apply Namespace `kest-xyz99`" },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin: "apiVersion: v1\nkind: Namespace\nmetadata: \n  name: kest-xyz99",
      stdinLanguage: "yaml",
    },
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
  },
  { kind: "ActionEnd", data: { ok: true } },
  { kind: "BDDThen", data: { description: "assert something" } },
  {
    kind: "ActionStart",
    data: { description: 'Assert `ConfigMap` "my-config"' },
  },
  { kind: "RetryStart", data: {} },
  {
    kind: "RetryEnd",
    data: {
      attempts: 2,
      success: false,
      reason: "timeout",
      error: new Error("Timed out"),
    },
  },
  {
    kind: "ActionEnd",
    data: {
      ok: false,
      error: actionEndError,
    },
  },
  { kind: "RevertingsSkipped", data: {} },
  { kind: "ScenarioEnd", data: {} },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "debug scenario",
      overview: [
        { name: "Apply Namespace `kest-xyz99`", status: "success" },
        { name: 'Assert `ConfigMap` "my-config"', status: "failure" },
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
            },
          ],
        },
      ],
      cleanup: [],
      cleanupSkipped: true,
    },
  ],
} satisfies Report;
