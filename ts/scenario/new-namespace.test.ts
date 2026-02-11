import { expect, test } from "bun:test";
import type { K8sResource } from "../apis";
import type {
  Kubectl,
  KubectlContext,
  KubectlDeleteOptions,
  KubectlLabelOptions,
  KubectlPatch,
  KubectlPatchOptions,
} from "../kubectl";
import { Recorder } from "../recording";
import type { Reporter } from "../reporter/interface";
import { createReverting } from "../reverting";
import { createScenario } from "./index";

type Call = Readonly<{
  method: "apply" | "create";
  resource: K8sResource;
  context: KubectlContext;
}>;

class FakeKubectl implements Kubectl {
  private readonly calls: Array<Call>;
  private readonly ctx: KubectlContext;

  constructor(calls: Array<Call>, ctx: KubectlContext = {}) {
    this.calls = calls;
    this.ctx = ctx;
  }

  extends(overrideContext: KubectlContext): Kubectl {
    return new FakeKubectl(this.calls, { ...this.ctx, ...overrideContext });
  }

  apply(resource: K8sResource, context?: KubectlContext): Promise<string> {
    this.calls.push({
      method: "apply",
      resource,
      context: { ...this.ctx, ...context },
    });
    return Promise.resolve("");
  }

  applyStatus(): Promise<string> {
    return Promise.resolve("");
  }

  create(resource: K8sResource, context?: KubectlContext): Promise<string> {
    this.calls.push({
      method: "create",
      resource,
      context: { ...this.ctx, ...context },
    });
    return Promise.resolve("");
  }

  get(): Promise<string> {
    return Promise.resolve("");
  }

  list(): Promise<string> {
    return Promise.resolve("");
  }

  patch(
    _resource: string,
    _name: string,
    _patch: KubectlPatch,
    _options?: KubectlPatchOptions
  ): Promise<string> {
    return Promise.resolve("");
  }

  delete(
    _resource: string,
    _name: string,
    _options?: KubectlDeleteOptions
  ): Promise<string> {
    return Promise.resolve("");
  }

  label(
    _resource: string,
    _name: string,
    _labels: Readonly<Record<string, string | null>>,
    _options?: KubectlLabelOptions
  ): Promise<string> {
    return Promise.resolve("");
  }
}

const noopReporter: Reporter = {
  report: async () => "",
};

test("newNamespace creates Namespace via kubectl.create (not apply)", async () => {
  const calls: Array<Call> = [];
  const recorder = new Recorder();
  const kubectl = new FakeKubectl(calls);
  const reverting = createReverting({ recorder });

  const scenario = createScenario({
    name: "newNamespace wiring",
    recorder,
    kubectl,
    reverting,
    reporter: noopReporter,
  });

  const ns = await scenario.newNamespace("my-ns");

  expect(ns.name).toBe("my-ns");
  expect(calls).toHaveLength(1);
  expect(calls[0]?.method).toBe("create");
  expect(calls[0]?.context).toEqual({});
  expect(calls[0]?.resource).toMatchObject({
    apiVersion: "v1",
    kind: "Namespace",
    metadata: { name: "my-ns" },
  });
});
