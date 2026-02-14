import type { Event } from "../../recording";
import type { Reporter } from "../interface";
import { parseEvents } from "./parser";
import { renderReport } from "./renderer";

export interface MarkdownReporterOptions {
  /**
   * If true, keep ANSI escape codes (colors) in error messages.
   * If false (default), remove ANSI escape codes.
   */
  enableANSI?: undefined | boolean;
  workspaceRoot?: undefined | string;
}

export function newMarkdownReporter(
  options: MarkdownReporterOptions = {}
): Reporter {
  return {
    report(events: ReadonlyArray<Event>): Promise<string> {
      const report = parseEvents(events);
      return renderReport(report, options);
    },
  };
}
