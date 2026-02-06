import { codeToANSI } from "@shikijs/cli";
import shellEscapeArg from "@suin/shell-escape-arg";
import { parseK8sResourceYaml } from "../k8s-resource";
import type { Event } from "../recording";
import type { Reporter } from "./interface";

export interface MarkdownReporterOptions {
  /**
   * If true, keep ANSI escape codes (colors) in error messages.
   * If false (default), remove ANSI escape codes.
   */
  enableANSI?: boolean;
}

type BddKeyword = "Given" | "When" | "Then" | "And" | "But";
type ActionInput = Readonly<{
  kind?: string | undefined;
  name?: string | undefined;
  namespace?: string | undefined;
}>;

const markdownLang = "markdown";
const markdownTheme = "catppuccin-mocha";
const codeToANSICompat = codeToANSI as unknown as (
  code: string,
  language: string,
  theme: string
) => Promise<string>;

async function highlightCode(
  source: string,
  language: string
): Promise<string> {
  try {
    return await codeToANSICompat(source, language, markdownTheme);
  } catch {
    return source;
  }
}

function normalizeStdin(stdin: string): string {
  return stdin.replace(/^\n/, "").replace(/\s+$/, "");
}

function mergeActionInput(
  primary: ActionInput,
  fallback: ActionInput
): ActionInput {
  return {
    kind: primary.kind ?? fallback.kind,
    name: primary.name ?? fallback.name,
    namespace: primary.namespace ?? fallback.namespace,
  };
}

function normalizeActionName(actionName: string): string {
  switch (actionName) {
    case "CreateNamespaceAction":
      return "ApplyNamespace";
    case "ApplyK8sResourceAction":
      return "Apply";
    case "AssertK8sResourceAction":
      return "Assert";
    case "GetResourceAction":
      return "Get";
    default:
      return actionName;
  }
}

function normalizeKind(kind: string): string {
  const trimmed = kind.trim();
  if (!trimmed) {
    return kind;
  }
  const [base] = trimmed.split(".");
  return base ?? trimmed;
}

function extractNamespace(args: ReadonlyArray<string>): string | undefined {
  const idx = args.findIndex((arg) => arg === "-n" || arg === "--namespace");
  if (idx === -1) {
    return undefined;
  }
  const value = args[idx + 1];
  if (!value || value.startsWith("-")) {
    return undefined;
  }
  return value;
}

function parseResourceRef(ref: string): ActionInput {
  const [rawKind, rawName] = ref.split("/", 2);
  if (!rawKind) {
    return {};
  }
  const kind = normalizeKind(rawKind);
  const name = rawName && rawName.length > 0 ? rawName : undefined;
  return { kind, name };
}

function inferActionInputFromArgs(args: ReadonlyArray<string>): ActionInput {
  const namespace = extractNamespace(args);
  const base: ActionInput = namespace ? { namespace } : {};
  const subcommand = args[0];
  if (subcommand !== "get" && subcommand !== "delete") {
    return base;
  }
  const ref = args[1];
  if (!ref || ref.startsWith("-")) {
    return base;
  }
  if (ref.includes("/")) {
    return mergeActionInput(parseResourceRef(ref), base);
  }
  const kind = normalizeKind(ref);
  const maybeName = args[2];
  const name = maybeName && !maybeName.startsWith("-") ? maybeName : undefined;
  return mergeActionInput({ kind, name }, base);
}

function inferActionInputFromStdin(stdin: string): ActionInput {
  try {
    const parsed = parseK8sResourceYaml(stdin);
    if (parsed.ok) {
      return {
        kind: parsed.value.kind,
        name: parsed.value.metadata?.name,
        namespace: parsed.value.metadata?.namespace,
      };
    }
  } catch {
    // Ignore stdin parse errors and fall back to args.
  }
  return {};
}

function inferActionInputFromCommand(
  run: Extract<Event, { kind: "CommandRun" }>
): ActionInput {
  const fromArgs = inferActionInputFromArgs(run.data.args);
  const fromStdin = run.data.stdin
    ? inferActionInputFromStdin(run.data.stdin)
    : {};
  return mergeActionInput(fromStdin, fromArgs);
}

function isNamespaceKind(kind?: string): boolean {
  return typeof kind === "string" && kind.toLowerCase() === "namespace";
}

function toActionInputRecord(
  input: ActionInput
): Readonly<Record<string, unknown>> | undefined {
  const record: Record<string, unknown> = {};
  if (input.kind) {
    record["kind"] = input.kind;
  }
  if (input.name) {
    record["name"] = input.name;
  }
  if (input.namespace) {
    record["namespace"] = input.namespace;
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

type StdinReplacement = Readonly<{
  placeholder: string;
  stdin: string;
  stdinLanguage: string;
}>;

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

type BddContext = Readonly<{
  keyword: BddKeyword;
  description: string;
}>;

interface CommandPair {
  run: Extract<Event, { kind: "CommandRun" }>;
  result?: Extract<Event, { kind: "CommandResult" }>;
}

interface ActionContext {
  bdd?: BddContext;
  start: Extract<Event, { kind: "ActionStart" }>;
  end?: Extract<Event, { kind: "ActionEnd" }>;
  error?: ActionErrorModel;
  commandPairs: Array<CommandPair>;
  sawCommandBeforeRetryStart: boolean;
  retryStarted: boolean;
  retryEnd?: Extract<Event, { kind: "RetryEnd" }>;
  derivedInput?: ActionInput;
}

type ActionEndError = Extract<Event, { kind: "ActionEnd" }>["data"]["error"];

type ActionErrorModel = Readonly<{
  name?: string | undefined;
  message: string;
  isDiff: boolean;
  trace?: string | undefined;
}>;

function extractStack(errorLike: unknown): string | undefined {
  if (!errorLike || typeof errorLike !== "object") {
    return undefined;
  }
  const stack = (errorLike as { stack?: unknown }).stack;
  return typeof stack === "string" ? stack : undefined;
}

function toTrace(stack?: string): string | undefined {
  if (!stack) {
    return undefined;
  }
  const stripped = stripAnsi(stack);
  const lines = stripped.split(/\r?\n/);
  if (lines.length === 0) {
    return undefined;
  }
  // Drop the header line like "Error: message" to keep the trace concise.
  if (lines[0] && !/^\s*at\b/.test(lines[0])) {
    lines.shift();
  }
  while (lines.length > 0 && lines[0]?.trim() === "") {
    lines.shift();
  }
  // Preserve leading indentation (e.g. "    at ...") but remove trailing whitespace.
  const trace = lines.join("\n").replace(/\s+$/, "");
  return trace.length > 0 ? trace : undefined;
}

function unwrapRetryTimeoutCauseMessage(
  error: ActionEndError
):
  | { name?: string | undefined; message: string; stack?: string | undefined }
  | undefined {
  if (!error?.message) {
    return undefined;
  }
  // `retryUntil()` throws a timeout error whose `cause` is the last failure.
  // Prefer the cause message so the report shows the underlying assertion diff.
  const raw = stripAnsi(error.message).trim();
  if (!raw.startsWith("Timed out after ")) {
    return undefined;
  }
  const cause = (error as unknown as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") {
    return undefined;
  }
  const maybeCause = cause as { name?: unknown; message?: unknown };
  if (
    typeof maybeCause.message !== "string" ||
    maybeCause.message.length === 0
  ) {
    return undefined;
  }
  return {
    name: typeof maybeCause.name === "string" ? maybeCause.name : undefined,
    message: maybeCause.message,
    stack: extractStack(cause),
  };
}

function stripAnsi(input: string): string {
  // Prefer Bun's built-in ANSI stripper when available.
  if (typeof Bun !== "undefined" && typeof Bun.stripANSI === "function") {
    return Bun.stripANSI(input);
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intended
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

function trimFinalNewline(s: string): string {
  return s.replace(/\n$/, "");
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: diff detection relies on a small set of explicit heuristics
function isDiffLikeMessage(message: string): boolean {
  const stripped = stripAnsi(message).trim();
  if (!stripped) {
    return false;
  }

  const lines = stripped.split(/\r?\n/);

  // Strong indicators (avoid YAML doc '---' by requiring both headers).
  if (lines.some((l) => /^diff --git\b/.test(l))) {
    return true;
  }
  if (lines.some((l) => l.startsWith("@@ "))) {
    return true;
  }
  const hasUnifiedHeaders =
    lines.some((l) => l.startsWith("--- ")) &&
    lines.some((l) => l.startsWith("+++ "));
  if (hasUnifiedHeaders) {
    return true;
  }

  // Bun/Jest-style summaries.
  const hasExpected = lines.some((l) => l.startsWith("- Expected"));
  const hasReceived = lines.some((l) => l.startsWith("+ Received"));
  if (hasExpected && hasReceived) {
    return true;
  }

  // Added/removed lines (ignore unified diff file headers).
  let sawAdded = false;
  let sawRemoved = false;
  for (const l of lines) {
    if (!sawAdded && l.startsWith("+") && !l.startsWith("+++")) {
      if (l.slice(1).trim().length > 0) {
        sawAdded = true;
      }
      continue;
    }
    if (!sawRemoved && l.startsWith("-") && !l.startsWith("---")) {
      if (l.slice(1).trim().length > 0) {
        sawRemoved = true;
      }
      continue;
    }
    if (sawAdded && sawRemoved) {
      return true;
    }
  }
  return sawAdded && sawRemoved;
}

function toActionErrorModel(
  error: ActionEndError
): ActionErrorModel | undefined {
  if (!error) {
    return undefined;
  }
  const unwrapped = unwrapRetryTimeoutCauseMessage(error);
  const message = unwrapped?.message ?? error.message;
  const stack = unwrapped?.stack ?? extractStack(error);
  const trace = toTrace(stack);
  return {
    name: unwrapped?.name ?? error.name,
    message,
    isDiff: isDiffLikeMessage(message),
    ...(trace ? { trace } : {}),
  };
}

function bddFromEvent(e: Event): BddContext | undefined {
  switch (e.kind) {
    case "BDDGiven":
      return { keyword: "Given", description: e.data.description };
    case "BDDWhen":
      return { keyword: "When", description: e.data.description };
    case "BDDThen":
      return { keyword: "Then", description: e.data.description };
    case "BDDAnd":
      return { keyword: "And", description: e.data.description };
    case "BDBut":
      return { keyword: "But", description: e.data.description };
    default:
      return undefined;
  }
}

function formatShellCommand(
  run: Extract<Event, { kind: "CommandRun" }>
): string {
  const base = [run.data.cmd, ...run.data.args]
    .map(shellEscapeArg)
    .join(" ")
    .trim();
  if (!run.data.stdin) {
    return base;
  }

  // Match preview.md style:
  // kubectl apply -f - <<EOF
  // <stdin>
  // EOF
  return `${base} <<EOF\n${run.data.stdin}\nEOF`;
}

function formatShellCommandWithPlaceholder(
  run: Extract<Event, { kind: "CommandRun" }>,
  placeholder: string
): string {
  const base = [run.data.cmd, ...run.data.args]
    .map(shellEscapeArg)
    .join(" ")
    .trim();
  if (!run.data.stdin) {
    return base;
  }
  return `${base} <<EOF\n${placeholder}\nEOF`;
}

function languageOrDefault(lang?: string): string {
  if (!lang) {
    return "text";
  }
  return lang;
}

function getActionInput(
  action: Extract<Event, { kind: "ActionStart" }>
): Readonly<Record<string, unknown>> {
  return (action.data.input ?? {}) as Readonly<Record<string, unknown>>;
}

function getInputString(
  input: Readonly<Record<string, unknown>>,
  key: string
): string | undefined {
  const v = input[key];
  return typeof v === "string" ? v : undefined;
}

function overviewActionLabel(actionName: string, phase: string): string {
  const normalized = normalizeActionName(actionName);
  if (normalized === "ApplyNamespace") {
    return phase === "revert" ? "Delete namespace" : "Create namespace";
  }
  if (normalized === "Apply") {
    return phase === "revert" ? "Delete" : "Apply";
  }
  if (normalized === "Assert") {
    return "Assert";
  }
  if (normalized === "Get") {
    return "Get";
  }
  if (normalized === "Exec") {
    return "Exec";
  }
  return normalized;
}

function detailsActionLabel(actionName: string, phase: string): string {
  const normalized = normalizeActionName(actionName);
  if (normalized === "ApplyNamespace") {
    return phase === "revert" ? "Delete Namespace" : "Create Namespace";
  }
  if (normalized === "Apply") {
    return phase === "revert" ? "Delete" : "Apply";
  }
  if (normalized === "Assert") {
    return "Assert";
  }
  if (normalized === "Get") {
    return "Get";
  }
  if (normalized === "Exec") {
    return "Exec";
  }
  return normalized;
}

function resolveActionInput(ctx: ActionContext): ActionInput {
  const input = getActionInput(ctx.start);
  const fromStart: ActionInput = {
    kind: getInputString(input, "kind"),
    name: getInputString(input, "name"),
    namespace: getInputString(input, "namespace"),
  };
  const firstPair = ctx.commandPairs.at(0);
  const fallback =
    ctx.derivedInput ??
    (firstPair ? inferActionInputFromCommand(firstPair.run) : {});
  return mergeActionInput(fromStart, fallback);
}

function resourceForAction(ctx: ActionContext): string {
  const input = resolveActionInput(ctx);
  const action = normalizeActionName(ctx.start.data.action);

  if (action === "ApplyNamespace") {
    return input.name ?? "N/A";
  }

  const kind = input.kind;
  const name = input.name;
  if (kind && name) {
    return `${kind}/${name}`;
  }
  return name ?? kind ?? "N/A";
}

function detailsTitleForAction(ctx: ActionContext): string {
  const action = normalizeActionName(ctx.start.data.action);
  const phase = ctx.start.data.phase;
  const input = resolveActionInput(ctx);

  const label = detailsActionLabel(action, phase);
  if (action === "ApplyNamespace") {
    const name = input.name ?? "";
    return `${label} "${name}"`;
  }

  const kind = input.kind;
  const name = input.name;
  const ns = input.namespace;
  if (ns) {
    const base = [kind, name ? `"${name}"` : ""].filter(Boolean).join(" ");
    if (base) {
      return `${label} ${base} in namespace "${ns}"`;
    }
    return `${label} in namespace "${ns}"`;
  }
  const base = [kind, name ? `"${name}"` : ""].filter(Boolean).join(" ");
  if (base) {
    return `${label} ${base}`;
  }
  return label;
}

function actionOk(ctx: ActionContext): boolean {
  if (ctx.end) {
    return ctx.end.data.ok;
  }
  const lastResult = ctx.commandPairs.at(-1)?.result;
  if (lastResult) {
    return lastResult.data.exitCode === 0;
  }
  if (ctx.retryEnd && !ctx.retryEnd.data.success) {
    return false;
  }
  return true;
}

function computeFailedAttemptsSuffix(ctx: ActionContext): string {
  if (!ctx.end || ctx.end.data.ok) {
    return "";
  }
  if (!ctx.retryEnd || ctx.retryEnd.data.success) {
    return "";
  }

  const base = ctx.retryEnd.data.attempts;
  const total = ctx.sawCommandBeforeRetryStart ? base + 1 : base;
  return ` (Failed after ${total} attempts)`;
}

type ScenarioReportModel = Readonly<{
  scenarioName: string;
  overviewActions: Array<ActionContext>;
  cleanupActions: Array<ActionContext>;
  bddOrder: Array<BddContext>;
}>;

const bddKey = (b: BddContext) => `${b.keyword}\u0000${b.description}`;

function buildBddOrder(
  overviewActions: ReadonlyArray<ActionContext>
): Array<BddContext> {
  const bddOrder: Array<BddContext> = [];
  const bddKeyToIndex = new Map<string, number>();
  for (const a of overviewActions) {
    const b = a.bdd;
    if (!b) {
      continue;
    }
    const key = bddKey(b);
    if (!bddKeyToIndex.has(key)) {
      bddKeyToIndex.set(key, bddOrder.length);
      bddOrder.push(b);
    }
  }
  return bddOrder;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: event parsing is intentionally linear but verbose
function parseScenarioReportModel(
  events: ReadonlyArray<Event>
): ScenarioReportModel {
  let scenarioName = "Scenario";
  const actions: Array<ActionContext> = [];
  let currentBdd: BddContext | undefined;
  let currentAction: ActionContext | undefined;
  let inCleanup = false;
  let hasExplicitCleanupActions = false;
  let pendingCleanupCommand: CommandPair | undefined;

  const finalizeCurrentAction = () => {
    if (currentAction) {
      actions.push(currentAction);
      currentAction = undefined;
    }
  };

  const pushImplicitCleanupAction = (pair: CommandPair) => {
    const inferredInput = inferActionInputFromCommand(pair.run);
    const actionName = isNamespaceKind(inferredInput.kind)
      ? "ApplyNamespace"
      : "Apply";
    const inputRecord = toActionInputRecord(inferredInput);
    const start: Extract<Event, { kind: "ActionStart" }> = {
      kind: "ActionStart",
      data: {
        action: actionName,
        phase: "revert",
        ...(inputRecord ? { input: inputRecord } : {}),
      },
    };
    actions.push({
      start,
      commandPairs: [pair],
      sawCommandBeforeRetryStart: true,
      retryStarted: false,
      derivedInput: inferredInput,
    });
  };

  for (const e of events) {
    if (e.kind === "ScenarioStarted") {
      scenarioName = e.data.name;
      continue;
    }

    if (e.kind === "RevertingsStart") {
      finalizeCurrentAction();
      inCleanup = true;
      hasExplicitCleanupActions = false;
      pendingCleanupCommand = undefined;
      continue;
    }

    if (e.kind === "RevertingsEnd") {
      finalizeCurrentAction();
      if (inCleanup && !hasExplicitCleanupActions && pendingCleanupCommand) {
        pushImplicitCleanupAction(pendingCleanupCommand);
        pendingCleanupCommand = undefined;
      }
      inCleanup = false;
      continue;
    }

    const bdd = bddFromEvent(e);
    if (bdd) {
      finalizeCurrentAction();
      currentBdd = bdd;
      continue;
    }

    if (e.kind === "ActionStart") {
      finalizeCurrentAction();
      currentAction = {
        ...(currentBdd ? { bdd: currentBdd } : {}),
        start: e,
        commandPairs: [],
        sawCommandBeforeRetryStart: false,
        retryStarted: false,
      };
      if (inCleanup && e.data.phase === "revert") {
        hasExplicitCleanupActions = true;
      }
      continue;
    }

    if (e.kind === "CommandRun") {
      if (inCleanup && !hasExplicitCleanupActions && !currentAction) {
        pendingCleanupCommand = { run: e };
        continue;
      }
      if (currentAction) {
        currentAction.commandPairs.push({ run: e });
        currentAction.derivedInput = mergeActionInput(
          currentAction.derivedInput ?? {},
          inferActionInputFromCommand(e)
        );
        if (!currentAction.retryStarted) {
          currentAction.sawCommandBeforeRetryStart = true;
        }
      }
      continue;
    }

    if (e.kind === "CommandResult") {
      if (inCleanup && !hasExplicitCleanupActions && pendingCleanupCommand) {
        pendingCleanupCommand.result = e;
        pushImplicitCleanupAction(pendingCleanupCommand);
        pendingCleanupCommand = undefined;
        continue;
      }
      if (currentAction) {
        const last = currentAction.commandPairs.at(-1);
        if (last && !last.result) {
          last.result = e;
        }
      }
      continue;
    }

    if (e.kind === "RetryStart") {
      if (currentAction) {
        currentAction.retryStarted = true;
      }
      continue;
    }

    if (e.kind === "RetryEnd") {
      if (currentAction) {
        currentAction.retryEnd = e;
      }
      continue;
    }

    if (e.kind === "ActionEnd" && currentAction) {
      currentAction.end = e;
      const error = toActionErrorModel(e.data.error);
      if (error) {
        currentAction.error = error;
      }
      actions.push(currentAction);
      currentAction = undefined;
    }
  }

  finalizeCurrentAction();
  if (inCleanup && !hasExplicitCleanupActions && pendingCleanupCommand) {
    pushImplicitCleanupAction(pendingCleanupCommand);
    pendingCleanupCommand = undefined;
  }

  const overviewActions = actions.filter(
    (a) => a.start.data.phase !== "revert"
  );
  const cleanupActions = actions.filter((a) => a.start.data.phase === "revert");
  const bddOrder = buildBddOrder(overviewActions);

  return { scenarioName, overviewActions, cleanupActions, bddOrder };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: markdown report generation is intentionally linear but verbose
async function renderScenarioReport(
  model: ScenarioReportModel,
  options: { enableANSI: boolean }
): Promise<string> {
  const { scenarioName, overviewActions, cleanupActions, bddOrder } = model;
  const enableANSI = options.enableANSI;
  const lines: Array<string> = [];
  const stdinReplacements: Array<StdinReplacement> = [];
  let stdinSeq = 0;

  lines.push(`# ${scenarioName}`);
  lines.push("");

  // Overview
  lines.push("## Scenario Overview");
  lines.push("");
  lines.push("| # | Action | Resource | Status |");
  lines.push("|---|--------|----------|--------|");
  for (const [i, a] of overviewActions.entries()) {
    const ok = actionOk(a);
    const actionLabel = overviewActionLabel(
      a.start.data.action,
      a.start.data.phase
    );
    const resource = resourceForAction(a);
    lines.push(
      `| ${i + 1} | ${actionLabel} | ${resource} | ${ok ? "✅" : "❌"} |`
    );
  }
  lines.push("");

  // Details (group by BDD in order)
  lines.push("## Scenario Details");
  lines.push("");

  for (const bdd of bddOrder) {
    lines.push(`### ${bdd.keyword}: ${bdd.description}`);
    lines.push("");

    for (const a of overviewActions.filter(
      (x) => x.bdd && bddKey(x.bdd) === bddKey(bdd)
    )) {
      const ok = actionOk(a);
      const emoji = ok ? "✅" : "❌";
      const title = detailsTitleForAction(a);
      const failureSuffix = computeFailedAttemptsSuffix(a);

      lines.push(`**${emoji} ${title}**${failureSuffix}`);
      lines.push("");

      const chosen = a.commandPairs.at(-1);
      if (chosen) {
        lines.push("```shell");
        if (enableANSI && chosen.run.data.stdin) {
          const placeholder = `__KEST_STDIN_${stdinSeq++}__`;
          stdinReplacements.push({
            placeholder,
            stdin: normalizeStdin(chosen.run.data.stdin),
            stdinLanguage: chosen.run.data.stdinLanguage ?? "text",
          });
          lines.push(
            formatShellCommandWithPlaceholder(chosen.run, placeholder)
          );
        } else {
          lines.push(formatShellCommand(chosen.run));
        }
        lines.push("```");
        lines.push("");

        const r = chosen.result;
        if (r?.data.stdout && r.data.stdout.trim().length > 0) {
          const lang = languageOrDefault(r.data.stdoutLanguage);
          lines.push(`\`\`\`${lang} title="stdout"`);
          lines.push(trimFinalNewline(r.data.stdout));
          lines.push("```");
          lines.push("");
        }
        if (r?.data.stderr && r.data.stderr.trim().length > 0) {
          const lang = languageOrDefault(r.data.stderrLanguage);
          lines.push(`\`\`\`${lang} title="stderr"`);
          lines.push(trimFinalNewline(r.data.stderr));
          lines.push("```");
          lines.push("");
        }
      }

      if (!ok) {
        const error = a.error;
        if (error?.message && error.message.trim().length > 0) {
          lines.push("Error:");
          lines.push("");
          lines.push(error.isDiff ? "```diff" : "```text");
          const message = trimFinalNewline(stripAnsi(error.message));
          const trace =
            error.trace && error.trace.trim().length > 0
              ? trimFinalNewline(stripAnsi(error.trace))
              : undefined;
          if (trace) {
            lines.push(`${message}\n\nTrace:\n${trace}`);
          } else {
            lines.push(message);
          }
          lines.push("```");
          lines.push("");
        }
      }
    }
  }

  // Cleanup
  if (cleanupActions.length > 0) {
    lines.push("### Cleanup");
    lines.push("");
    lines.push("| # | Action | Resource | Status |");
    lines.push("|---|--------|----------|--------|");
    for (const [i, a] of cleanupActions.entries()) {
      const ok = actionOk(a);
      const actionLabel = overviewActionLabel(
        a.start.data.action,
        a.start.data.phase
      );
      const resource = resourceForAction(a);
      lines.push(
        `| ${i + 1} | ${actionLabel} | ${resource} | ${ok ? "✅" : "❌"} |`
      );
    }
    lines.push("");

    const sessionLines: Array<string> = [];
    for (const a of cleanupActions) {
      const chosen = a.commandPairs.at(-1);
      if (!chosen) {
        continue;
      }
      if (sessionLines.length > 0) {
        sessionLines.push("");
      }
      sessionLines.push(
        `$ ${[chosen.run.data.cmd, ...chosen.run.data.args]
          .map(shellEscapeArg)
          .join(" ")
          .trim()}`
      );
      const r = chosen.result;
      if (r?.data.stdout && r.data.stdout.trim().length > 0) {
        sessionLines.push(trimFinalNewline(r.data.stdout));
      }
      if (r?.data.stderr && r.data.stderr.trim().length > 0) {
        sessionLines.push(trimFinalNewline(r.data.stderr));
      }
    }

    // If there were no commands in cleanup actions, avoid emitting an empty
    // shellsession block (e.g. Exec revert without kubectl calls).
    if (sessionLines.length > 0) {
      lines.push("```shellsession");
      lines.push(...sessionLines);
      lines.push("```");
      lines.push("");
    }
  }

  // Match preview.md: end with two trailing newlines.
  if (lines.at(-1) !== "") {
    lines.push("");
  }
  if (lines.at(-2) !== "") {
    lines.push("");
  }
  const markdown = lines.join("\n");
  if (!enableANSI) {
    return markdown;
  }

  // 1) Highlight markdown itself (including code fences)
  // 2) Highlight heredoc stdin separately by its language and splice it in.
  const highlightedMarkdown = await highlightCode(markdown, markdownLang);
  const highlightedStdinList = await Promise.all(
    stdinReplacements.map(async (r) => {
      return {
        placeholder: r.placeholder,
        stdin: await highlightCode(r.stdin, r.stdinLanguage),
        stdinLanguage: r.stdinLanguage,
      } satisfies StdinReplacement;
    })
  );

  return applyStdinReplacements(highlightedMarkdown, highlightedStdinList);
}

export function newMarkdownReporter(
  options: MarkdownReporterOptions = {}
): Reporter {
  return {
    async report(events: ReadonlyArray<Event>): Promise<string> {
      const model = parseScenarioReportModel(events);
      return await renderScenarioReport(model, {
        enableANSI: options.enableANSI ?? false,
      });
    },
  };
}
