import type { Duration } from "../../duration";

export interface Report {
  scenarios: Array<Scenario>;
}

export interface Scenario {
  name: string;
  overview: Array<OverviewItem>;
  details: Array<Tagged<"BDDSection", BDDSection> | Tagged<"Action", Action>>;
  cleanup: Array<CleanupItem>;
  cleanupSkipped?: boolean;
  duration?: undefined | Duration;
}

type Tagged<Tag extends string, Target extends object> = Target & {
  readonly type: Tag;
};

export interface OverviewItem {
  name: string;
  status: "pending" | "success" | "failure";
  duration?: undefined | Duration;
}

export interface BDDSection {
  keyword: "given" | "when" | "then" | "and" | "but";
  description: string;
  actions: Array<Action>;
}

export interface Action {
  name: string;
  attempts?: undefined | number;
  commands: Array<Command>;
  error?: undefined | Error;
  duration?: undefined | Duration;
}

export interface Command {
  cmd: string;
  args: Array<string>;
  stdin?: Text;
  stdout?: Text;
  stderr?: Text;
}

export interface Text {
  text: string;
  language?: undefined | string;
}

export interface Error {
  message: Text;
  stack?: undefined | string;
}

export interface CleanupItem {
  action: string;
  resource?: undefined | string;
  status: "success" | "failure";
  command: CleanupCommand;
  duration?: undefined | Duration;
}

export interface CleanupCommand {
  cmd: string;
  args: Array<string>;
  output: string;
}
