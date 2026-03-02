import { Duration } from "../../../../duration";
import type { Event } from "../../../../recording";
import type { Report } from "../../model";

const error = new Error("boom");
error.stack = "Error: boom\n    at test (example.test.ts:10:5)";

export const state = "action failed with text error";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" }, timestamp: 0 },
  { kind: "ActionStart", data: { description: "Check health" }, timestamp: 0 },
  { kind: "ActionEnd", data: { ok: false, error }, timestamp: 0 },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [
        { name: "Check health", status: "failure", duration: new Duration(0) },
      ],
      details: [
        {
          type: "Action",
          name: "Check health",
          commands: [],
          duration: new Duration(0),
          error: {
            message: { text: "boom", language: "text" },
            stack: "Error: boom\n    at test (example.test.ts:10:5)",
          },
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
