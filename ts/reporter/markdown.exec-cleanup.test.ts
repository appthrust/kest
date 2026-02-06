import { expect, test } from "bun:test";
import type { Event } from "../recording";
import { newMarkdownReporter } from "./markdown";

test("does not emit empty shellsession for cleanup actions without commands", async () => {
  const events: Array<Event> = [
    { kind: "ScenarioStarted", data: { name: "shell command test example" } },
    { kind: "ActionStart", data: { action: "Exec", phase: "mutate" } },
    { kind: "ActionEnd", data: { action: "Exec", phase: "mutate", ok: true } },
    { kind: "RevertingsStart", data: {} },
    { kind: "ActionStart", data: { action: "Exec", phase: "revert" } },
    { kind: "ActionEnd", data: { action: "Exec", phase: "revert", ok: true } },
    { kind: "RevertingsEnd", data: {} },
  ];

  const reporter = newMarkdownReporter();
  const md = await reporter.report(events);

  expect(md).toContain("### Cleanup");
  expect(md).not.toContain("```shellsession");
});
