import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "action failed with text error";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" } },
  { kind: "ActionStart", data: { description: "Check health" } },
  { kind: "ActionEnd", data: { ok: false, error: new Error("boom") } },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [{ name: "Check health", status: "failure" }],
      details: [
        {
          type: "Action",
          name: "Check health",
          commands: [],
          error: { message: { text: "boom", language: "text" } },
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
