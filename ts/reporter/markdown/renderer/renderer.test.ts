import { encode } from "@taml/encoder";
import type { MarkdownReporterOptions } from "../index";
import type { Report } from "../model";
import { renderReport } from "./index";

interface RendererTestCase {
  report: Report;
  options: MarkdownReporterOptions;
}

export async function run(testCase: RendererTestCase): Promise<string> {
  const { report, options } = testCase;
  let result = await renderReport(report, options);
  if (options.enableANSI) {
    result = encode(result); // to make ANSI escapes visible in the snapshot
    if (!result.endsWith("\n")) {
      result += "\n";
    }
  }
  return result;
}
