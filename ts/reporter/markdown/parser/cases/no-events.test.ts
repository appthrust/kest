import type { Event } from "../../../../recording";
import type { Report } from "../../model";

export const state = "no events";
export const events = [] satisfies ReadonlyArray<Event>;
export const report = { scenarios: [] } satisfies Report;
