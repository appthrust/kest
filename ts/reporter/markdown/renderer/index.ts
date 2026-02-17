import { codeToANSIForcedColors } from "../../shiki";
import type { MarkdownReporterOptions } from "../index";
import type { Action, Report } from "../model";
import { stripAnsi } from "../strip-ansi";
import { renderTrace } from "../trace/render";

const markdownLang = "markdown";
const markdownTheme = "catppuccin-mocha";

type StdinReplacement = Readonly<{
  placeholder: string;
  stdin: string;
  stdinLanguage: string;
}>;

type TraceReplacement = Readonly<{
  placeholder: string;
  rawStack: string;
}>;

function normalizeStdin(stdin: string): string {
  // Match `ts/reporter/markdown.ts` behavior: keep content stable.
  return stdin.replace(/^\n/, "").replace(/\s+$/, "");
}

function applyStdinReplacements(
  highlightedMarkdown: string,
  replacements: ReadonlyArray<StdinReplacement>
): string {
  if (replacements.length === 0) {
    return highlightedMarkdown;
  }

  let current = highlightedMarkdown;
  for (const r of replacements) {
    const lines = current.split("\n");
    const stdinLines = r.stdin.split("\n");
    const out: Array<string> = [];
    for (const line of lines) {
      if (stripAnsi(line).includes(r.placeholder)) {
        out.push(...stdinLines);
      } else {
        out.push(line);
      }
    }
    current = out.join("\n");
  }
  return current;
}

async function resolveTraceReplacements(
  markdown: string,
  replacements: ReadonlyArray<TraceReplacement>,
  options: MarkdownReporterOptions
): Promise<string> {
  if (replacements.length === 0) {
    return markdown;
  }

  let current = markdown;
  for (const r of replacements) {
    const rendered = await renderTrace(r.rawStack, {
      workspaceRoot: options.workspaceRoot,
      enableANSI: options.enableANSI,
    });

    if (rendered) {
      current = current.replace(r.placeholder, rendered);
    } else {
      // Remove the entire trace code block (fences + placeholder + blank line)
      current = current.replace(
        `\`\`\`ts title="trace"\n${r.placeholder}\n\`\`\`\n\n`,
        ""
      );
    }
  }
  return current;
}

async function highlightMarkdown(
  markdown: string,
  stdinReplacements: ReadonlyArray<StdinReplacement>,
  traceReplacements: ReadonlyArray<TraceReplacement>,
  options: MarkdownReporterOptions
): Promise<string> {
  const stripped = stripAnsi(markdown);
  try {
    const highlightedMarkdown = await codeToANSIForcedColors(
      stripped,
      markdownLang,
      markdownTheme
    );

    let result = highlightedMarkdown;

    if (stdinReplacements.length > 0) {
      const highlightedStdinList = await Promise.all(
        stdinReplacements.map(async (r) => {
          const highlightedStdin = await codeToANSIForcedColors(
            r.stdin,
            r.stdinLanguage,
            markdownTheme
          );
          // Avoid inserting an extra blank line before `EOF`.
          const trimmed = trimFinalNewline(
            highlightedStdin.replace(/\n+$/, "\n")
          );
          return { ...r, stdin: trimmed } satisfies StdinReplacement;
        })
      );
      result = applyStdinReplacements(result, highlightedStdinList);
    }

    result = await resolveTraceReplacements(result, traceReplacements, options);

    return result.replace(/\n+$/, "\n");
  } catch {
    return stripped;
  }
}

function trimFinalNewline(input: string): string {
  return input.replace(/\n$/, "");
}

function toBddHeading(keyword: string): string {
  if (keyword.length === 0) {
    return keyword;
  }
  return keyword.charAt(0).toUpperCase() + keyword.slice(1);
}

const statusEmojiByStatus = {
  pending: "⏳",
  success: "✅",
  failure: "❌",
} as const;

function statusEmoji(status: keyof typeof statusEmojiByStatus): string {
  return statusEmojiByStatus[status];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rendering is intentionally linear and explicit
export async function renderReport(
  report: Report,
  options: MarkdownReporterOptions
): Promise<string> {
  const enableANSI = options.enableANSI ?? false;

  const renderedScenarios: Array<string> = [];
  const stdinReplacements: Array<StdinReplacement> = [];
  const traceReplacements: Array<TraceReplacement> = [];
  let stdinSeq = 0;
  let traceSeq = 0;

  for (const scenario of report.scenarios) {
    const isEmpty =
      scenario.overview.length === 0 &&
      scenario.details.length === 0 &&
      scenario.cleanup.length === 0 &&
      !scenario.cleanupSkipped;
    if (isEmpty) {
      continue;
    }

    const overviewStatusByName = new Map<
      string,
      "pending" | "success" | "failure"
    >(scenario.overview.map((o) => [o.name, o.status]));

    const lines: Array<string> = [];

    lines.push(`# ${stripAnsi(scenario.name)}`);
    lines.push("");

    // Overview
    lines.push("## Scenario Overview");
    lines.push("");
    lines.push("| # | Action | Status |");
    lines.push("|---|--------|--------|");
    for (const [i, item] of scenario.overview.entries()) {
      lines.push(
        `| ${i + 1} | ${stripAnsi(item.name)} | ${statusEmoji(item.status)} |`
      );
    }
    lines.push("");

    // Details
    lines.push("## Scenario Details");
    lines.push("");

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rendering is intentionally linear and explicit
    const renderAction = (action: Action) => {
      let status = overviewStatusByName.get(action.name);
      if (!status) {
        if (action.error) {
          status = "failure";
        } else if (action.commands.length > 0) {
          status = "success";
        } else {
          status = "pending";
        }
      }
      const emoji = statusEmoji(status);
      const attemptsSuffix =
        status === "failure" && typeof action.attempts === "number"
          ? ` (Failed after ${action.attempts} attempts)`
          : "";

      lines.push(`**${emoji} ${stripAnsi(action.name)}**${attemptsSuffix}`);
      lines.push("");

      for (const cmd of action.commands) {
        const base = [cmd.cmd, ...cmd.args].join(" ").trim();
        const stdin = cmd.stdin?.text;
        const stdinLanguage = cmd.stdin?.language ?? "text";

        lines.push("```shell");
        if (typeof stdin === "string") {
          lines.push(`${base} <<EOF`);
          if (enableANSI) {
            const placeholder = `__KEST_STDIN_${stdinSeq++}__`;
            stdinReplacements.push({
              placeholder,
              stdin: normalizeStdin(stripAnsi(stdin)),
              stdinLanguage,
            });
            lines.push(placeholder);
          } else {
            lines.push(stripAnsi(stdin));
          }
          lines.push("EOF");
        } else {
          lines.push(base);
        }
        lines.push("```");
        lines.push("");

        const stdout = stripAnsi(cmd.stdout?.text ?? "");
        if (stdout.trim().length > 0) {
          const lang = cmd.stdout?.language ?? "text";
          lines.push(`\`\`\`${lang} title="stdout"`);
          lines.push(trimFinalNewline(stdout));
          lines.push("```");
          lines.push("");
        }

        const stderr = stripAnsi(cmd.stderr?.text ?? "");
        if (stderr.trim().length > 0) {
          const lang = cmd.stderr?.language ?? "text";
          lines.push(`\`\`\`${lang} title="stderr"`);
          lines.push(trimFinalNewline(stderr));
          lines.push("```");
          lines.push("");
        }
      }

      if (status === "failure" && action.error?.message?.text) {
        const messageText = stripAnsi(action.error.message.text);
        const lang = action.error.message.language ?? "text";
        lines.push("Error:");
        lines.push("");
        lines.push(`\`\`\`${lang} title="message"`);
        lines.push(trimFinalNewline(messageText));
        lines.push("```");
        lines.push("");

        if (action.error?.stack) {
          const placeholder = `__KEST_TRACE_${traceSeq++}__`;
          traceReplacements.push({
            placeholder,
            rawStack: action.error.stack,
          });
          lines.push('```ts title="trace"');
          lines.push(placeholder);
          lines.push("```");
          lines.push("");
        }
      }
    };

    for (const item of scenario.details) {
      if (item.type === "BDDSection") {
        lines.push(
          `### ${toBddHeading(item.keyword)}: ${stripAnsi(item.description)}`
        );
        lines.push("");
        for (const action of item.actions) {
          renderAction(action);
        }
      }
      if (item.type === "Action") {
        renderAction(item);
      }
    }

    // Cleanup
    if (scenario.cleanupSkipped) {
      lines.push("### Cleanup (skipped)");
      lines.push("");
      lines.push(
        "Cleanup was skipped because `KEST_PRESERVE_ON_FAILURE=1` is set."
      );
      lines.push(
        "Resources created during this scenario were **not** deleted."
      );
      lines.push(
        "To clean up manually, run the revert commands from a passing test run."
      );
    } else if (scenario.cleanup.length > 0) {
      lines.push("### Cleanup");
      lines.push("");
      lines.push("| # | Action | Status |");
      lines.push("|---|--------|--------|");
      for (const [i, item] of scenario.cleanup.entries()) {
        lines.push(
          `| ${i + 1} | ${stripAnsi(item.action)} | ${item.status === "success" ? "✅" : "❌"} |`
        );
      }
      lines.push("");

      lines.push("```shellsession");
      for (const [i, item] of scenario.cleanup.entries()) {
        if (i > 0) {
          lines.push("");
        }
        const base = [item.command.cmd, ...item.command.args].join(" ").trim();
        lines.push(`$ ${stripAnsi(base)}`);
        const output = stripAnsi(item.command.output);
        if (output.trim().length > 0) {
          lines.push(trimFinalNewline(output));
        }
      }
      lines.push("```");
    }

    renderedScenarios.push(lines.join("\n"));
  }

  if (renderedScenarios.length === 0) {
    return Promise.resolve("");
  }
  const rendered = renderedScenarios.join("\n\n");
  const markdown = rendered.endsWith("\n") ? rendered : `${rendered}\n`;
  if (!enableANSI) {
    const resolved = await resolveTraceReplacements(
      markdown,
      traceReplacements,
      options
    );
    return resolved;
  }
  return highlightMarkdown(
    markdown,
    stdinReplacements,
    traceReplacements,
    options
  );
}
