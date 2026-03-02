import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "scenario started";
export const events = [
  { kind: "ScenarioStart", data: { name: "hello world" }, timestamp: 0 },
] satisfies ReadonlyArray<Event>;
export const report = {
  scenarios: [{ name: "hello world", overview: [], details: [], cleanup: [] }],
} satisfies Report;
