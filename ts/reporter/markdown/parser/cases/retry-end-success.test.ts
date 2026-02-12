import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "retry end success";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" } },
  { kind: "BDDThen", data: { description: "wait for readiness" } },
  { kind: "ActionStart", data: { description: "Assert `Pod` is Ready" } },
  { kind: "RetryStart", data: {} },
  { kind: "RetryEnd", data: { attempts: 5, success: true, reason: "success" } },
  { kind: "ActionEnd", data: { ok: true } },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [{ name: "Assert `Pod` is Ready", status: "success" }],
      details: [
        {
          type: "BDDSection",
          keyword: "then",
          description: "wait for readiness",
          actions: [
            { name: "Assert `Pod` is Ready", attempts: 5, commands: [] },
          ],
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
