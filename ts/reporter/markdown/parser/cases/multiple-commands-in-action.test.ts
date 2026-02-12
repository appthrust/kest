import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "multiple commands in a single action";
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
  // First attempt: apply succeeds unexpectedly
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
  // Immediate revert after unexpected success
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
  // Second attempt: apply is rejected as expected
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
    data: { attempts: 1, success: true, reason: "success" },
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
              attempts: 1,
              commands: [
                {
                  cmd: "kubectl",
                  args: ["apply", "-f", "-"],
                  stdin: {
                    text: "apiVersion: cluster.example.com/v1\nkind: ClusterDeployment\nmetadata: \n  name: my-cd",
                    language: "yaml",
                  },
                  stdout: {
                    text: "clusterdeployment.cluster.example.com/my-cd configured\n",
                    language: "text",
                  },
                  stderr: { text: "", language: "text" },
                },
                {
                  cmd: "kubectl",
                  args: [
                    "delete",
                    "ClusterDeployment/my-cd",
                    "--ignore-not-found",
                  ],
                  stdout: {
                    text: 'clusterdeployment.cluster.example.com "my-cd" deleted\n',
                    language: "text",
                  },
                  stderr: { text: "", language: "text" },
                },
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
