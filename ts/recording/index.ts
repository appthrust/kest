interface BaseEvent<
  Kind extends string,
  Data extends Record<string, unknown> = Record<string, never>,
> {
  readonly kind: Kind;
  readonly data: Data;
}

export type Event =
  | ScenarioStartedEvent
  | CommandRunEvent
  | CommandResultEvent
  | RetryEvent
  | ActionEvent
  | RevertingsEvent
  | BDDEvent;

export type ScenarioStartedEvent = BaseEvent<
  "ScenarioStarted",
  {
    readonly name: string;
  }
>;

export type RetryEvent =
  | RetryStartEvent
  | RetryAttemptEvent
  | RetryFailureEvent
  | RetryEndEvent;

export interface ErrorSummary {
  readonly name?: undefined | string;
  readonly message: string;
}

export type RetryStartEvent = BaseEvent<"RetryStart", Record<string, never>>;

export type RetryAttemptEvent = BaseEvent<
  "RetryAttempt",
  {
    readonly attempt: number;
  }
>;

export type RetryFailureEvent = BaseEvent<
  "RetryFailure",
  {
    readonly attempt: number;
    readonly error: ErrorSummary;
  }
>;

export type RetryEndEvent = BaseEvent<
  "RetryEnd",
  | {
      readonly attempts: number;
      readonly success: true;
      readonly reason: "success";
    }
  | {
      readonly attempts: number;
      readonly success: false;
      readonly reason: "timeout";
      readonly error: ErrorSummary;
    }
>;

export type CommandRunEvent = BaseEvent<
  "CommandRun",
  {
    readonly cmd: string;
    readonly args: ReadonlyArray<string>;
    readonly stdin?: undefined | string;
    readonly stdinLanguage?: undefined | string;
  }
>;

export type CommandResultEvent = BaseEvent<
  "CommandResult",
  {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly stdoutLanguage?: undefined | string;
    readonly stderrLanguage?: undefined | string;
  }
>;

export type ActionEvent = ActionStartEvent | ActionEndEvent;

export type ActionPhase = "mutate" | "revert" | "query";

export type ActionStartEvent = BaseEvent<
  "ActionStart",
  {
    readonly action: string; // e.g. "CreateNamespaceAction"
    readonly phase: ActionPhase;
    readonly input?: undefined | Readonly<Record<string, unknown>>;
  }
>;

export type ActionEndEvent = BaseEvent<
  "ActionEnd",
  {
    readonly action: string; // e.g. "CreateNamespaceAction"
    readonly phase: ActionPhase;
    readonly ok: boolean;
    readonly error?: undefined | ErrorSummary;
    readonly output?: undefined | Readonly<Record<string, unknown>>;
  }
>;

export type RevertingsEvent = RevertingsStartEvent | RevertingsEndEvent;
export type RevertingsStartEvent = BaseEvent<"RevertingsStart">;
export type RevertingsEndEvent = BaseEvent<"RevertingsEnd">;

export type BDDEvent = BaseEvent<
  "BDDGiven" | "BDDWhen" | "BDDThen" | "BDDAnd" | "BDBut",
  {
    readonly description: string;
  }
>;

export class Recorder {
  private readonly events: Array<Event> = [];

  record<T extends Event>(kind: T["kind"], data: T["data"]) {
    this.events.push({ kind, data } as T);
  }

  getEvents(): Array<Event> {
    return this.events;
  }
}
