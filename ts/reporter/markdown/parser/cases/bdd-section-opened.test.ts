import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "BDD section opened";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" } },
  { kind: "BDDGiven", data: { description: "create Namespace" } },
] satisfies ReadonlyArray<Event>;

export const report = {
  scenarios: [
    {
      name: "hello world",
      overview: [],
      details: [
        {
          type: "BDDSection",
          keyword: "given",
          description: "create Namespace",
          actions: [],
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;
