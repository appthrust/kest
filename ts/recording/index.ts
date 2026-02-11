export type Event =
  | ScenarioEvent
  | ActionEvent
  | CommandEvent
  | RetryEvent
  | RevertingsEvent
  | BDDEvent;

type ScenarioEvent =
  | BaseEvent<
      "ScenarioStart",
      {
        readonly name: string;
      }
    >
  | BaseEvent<"ScenarioEnd", Record<string, never>>;

type ActionEvent =
  | BaseEvent<
      "ActionStart",
      {
        readonly description: string;
      }
    >
  | BaseEvent<
      "ActionEnd",
      {
        readonly ok: boolean;
        readonly error?: undefined | Error;
      }
    >;

type CommandEvent =
  | BaseEvent<
      "CommandRun",
      {
        readonly cmd: string;
        readonly args: ReadonlyArray<string>;
        readonly stdin?: undefined | string;
        readonly stdinLanguage?: undefined | string;
      }
    >
  | BaseEvent<
      "CommandResult",
      {
        readonly exitCode: number;
        readonly stdout: string;
        readonly stderr: string;
        readonly stdoutLanguage?: undefined | string;
        readonly stderrLanguage?: undefined | string;
      }
    >;

type RetryEvent =
  | BaseEvent<"RetryStart", Record<string, never>>
  | BaseEvent<
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
          readonly error: Error;
        }
    >;

type RevertingsEvent =
  | BaseEvent<"RevertingsStart">
  | BaseEvent<"RevertingsEnd">;

type BDDEvent =
  | BaseEvent<"BDDGiven", { readonly description: string }>
  | BaseEvent<"BDDWhen", { readonly description: string }>
  | BaseEvent<"BDDThen", { readonly description: string }>
  | BaseEvent<"BDDAnd", { readonly description: string }>
  | BaseEvent<"BDBut", { readonly description: string }>;

interface BaseEvent<
  Kind extends string,
  Data extends Record<string, unknown> = Record<string, never>,
> {
  readonly kind: Kind;
  readonly data: Data;
}

export class Recorder {
  private readonly events: Array<Event> = [];

  record<T extends Event>(kind: T["kind"], data: T["data"]) {
    this.events.push({ kind, data } as T);
  }

  getEvents(): Array<Event> {
    return this.events;
  }
}
