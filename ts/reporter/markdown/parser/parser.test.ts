import { expect, test } from "bun:test";
import type { Event } from "../../../recording";
import type { Report } from "../model";
import { parseEvents } from "./index";

interface ParserTestCase {
  readonly state: string;
  readonly events: ReadonlyArray<Event>;
  readonly report: Report;
}

const cases: Array<ParserTestCase> = [
  await import("./cases/action-running.test"),
  await import("./cases/action-outside-bdd-section.test"),
  await import("./cases/action-failed-with-text-error.test"),
  await import("./cases/retry-end-success.test"),
  await import("./cases/multiple-scenarios.test"),
  await import("./cases/scenario-started.test"),
  await import("./cases/bdd-section-opened.test"),
  await import("./cases/first-action-completed.test"),
  await import("./cases/second-action-completed.test"),
  await import("./cases/assert-failed-after-retry-timeout.test"),
  await import("./cases/revertings-completed.test"),
  await import("./cases/multiple-commands-in-action.test"),
  await import("./cases/no-events.test"),
];

test.each(cases)("parses $state", ({ events, report }) => {
  expect(parseEvents(events)).toEqual(report);
});
