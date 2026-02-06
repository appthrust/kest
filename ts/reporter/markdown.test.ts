import { expect, test } from "bun:test";
import type { ErrorSummary, Event } from "../recording";
import { newMarkdownReporter } from "./markdown";

const events: ReadonlyArray<Event> = [
  { kind: "ScenarioStarted", data: { name: "hello world" } },

  { kind: "BDDGiven", data: { description: "create Namespace" } },
  {
    kind: "ActionStart",
    data: {
      action: "CreateNamespaceAction",
      phase: "mutate",
      input: { name: "kest-z1cbd" },
    },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin: "apiVersion: v1\nkind: Namespace\nmetadata: \n  name: kest-z1cbd",
      stdinLanguage: "yaml",
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "namespace/kest-z1cbd created\n",
      stderr: "",
      stdoutLanguage: "text",
    },
  },
  {
    kind: "ActionEnd",
    data: { action: "CreateNamespaceAction", phase: "mutate", ok: true },
  },

  { kind: "BDDWhen", data: { description: "apply ConfigMap" } },
  {
    kind: "ActionStart",
    data: {
      action: "ApplyK8sResourceAction",
      phase: "mutate",
      input: {
        kind: "ConfigMap",
        name: "my-config-1",
        namespace: "kest-z1cbd",
      },
    },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin:
        "apiVersion: v1\nkind: ConfigMap\nmetadata: \n  name: my-config-1\n  namespace: kest-z1cbd\ndata: \n  mode: demo-1",
      stdinLanguage: "yaml",
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "configmap/my-config-1 created\n",
      stderr: "",
      stdoutLanguage: "text",
    },
  },
  {
    kind: "ActionEnd",
    data: { action: "ApplyK8sResourceAction", phase: "mutate", ok: true },
  },

  {
    kind: "ActionStart",
    data: {
      action: "ApplyK8sResourceAction",
      phase: "mutate",
      input: {
        kind: "ConfigMap",
        name: "my-config-2",
        namespace: "kest-z1cbd",
      },
    },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["apply", "-f", "-"],
      stdin:
        "apiVersion: v1\nkind: ConfigMap\nmetadata: \n  name: my-config-2\n  namespace: kest-z1cbd\ndata: \n  mode: demo-2",
      stdinLanguage: "yaml",
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: "configmap/my-config-2 created\n",
      stderr: "",
      stdoutLanguage: "text",
    },
  },
  {
    kind: "ActionEnd",
    data: { action: "ApplyK8sResourceAction", phase: "mutate", ok: true },
  },

  { kind: "BDDThen", data: { description: "confirm ConfigMap" } },
  {
    kind: "ActionStart",
    data: {
      action: "AssertK8sResourceAction",
      phase: "query",
      input: {
        kind: "ConfigMap",
        name: "my-config-1",
        namespace: "kest-z1cbd",
      },
    },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["get", "ConfigMap/my-config-1", "-n", "kest-z1cbd", "-o", "yaml"],
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: [
        "apiVersion: v1",
        "data:",
        "  mode: demo-1",
        "kind: ConfigMap",
        "metadata:",
        "  annotations:",
        "    kubectl.kubernetes.io/last-applied-configuration: |",
        '      {"apiVersion":"v1","data":{"mode":"demo-1"},"kind":"ConfigMap","metadata":{"annotations":{},"name":"my-config-1","namespace":"kest-z1cbd"}}',
        '  creationTimestamp: "2026-02-02T20:36:19Z"',
        "  name: my-config-1",
        "  namespace: kest-z1cbd",
        '  resourceVersion: "233137"',
        "  uid: 728724f6-3e7f-4db0-9d7f-f91c50a30b18",
        "",
      ].join("\n"),
      stderr: "",
      stdoutLanguage: "yaml",
      stderrLanguage: "text",
    },
  },
  { kind: "RetryStart", data: {} },
  {
    kind: "RetryEnd",
    data: {
      attempts: 19,
      success: false,
      reason: "timeout",
      error: { name: "Error", message: "Timed out" },
    },
  },
  {
    kind: "ActionEnd",
    data: {
      action: "AssertK8sResourceAction",
      phase: "query",
      ok: false,
      error: {
        name: "Error",
        message: [
          "expect(received).toMatchObject(expected)",
          "",
          "  {",
          '+   "apiVersion": "v1",',
          '    "data": {',
          '-     "mode": "demo",',
          '+     "mode": "demo-1",',
          "+   },",
          '+   "kind": "ConfigMap",',
          '+   "metadata": {',
          '+     "annotations": {',
          '+       "kubectl.kubernetes.io/last-applied-configuration": ',
          '+ "{"apiVersion":"v1","data":{"mode":"demo-1"},"kind":"ConfigMap","metadata":{"annotations":{},"name":"my-config-1","namespace":"kest-7d4vc"}}',
          '+ "',
          "+ ,",
          "+     },",
          '+     "creationTimestamp": "2026-02-02T21:25:43Z",',
          '+     "name": "my-config-1",',
          '+     "namespace": "kest-7d4vc",',
          '+     "resourceVersion": "237000",',
          '+     "uid": "88f0f9c7-3402-496c-a06e-585a2572c862",',
          "    },",
          "  }",
          "",
          "- Expected  - 1",
          "+ Received  + 16",
        ].join("\n"),
      },
    },
  },

  { kind: "RevertingsStart", data: {} },
  {
    kind: "ActionStart",
    data: {
      action: "ApplyK8sResourceAction",
      phase: "revert",
      input: {
        kind: "ConfigMap",
        name: "my-config-2",
        namespace: "kest-z1cbd",
      },
    },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["delete", "ConfigMap/my-config-2", "-n", "kest-z1cbd"],
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: 'configmap "my-config-2" deleted from kest-z1cbd namespace\n',
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
  },
  {
    kind: "ActionEnd",
    data: { action: "ApplyK8sResourceAction", phase: "revert", ok: true },
  },

  {
    kind: "ActionStart",
    data: {
      action: "ApplyK8sResourceAction",
      phase: "revert",
      input: {
        kind: "ConfigMap",
        name: "my-config-1",
        namespace: "kest-z1cbd",
      },
    },
  },
  {
    kind: "CommandRun",
    data: {
      cmd: "kubectl",
      args: ["delete", "ConfigMap/my-config-1", "-n", "kest-z1cbd"],
    },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: 'configmap "my-config-1" deleted from kest-z1cbd namespace\n',
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
  },
  {
    kind: "ActionEnd",
    data: { action: "ApplyK8sResourceAction", phase: "revert", ok: true },
  },

  {
    kind: "ActionStart",
    data: {
      action: "CreateNamespaceAction",
      phase: "revert",
      input: { name: "kest-z1cbd" },
    },
  },
  {
    kind: "CommandRun",
    data: { cmd: "kubectl", args: ["delete", "namespace/kest-z1cbd"] },
  },
  {
    kind: "CommandResult",
    data: {
      exitCode: 0,
      stdout: 'namespace "kest-z1cbd" deleted\n',
      stderr: "",
      stdoutLanguage: "text",
      stderrLanguage: "text",
    },
  },
  {
    kind: "ActionEnd",
    data: { action: "CreateNamespaceAction", phase: "revert", ok: true },
  },
  { kind: "RevertingsEnd", data: {} },
];

test("markdown reporter output matches preview.md", async () => {
  const expected = await Bun.file(
    new URL("./preview.md", import.meta.url)
  ).text();
  const actual = await newMarkdownReporter().report(events);

  const normalize = (s: string) => s.replaceAll("\r\n", "\n");
  expect(normalize(actual)).toBe(normalize(expected));
});

test("renders non-diff error messages as text blocks", async () => {
  const events: ReadonlyArray<Event> = [
    { kind: "ScenarioStarted", data: { name: "non diff error" } },
    { kind: "BDDGiven", data: { description: "fails" } },
    {
      kind: "ActionStart",
      data: { action: "AssertK8sResourceAction", phase: "query" },
    },
    {
      kind: "ActionEnd",
      data: {
        action: "AssertK8sResourceAction",
        phase: "query",
        ok: false,
        error: { name: "Error", message: "Something went wrong" },
      },
    },
  ];

  const md = await newMarkdownReporter().report(events);
  expect(md).toContain("```text\nSomething went wrong\n```");
  expect(md).not.toContain("```diff\nSomething went wrong\n```");
});

test("unwraps retry timeout errors to show the underlying cause message", async () => {
  const events: ReadonlyArray<Event> = [
    { kind: "ScenarioStarted", data: { name: "unwrap timeout cause" } },
    { kind: "BDDThen", data: { description: "times out" } },
    {
      kind: "ActionStart",
      data: { action: "AssertK8sResourceAction", phase: "query" },
    },
    {
      kind: "ActionEnd",
      data: {
        action: "AssertK8sResourceAction",
        phase: "query",
        ok: false,
        // Model the `retryUntil()` timeout wrapper (`message`) with an embedded
        // cause containing the actual assertion diff (`cause.message`).
        error: {
          name: "Error",
          message: "Timed out after 5s",
          stack: [
            "Error: Timed out after 5s",
            "    at wrapper (WRAPPER:1:1)",
          ].join("\n"),
          cause: {
            name: "Error",
            message: ["- Expected", "+ Received"].join("\n"),
            stack: [
              "Error: - Expected",
              "    at cause (CAUSE:2:2)",
              "    at other (OTHER:3:3)",
            ].join("\n"),
          },
        } as unknown as ErrorSummary,
      },
    },
  ];

  const md = await newMarkdownReporter().report(events);
  expect(md).toContain("- Expected\n+ Received");
  expect(md).toContain("Trace:\n    at cause (CAUSE:2:2)");
  expect(md).not.toContain("at wrapper (WRAPPER:1:1)");
  expect(md).not.toContain("Timed out after 5s");
});

test("includes trace information in error blocks when stack is available", async () => {
  const events: ReadonlyArray<Event> = [
    { kind: "ScenarioStarted", data: { name: "trace" } },
    { kind: "BDDThen", data: { description: "fails with stack" } },
    {
      kind: "ActionStart",
      data: { action: "AssertK8sResourceAction", phase: "query" },
    },
    {
      kind: "ActionEnd",
      data: {
        action: "AssertK8sResourceAction",
        phase: "query",
        ok: false,
        error: {
          name: "Error",
          message: "Something went wrong",
          stack: [
            "Error: Something went wrong",
            "    at foo (FOO:1:1)",
            "    at bar (BAR:2:2)",
          ].join("\n"),
        } as unknown as ErrorSummary,
      },
    },
  ];

  const md = await newMarkdownReporter().report(events);
  expect(md).toContain(
    "```text\nSomething went wrong\n\nTrace:\n    at foo (FOO:1:1)"
  );
});
