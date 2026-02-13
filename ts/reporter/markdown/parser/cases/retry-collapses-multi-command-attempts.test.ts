import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state =
  "retry collapses commands to last attempt (multiple commands per attempt)";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" } },
  {
    kind: "BDDThen",
    data: { description: "the update should be rejected" },
  },
  {
    kind: "ActionStart",
    data: {
      description: 'Apply `ClusterDeployment` "my-cd" (expected error)',
    },
  },
  // Initial attempt: apply succeeds (unexpected) → revert
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin:
        "apiVersion: cluster.example.com/v1\nkind: ClusterDeployment\nmetadata: \n  name: my-cd",
      stdinLanguage: "yaml",
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "clusterdeployment.cluster.example.com/my-cd configured\n",
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["delete", "ClusterDeployment/my-cd", "--ignore-not-found"],
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: 'clusterdeployment.cluster.example.com "my-cd" deleted\n',
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
  },
  { kind: "RetryStart", data: {} },
  // Retry 1: same pattern — apply succeeds (unexpected) → revert
  { kind: "RetryAttempt", data: { attempt: 1 } },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin:
        "apiVersion: cluster.example.com/v1\nkind: ClusterDeployment\nmetadata: \n  name: my-cd",
      stdinLanguage: "yaml",
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "clusterdeployment.cluster.example.com/my-cd configured\n",
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["delete", "ClusterDeployment/my-cd", "--ignore-not-found"],
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: 'clusterdeployment.cluster.example.com "my-cd" deleted\n',
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
  },
  // Retry 2 (last): apply is rejected as expected — only this survives
  { kind: "RetryAttempt", data: { attempt: 2 } },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin:
        "apiVersion: cluster.example.com/v1\nkind: ClusterDeployment\nmetadata: \n  name: my-cd",
      stdinLanguage: "yaml",
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 1,
      stdout: "",
      stderr:
        'admission webhook "validate.cluster.example.com" denied the request: field is immutable\n',
      stdoutLanguage: "text",
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
      overview: [
        {
          name: 'Apply `ClusterDeployment` "my-cd" (expected error)',
          status: "success",
        },
      ],
      details: [
        {
          type: "BDDSection",
          keyword: "then",
          description: "the update should be rejected",
          actions: [
            {
              name: 'Apply `ClusterDeployment` "my-cd" (expected error)',
              attempts: 2,
              commands: [
                {
                  cmd: "kubectl",
                  args: ["apply", "-f", "-"],
                  stdin: {
                    text: "apiVersion: cluster.example.com/v1\nkind: ClusterDeployment\nmetadata: \n  name: my-cd",
                    language: "yaml",
                  },
                  stdout: { text: "", language: "text" },
                  stderr: {
                    text: 'admission webhook "validate.cluster.example.com" denied the request: field is immutable\n',
                    language: "text",
                  },
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
