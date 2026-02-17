import type { Event } from "../../../recording";
import type {
  Action,
  BDDSection,
  CleanupItem,
  Command,
  Report,
  Scenario,
} from "../model";
import { stripAnsi } from "../strip-ansi";

const bddKeywordByKind = {
  BDDGiven: "given",
  BDDWhen: "when",
  BDDThen: "then",
  BDDAnd: "and",
  BDBut: "but",
} as const;

type BDDEvent = Extract<
  Event,
  { kind: "BDDGiven" | "BDDWhen" | "BDDThen" | "BDDAnd" | "BDBut" }
>;

interface ParseState {
  report: Report;
  currentScenario: Scenario | undefined;
  currentBDDSection: BDDSection | undefined;
  inCleanup: boolean;
  currentAction: Action | undefined;
  currentOverviewIndex: number | undefined;
  currentCleanup: CleanupItem | undefined;
}

export function parseEvents(events: ReadonlyArray<Event>): Report {
  const state: ParseState = {
    report: { scenarios: [] },
    currentScenario: undefined,
    currentBDDSection: undefined,
    inCleanup: false,
    currentAction: undefined,
    currentOverviewIndex: undefined,
    currentCleanup: undefined,
  };

  for (const event of events) {
    const bdd = bddFromEvent(event);
    if (bdd) {
      handleBDDEvent(state, bdd);
      continue;
    }
    handleNonBDDEvent(state, event);
  }

  return state.report;
}

function handleNonBDDEvent(state: ParseState, event: Event): void {
  if (event.kind.startsWith("BDD")) {
    return;
  }

  switch (event.kind) {
    case "ScenarioStart":
      handleScenarioStart(state, event);
      return;
    case "ScenarioEnd":
      clearScenarioProgressState(state);
      return;
    case "RevertingsStart":
      state.inCleanup = true;
      clearCurrentActionState(state);
      return;
    case "RevertingsEnd":
      state.inCleanup = false;
      clearCurrentActionState(state);
      return;
    case "RevertingsSkipped": {
      const scenario = ensureScenario(state.currentScenario, state.report);
      scenario.cleanupSkipped = true;
      return;
    }
    case "ActionStart":
      handleActionStart(state, event);
      return;
    case "ActionEnd":
      handleActionEnd(state, event);
      return;
    case "CommandRun":
      handleCommandRun(state, event);
      return;
    case "CommandResult":
      handleCommandResult(state, event);
      return;
    case "RetryEnd":
      handleRetryEnd(state, event);
      return;
    case "RetryAttempt":
      handleRetryAttempt(state);
      return;
    case "RetryStart":
      return;
    default:
      return;
  }
}

function handleActionStart(
  state: ParseState,
  event: Extract<Event, { kind: "ActionStart" }>
): void {
  const scenario = ensureScenario(state.currentScenario, state.report);
  if (state.inCleanup) {
    const cleanup: CleanupItem = {
      action: event.data.description,
      status: "success",
      command: { cmd: "", args: [], output: "" },
    };
    scenario.cleanup.push(cleanup);
    state.currentCleanup = cleanup;
    state.currentAction = undefined;
    state.currentOverviewIndex = undefined;
    return;
  }

  const action: Action = { name: event.data.description, commands: [] };
  scenario.overview.push({
    name: event.data.description,
    status: "pending",
  });
  state.currentOverviewIndex = scenario.overview.length - 1;

  if (state.currentBDDSection) {
    state.currentAction = action;
    state.currentBDDSection.actions.push(action);
    return;
  }

  // NOTE: keep a shared reference between `state.currentAction` and `details`
  // so that subsequent Command*/Retry*/ActionEnd events update what is shown in
  // the scenario details even when the action is outside a BDD section.
  const taggedAction = { type: "Action" as const, ...action };
  scenario.details.push(taggedAction);
  state.currentAction = taggedAction;
}

function applyRegularActionEnd(
  state: ParseState,
  event: Extract<Event, { kind: "ActionEnd" }>
): void {
  const { currentScenario, currentAction } = state;
  if (!currentScenario) {
    return;
  }
  if (!currentAction) {
    return;
  }

  if (state.currentOverviewIndex !== undefined) {
    const overviewItem = currentScenario.overview[state.currentOverviewIndex];
    if (overviewItem) {
      overviewItem.status = event.data.ok ? "success" : "failure";
    }
  }

  if (!event.data.ok && event.data.error) {
    currentAction.error = {
      message: {
        text: event.data.error.message,
        language: isDiffLike(stripAnsi(event.data.error.message))
          ? "diff"
          : "text",
      },
      stack: event.data.error.stack,
    };
  }

  state.currentAction = undefined;
  state.currentOverviewIndex = undefined;
}

function handleCommandResult(
  state: ParseState,
  event: Extract<Event, { kind: "CommandResult" }>
): void {
  if (state.inCleanup) {
    if (state.currentCleanup) {
      state.currentCleanup.command.output =
        event.data.stdout.length > 0 ? event.data.stdout : event.data.stderr;
    }
    return;
  }

  const { currentAction } = state;
  if (!currentAction || currentAction.commands.length === 0) {
    return;
  }

  const command = currentAction.commands.at(-1);
  if (!command) {
    return;
  }
  command.stdout = {
    text: event.data.stdout,
    ...(event.data.stdoutLanguage
      ? { language: event.data.stdoutLanguage }
      : {}),
  };
  command.stderr = {
    text: event.data.stderr,
    ...(event.data.stderrLanguage
      ? { language: event.data.stderrLanguage }
      : {}),
  };
}

function handleCommandRun(
  state: ParseState,
  event: Extract<Event, { kind: "CommandRun" }>
): void {
  if (state.inCleanup) {
    if (state.currentCleanup) {
      state.currentCleanup.command = {
        cmd: event.data.cmd,
        args: [...event.data.args],
        output: "",
      };
    }
    return;
  }

  if (!state.currentAction) {
    return;
  }
  state.currentAction.commands.push(createCommandFromRun(event));
}

function handleScenarioStart(
  state: ParseState,
  event: Extract<Event, { kind: "ScenarioStart" }>
): void {
  state.currentScenario = {
    name: event.data.name,
    overview: [],
    details: [],
    cleanup: [],
  };
  state.report.scenarios.push(state.currentScenario);
  clearScenarioProgressState(state);
}

function handleActionEnd(
  state: ParseState,
  event: Extract<Event, { kind: "ActionEnd" }>
): void {
  if (handleCleanupActionEnd(state, event)) {
    return;
  }

  applyRegularActionEnd(state, event);
}

function handleCleanupActionEnd(
  state: ParseState,
  event: Extract<Event, { kind: "ActionEnd" }>
): boolean {
  if (!state.inCleanup) {
    return false;
  }

  if (state.currentCleanup) {
    state.currentCleanup.status = event.data.ok ? "success" : "failure";
  }
  state.currentCleanup = undefined;
  return true;
}

function handleRetryAttempt(state: ParseState): void {
  if (state.inCleanup) {
    return;
  }
  if (!state.currentAction) {
    return;
  }
  state.currentAction.commands = [];
}

function handleRetryEnd(
  state: ParseState,
  event: Extract<Event, { kind: "RetryEnd" }>
): void {
  if (state.inCleanup) {
    return;
  }
  if (!state.currentAction) {
    return;
  }
  state.currentAction.attempts = event.data.attempts;
}

function handleBDDEvent(state: ParseState, bdd: BDDSection): void {
  const scenario = ensureScenario(state.currentScenario, state.report);
  scenario.details.push({
    type: "BDDSection",
    ...bdd,
  });
  state.currentScenario = scenario;
  state.currentBDDSection = bdd;
}

function createCommandFromRun(
  run: Extract<Event, { kind: "CommandRun" }>
): Command {
  return {
    cmd: run.data.cmd,
    args: [...run.data.args],
    ...(typeof run.data.stdin === "string"
      ? {
          stdin: {
            text: run.data.stdin,
            ...(run.data.stdinLanguage
              ? { language: run.data.stdinLanguage }
              : {}),
          },
        }
      : {}),
  };
}

function ensureScenario(
  scenario: Scenario | undefined,
  report: Report
): Scenario {
  if (scenario) {
    return scenario;
  }
  const created: Scenario = {
    name: "Scenario",
    overview: [],
    details: [],
    cleanup: [],
  };
  report.scenarios.push(created);
  return created;
}

function clearScenarioProgressState(state: ParseState): void {
  state.currentBDDSection = undefined;
  state.inCleanup = false;
  clearCurrentActionState(state);
}

function clearCurrentActionState(state: ParseState): void {
  state.currentAction = undefined;
  state.currentOverviewIndex = undefined;
  state.currentCleanup = undefined;
}

function bddFromEvent(event: Event): BDDSection | undefined {
  if (!isBDDEvent(event)) {
    return undefined;
  }
  const keyword = bddKeywordByKind[event.kind];
  return { keyword, description: event.data.description, actions: [] };
}

export function isDiffLike(message: string): boolean {
  const lines = message.split(/\r?\n/);
  let sawPlus = false;
  let sawMinus = false;
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      sawPlus = true;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      sawMinus = true;
    }
    if (sawPlus && sawMinus) {
      return true;
    }
  }
  return false;
}

function isBDDEvent(event: Event): event is BDDEvent {
  return event.kind in bddKeywordByKind;
}
