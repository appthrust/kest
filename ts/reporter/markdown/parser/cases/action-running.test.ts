import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "action running";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" } },
  { kind: "BDDGiven", data: { description: "create Namespace" } },
  {
    kind: "ActionStart",
    data: { description: "Apply Namespace `kest-abc12`" },
  },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [{ name: "Apply Namespace `kest-abc12`", status: "pending" }],
      details: [
        {
          type: "BDDSection",
          keyword: "given",
          description: "create Namespace",
          actions: [{ name: "Apply Namespace `kest-abc12`" }],
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
