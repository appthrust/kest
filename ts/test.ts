import {
  type TestOptions as BunTestOptions,
  test as bunTest,
  setDefaultTimeout,
} from "bun:test";
import { YAML } from "bun";
import type { Scenario } from "./apis";
import { parseDuration } from "./duration";
import { createKubectl } from "./kubectl";
import { Recorder } from "./recording";
import { newMarkdownReporter } from "./reporter/markdown";
import { createReverting } from "./reverting";
import { createScenario, type InternalScenario } from "./scenario";
import { getWorkspaceRoot } from "./workspace";

interface TestOptions {
  timeout?: string;
}

const defaultTimeout = 60_000;
setDefaultTimeout(defaultTimeout);

type Callback = (scenario: Scenario) => Promise<unknown>;

type TestFunction = (
  label: string,
  fn: Callback,
  options?: TestOptions
) => void;

type Test = TestFunction & {
  only: TestFunction;
  skip: TestFunction;
  todo: TestFunction;
};

type BunTestRunner = (
  label: string,
  fn: () => Promise<unknown> | undefined,
  options?: number | BunTestOptions
) => unknown;

const workspaceRoot = await getWorkspaceRoot();
const showReport = process.env["KEST_SHOW_REPORT"] === "1";
const showEvents = process.env["KEST_SHOW_EVENTS"] === "1";

function makeScenarioTest(runner: BunTestRunner): TestFunction {
  return (label, fn, options) => {
    const bunTestOptions = convertTestOptions(options);
    const testFn = async () => {
      const recorder = new Recorder();
      const kubectl = createKubectl({ recorder, cwd: workspaceRoot });
      const reverting = createReverting({ recorder });
      const reporter = newMarkdownReporter({ enableANSI: true });
      const scenario = createScenario({
        name: label,
        recorder,
        kubectl,
        reverting,
        reporter,
      });
      recorder.record("ScenarioStart", { name: label });
      let testErr: undefined | Error;
      try {
        await fn(scenario);
      } catch (error) {
        testErr = error as Error;
      }
      await scenario.cleanup();
      recorder.record("ScenarioEnd", {});
      await report(recorder, scenario, testErr);
      if (testErr) {
        throw testErr;
      }
    };
    const report = async (
      recorder: Recorder,
      scenario: InternalScenario,
      testErr: undefined | Error
    ) => {
      const report: undefined | string =
        testErr || showReport ? await scenario.getReport() : undefined;
      if (report) {
        console.log(report);
      }
      if (showEvents) {
        console.log("---- debug events ----");
        console.log(YAML.stringify(recorder.getEvents(), null, 2));
      }
    };
    return runner(label, testFn, bunTestOptions);
  };
}

function convertTestOptions(
  options?: undefined | TestOptions
): undefined | BunTestOptions {
  const timeout = options?.timeout
    ? parseDuration(options.timeout).toMilliseconds()
    : defaultTimeout;
  return {
    ...options,
    timeout,
  };
}

const test: TestFunction = makeScenarioTest(bunTest);
Object.defineProperties(test, {
  // `only` must be a getter (not a value) because Bun throws an error when
  // accessing `bunTest.only` in CI environments (CI=true). Using a getter
  // defers the access until `test.only` is actually used, allowing the error
  // to surface at the appropriate time rather than at module initialization.
  only: {
    get() {
      return makeScenarioTest(bunTest.only);
    },
  },
  skip: {
    value: makeScenarioTest(bunTest.skip),
  },
  todo: {
    value: makeScenarioTest(bunTest.todo),
  },
});

const test_ = test as Test;

export { test_ as it, test_ as test };
