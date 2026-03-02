import { Duration } from "../../../../duration";
import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "retry end success";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" }, timestamp: 0 },
  {
    kind: "BDDThen",
    data: { description: "wait for readiness" },
    timestamp: 0,
  },
  {
    kind: "ActionStart",
    data: { description: "Assert `Pod` is Ready" },
    timestamp: 0,
  },
  { kind: "RetryStart", data: {}, timestamp: 0 },
  {
    kind: "RetryEnd",
    data: { attempts: 5, success: true, reason: "success" },
    timestamp: 0,
  },
  { kind: "ActionEnd", data: { ok: true }, timestamp: 0 },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [
        {
          name: "Assert `Pod` is Ready",
          status: "success",
          duration: new Duration(0),
        },
      ],
      details: [
        {
          type: "BDDSection",
          keyword: "then",
          description: "wait for readiness",
          actions: [
            {
              name: "Assert `Pod` is Ready",
              attempts: 5,
              commands: [],
              duration: new Duration(0),
            },
          ],
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
