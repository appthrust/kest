import { expect, test } from "bun:test";
import type { Kubectl, KubectlContext } from "../kubectl";
import { Recorder } from "../recording";
import type { Reporter } from "../reporter/interface";
import { createReverting } from "../reverting";
import { createScenario } from "./index";

class FakeKubectl implements Kubectl {
  private readonly ctx: KubectlContext;

  constructor(ctx: KubectlContext = {}) {
    this.ctx = ctx;
  }

  extends(overrideContext: KubectlContext): Kubectl {
    return new FakeKubectl({ ...this.ctx, ...overrideContext });
  }

  apply(): Promise<string> {
    return Promise.resolve("");
  }
  applyStatus(): Promise<string> {
    return Promise.resolve("");
  }
  create(): Promise<string> {
    return Promise.resolve("");
  }
  get(): Promise<string> {
    return Promise.resolve("");
  }
  list(): Promise<string> {
    return Promise.resolve("");
  }
  patch(): Promise<string> {
    return Promise.resolve("");
  }
  label(): Promise<string> {
    return Promise.resolve("");
  }
  delete(): Promise<string> {
    return Promise.resolve("");
  }
}

const noopReporter: Reporter = {
  report: async () => "",
};

test("Scenario.generateName returns prefixed random name", () => {
  const recorder = new Recorder();
  const kubectl = new FakeKubectl();
  const reverting = createReverting({ recorder });

  const scenario = createScenario({
    name: "generateName wiring",
    recorder,
    kubectl,
    reverting,
    reporter: noopReporter,
  });

  const name = scenario.generateName("foo-");
  expect(name).toMatch(/^foo-[bcdfghjklmnpqrstvwxyz0-9]{5}$/);
});
