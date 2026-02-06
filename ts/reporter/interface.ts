import type { Event } from "../recording";

export interface Reporter {
  report(events: ReadonlyArray<Event>): Promise<string>;
}
