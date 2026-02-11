import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "first action completed";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" } },
  { kind: "BDDGiven", data: { description: "create Namespace" } },
  {
    kind: "ActionStart",
    data: { description: "Apply Namespace `kest-abc12`" },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin: "apiVersion: v1\nkind: Namespace\nmetadata: \n  name: kest-abc12",
      stdinLanguage: "yaml",
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "namespace/kest-abc12 created\n",
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
  },
  {
    kind: "ActionEnd",
    data: { ok: true },
  },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [{ name: "Apply Namespace `kest-abc12`", status: "success" }],
      details: [
        {
          type: "BDDSection",
          keyword: "given",
          description: "create Namespace",
          actions: [
            {
              name: "Apply Namespace `kest-abc12`",
              command: {
                cmd: "kubectl",
                args: ["apply", "-f", "-"],
                stdin: {
                  text: "apiVersion: v1\nkind: Namespace\nmetadata: \n  name: kest-abc12",
                  language: "yaml",
                },
                stdout: {
                  text: "namespace/kest-abc12 created\n",
                  language: "text",
                },
                stderr: { text: "", language: "text" },
              },
            },
          ],
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
