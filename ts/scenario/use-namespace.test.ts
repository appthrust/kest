import { expect, test } from "bun:test";
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
  method: "get";
  type: string;
  name: string;
  context: KubectlContext;
}>;

class FakeKubectl implements Kubectl {
  private readonly calls: Array<Call>;
  private readonly ctx: KubectlContext;
  private readonly getFn: (type: string, name: string) => Promise<string>;

  constructor(
    calls: Array<Call>,
    ctx: KubectlContext = {},
    getFn?: (type: string, name: string) => Promise<string>
  ) {
    this.calls = calls;
    this.ctx = ctx;
    this.getFn = getFn ?? (() => Promise.resolve(""));
  }

  extends(overrideContext: KubectlContext): Kubectl {
    return new FakeKubectl(
      this.calls,
      { ...this.ctx, ...overrideContext },
      this.getFn
    );
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

  get(type: string, name: string, context?: KubectlContext): Promise<string> {
    this.calls.push({
      method: "get",
      type,
      name,
      context: { ...this.ctx, ...context },
    });
    return this.getFn(type, name);
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

  getSecretData(): Promise<string> {
    return Promise.resolve("");
  }
}

const noopReporter: Reporter = {
  report: async () => "",
};

test("useNamespace verifies namespace exists via kubectl.get", async () => {
  const calls: Array<Call> = [];
  const recorder = new Recorder();
  const kubectl = new FakeKubectl(calls);
  const reverting = createReverting({ recorder });

  const scenario = createScenario({
    name: "useNamespace wiring",
    recorder,
    kubectl,
    reverting,
    reporter: noopReporter,
  });

  const ns = await scenario.useNamespace("kube-system");

  expect(ns.name).toBe("kube-system");
  expect(calls).toHaveLength(1);
  expect(calls[0]?.method).toBe("get");
  expect(calls[0]?.type).toBe("Namespace");
  expect(calls[0]?.name).toBe("kube-system");
});

test("useNamespace does not register a cleanup handler", async () => {
  const calls: Array<Call> = [];
  const recorder = new Recorder();
  const kubectl = new FakeKubectl(calls);
  const reverting = createReverting({ recorder });

  const scenario = createScenario({
    name: "useNamespace no cleanup",
    recorder,
    kubectl,
    reverting,
    reporter: noopReporter,
  });

  await scenario.useNamespace("istio-system");

  // Cleanup should be a no-op (no revert handlers registered)
  await scenario.cleanup();

  // Only the useNamespace get call should have been made — no delete calls
  expect(calls).toHaveLength(1);
  expect(calls[0]?.method).toBe("get");
});

test("useNamespace returns a namespace with scoped actions", async () => {
  const calls: Array<Call> = [];
  const recorder = new Recorder();
  const kubectl = new FakeKubectl(calls);
  const reverting = createReverting({ recorder });

  const scenario = createScenario({
    name: "useNamespace scoped",
    recorder,
    kubectl,
    reverting,
    reporter: noopReporter,
  });

  const ns = await scenario.useNamespace("my-existing-ns");

  // The returned namespace should have all expected methods
  expect(typeof ns.apply).toBe("function");
  expect(typeof ns.create).toBe("function");
  expect(typeof ns.get).toBe("function");
  expect(typeof ns.assert).toBe("function");
  expect(typeof ns.assertAbsence).toBe("function");
  expect(typeof ns.assertList).toBe("function");
  expect(typeof ns.assertOne).toBe("function");
  expect(typeof ns.assertApplyError).toBe("function");
  expect(typeof ns.assertCreateError).toBe("function");
  expect(typeof ns.applyStatus).toBe("function");
  expect(typeof ns.delete).toBe("function");
  expect(typeof ns.label).toBe("function");
});

test("useNamespace records ActionStart and ActionEnd events", async () => {
  const calls: Array<Call> = [];
  const recorder = new Recorder();
  const kubectl = new FakeKubectl(calls);
  const reverting = createReverting({ recorder });

  const scenario = createScenario({
    name: "useNamespace events",
    recorder,
    kubectl,
    reverting,
    reporter: noopReporter,
  });

  await scenario.useNamespace("default");

  const events = recorder.getEvents();
  const actionStart = events.find((e) => e.kind === "ActionStart");
  const actionEnd = events.find((e) => e.kind === "ActionEnd");

  expect(actionStart).toBeDefined();
  expect((actionStart?.data as { description: string }).description).toBe(
    'useNamespace("default")'
  );
  expect(actionEnd).toBeDefined();
  expect((actionEnd?.data as { ok: boolean }).ok).toBe(true);
});

test("useNamespace throws when namespace does not exist", async () => {
  const calls: Array<Call> = [];
  const recorder = new Recorder();
  const kubectl = new FakeKubectl(calls, {}, () => {
    return Promise.reject(new Error('namespaces "nonexistent" not found'));
  });
  const reverting = createReverting({ recorder });

  const scenario = createScenario({
    name: "useNamespace not found",
    recorder,
    kubectl,
    reverting,
    reporter: noopReporter,
  });

  await expect(
    scenario.useNamespace("nonexistent", { timeout: "1s", interval: "100ms" })
  ).rejects.toThrow();

  const events = recorder.getEvents();
  const actionEnd = events.find((e) => e.kind === "ActionEnd");
  expect(actionEnd).toBeDefined();
  expect((actionEnd?.data as { ok: boolean }).ok).toBe(false);
});
