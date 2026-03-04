import { describe, expect, test } from "bun:test";
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
import { stringifyYaml } from "../yaml";
import type { CreateScenarioOptions } from "./index";
import { buildClusterSurface, resolveCluster } from "./use-cluster";

type GetCall = Readonly<{
  type: string;
  name: string;
  context?: KubectlContext;
}>;

type GetSecretDataCall = Readonly<{
  name: string;
  key: string;
  context?: KubectlContext;
}>;

class FakeKubectl implements Kubectl {
  private readonly ctx: KubectlContext;
  readonly getCalls: Array<GetCall> = [];
  readonly getSecretDataCalls: Array<GetSecretDataCall> = [];
  private readonly getResponses: Array<() => string>;
  private secretDataResponse = "fake-kubeconfig-data";

  constructor(
    ctx: KubectlContext = {},
    getResponses?: Array<() => string>,
    secretDataResponse?: string
  ) {
    this.ctx = ctx;
    this.getResponses = getResponses ?? [];
    if (secretDataResponse !== undefined) {
      this.secretDataResponse = secretDataResponse;
    }
  }

  /** Queue a response for the next `get()` call. */
  onGet(fn: () => string): this {
    this.getResponses.push(fn);
    return this;
  }

  /** Set the response for `getSecretData()`. */
  onGetSecretData(value: string): this {
    this.secretDataResponse = value;
    return this;
  }

  extends(overrideContext: KubectlContext): Kubectl {
    const child = new FakeKubectl(
      { ...this.ctx, ...overrideContext },
      this.getResponses,
      this.secretDataResponse
    );
    child.getCalls.push(...[]); // independent list
    child.getSecretDataCalls.push(...[]); // independent list
    // Re-wire so calls from the child are visible on the parent too.
    const parentGetCalls = this.getCalls;
    const parentSecretCalls = this.getSecretDataCalls;
    const origGet = child.get.bind(child);
    child.get = async (type, name, context) => {
      const result = await origGet(type, name, context);
      parentGetCalls.push({
        type,
        name,
        context: { ...child.ctx, ...context },
      });
      return result;
    };
    const origGetSecret = child.getSecretData.bind(child);
    child.getSecretData = async (name, key, context) => {
      const result = await origGetSecret(name, key, context);
      parentSecretCalls.push({
        name,
        key,
        context: { ...child.ctx, ...context },
      });
      return result;
    };
    return child;
  }

  apply(_resource: K8sResource, _context?: KubectlContext): Promise<string> {
    return Promise.resolve("");
  }
  applyStatus(
    _resource: K8sResource,
    _context?: KubectlContext
  ): Promise<string> {
    return Promise.resolve("");
  }
  create(_resource: K8sResource, _context?: KubectlContext): Promise<string> {
    return Promise.resolve("");
  }
  get(type: string, name: string, context?: KubectlContext): Promise<string> {
    this.getCalls.push({ type, name, context: { ...this.ctx, ...context } });
    const next = this.getResponses.shift();
    if (next) {
      return Promise.resolve(next());
    }
    return Promise.resolve("");
  }
  list(_type: string, _context?: KubectlContext): Promise<string> {
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
  getSecretData(
    name: string,
    key: string,
    context?: KubectlContext
  ): Promise<string> {
    this.getSecretDataCalls.push({
      name,
      key,
      context: { ...this.ctx, ...context },
    });
    return Promise.resolve(this.secretDataResponse);
  }

  /** Expose the current context for assertions. */
  getContext(): KubectlContext {
    return this.ctx;
  }
}

const noopReporter: Reporter = {
  report: async () => "",
};

function makeDeps(
  kubectl: Kubectl,
  overrides?: Partial<CreateScenarioOptions>
): CreateScenarioOptions {
  const recorder = overrides?.recorder ?? new Recorder();
  const reverting = overrides?.reverting ?? createReverting({ recorder });
  return {
    name: "use-cluster-test",
    recorder,
    kubectl,
    reverting,
    reporter: noopReporter,
    ...overrides,
  };
}

describe("resolveCluster", () => {
  test("static cluster reference returns Cluster with correct context", async () => {
    const kubectl = new FakeKubectl();
    const deps = makeDeps(kubectl);

    const cluster = await resolveCluster(deps, { context: "my-ctx" });

    // The returned cluster should have methods
    expect(cluster.apply).toBeFunction();
    expect(cluster.get).toBeFunction();
    expect(cluster.newNamespace).toBeFunction();
    expect(cluster.useCluster).toBeFunction();
  });

  test("static cluster reference with kubeconfig", async () => {
    const kubectl = new FakeKubectl();
    const deps = makeDeps(kubectl);

    const cluster = await resolveCluster(deps, {
      context: "my-ctx",
      kubeconfig: "/path/to/kubeconfig",
    });

    expect(cluster).toBeDefined();
    expect(cluster.apply).toBeFunction();
  });

  test("returned Cluster supports chaining via useCluster", async () => {
    const kubectl = new FakeKubectl();
    const deps = makeDeps(kubectl);

    const cluster = await resolveCluster(deps, { context: "parent-ctx" });

    // Chain into a child cluster
    const child = await cluster.useCluster({ context: "child-ctx" });
    expect(child).toBeDefined();
    expect(child.apply).toBeFunction();
    expect(child.useCluster).toBeFunction();
  });

  test("CAPI v1beta1 readiness polling succeeds when Ready is True", async () => {
    const kubectl = new FakeKubectl();
    const readyYaml = stringifyYaml({
      apiVersion: "cluster.x-k8s.io/v1beta1",
      kind: "Cluster",
      metadata: { name: "workload-1", namespace: "default" },
      status: {
        conditions: [{ type: "Ready", status: "True" }],
      },
    });
    kubectl.onGet(() => readyYaml);
    kubectl.onGetSecretData(
      stringifyYaml({
        apiVersion: "v1",
        kind: "Config",
        clusters: [
          {
            cluster: { server: "https://10.0.0.1:6443" },
            name: "workload-1",
          },
        ],
      })
    );

    const recorder = new Recorder();
    const reverting = createReverting({ recorder });
    const deps = makeDeps(kubectl, { recorder, reverting });

    const cluster = await resolveCluster(
      deps,
      {
        apiVersion: "cluster.x-k8s.io/v1beta1",
        kind: "Cluster",
        name: "workload-1",
        namespace: "default",
      },
      { timeout: "2s", interval: "100ms" }
    );

    expect(cluster).toBeDefined();
    expect(cluster.apply).toBeFunction();

    // Verify getSecretData was called with the correct arguments
    expect(kubectl.getSecretDataCalls).toHaveLength(1);
    expect(kubectl.getSecretDataCalls[0]?.name).toBe("workload-1-kubeconfig");
    expect(kubectl.getSecretDataCalls[0]?.key).toBe("value");
  });

  test("CAPI v1beta2 readiness polling succeeds when Available is True", async () => {
    const kubectl = new FakeKubectl();
    const readyYaml = stringifyYaml({
      apiVersion: "cluster.x-k8s.io/v1beta2",
      kind: "Cluster",
      metadata: { name: "workload-2", namespace: "capi-system" },
      status: {
        v1beta2: {
          conditions: [{ type: "Available", status: "True" }],
        },
      },
    });
    kubectl.onGet(() => readyYaml);
    kubectl.onGetSecretData("fake-kubeconfig");

    const recorder = new Recorder();
    const reverting = createReverting({ recorder });
    const deps = makeDeps(kubectl, { recorder, reverting });

    const cluster = await resolveCluster(
      deps,
      {
        apiVersion: "cluster.x-k8s.io/v1beta2",
        kind: "Cluster",
        name: "workload-2",
        namespace: "capi-system",
      },
      { timeout: "2s", interval: "100ms" }
    );

    expect(cluster).toBeDefined();
    expect(kubectl.getSecretDataCalls).toHaveLength(1);
    expect(kubectl.getSecretDataCalls[0]?.name).toBe("workload-2-kubeconfig");
  });

  test("CAPI polling retries until cluster becomes ready", async () => {
    const kubectl = new FakeKubectl();
    let callCount = 0;

    // First call: not ready
    kubectl.onGet(() => {
      callCount++;
      return stringifyYaml({
        apiVersion: "cluster.x-k8s.io/v1beta1",
        kind: "Cluster",
        metadata: { name: "wl", namespace: "ns" },
        status: {
          conditions: [{ type: "Ready", status: "False" }],
        },
      });
    });
    // Second call: ready
    kubectl.onGet(() => {
      callCount++;
      return stringifyYaml({
        apiVersion: "cluster.x-k8s.io/v1beta1",
        kind: "Cluster",
        metadata: { name: "wl", namespace: "ns" },
        status: {
          conditions: [{ type: "Ready", status: "True" }],
        },
      });
    });
    kubectl.onGetSecretData("kubeconfig-data");

    const recorder = new Recorder();
    const reverting = createReverting({ recorder });
    const deps = makeDeps(kubectl, { recorder, reverting });

    const cluster = await resolveCluster(
      deps,
      {
        apiVersion: "cluster.x-k8s.io/v1beta1",
        kind: "Cluster",
        name: "wl",
        namespace: "ns",
      },
      { timeout: "5s", interval: "100ms" }
    );

    expect(cluster).toBeDefined();
    expect(callCount).toBe(2);
  });

  test("CAPI flow registers a reverting handler for temp file cleanup", async () => {
    const kubectl = new FakeKubectl();
    kubectl.onGet(() =>
      stringifyYaml({
        apiVersion: "cluster.x-k8s.io/v1beta1",
        kind: "Cluster",
        metadata: { name: "c1", namespace: "ns" },
        status: {
          conditions: [{ type: "Ready", status: "True" }],
        },
      })
    );
    kubectl.onGetSecretData("kubeconfig-content");

    const recorder = new Recorder();
    const reverting = createReverting({ recorder });
    const deps = makeDeps(kubectl, { recorder, reverting });

    await resolveCluster(
      deps,
      {
        apiVersion: "cluster.x-k8s.io/v1beta1",
        kind: "Cluster",
        name: "c1",
        namespace: "ns",
      },
      { timeout: "2s", interval: "100ms" }
    );

    // Verify that reverting has a handler registered by checking that
    // revert() triggers RevertingsStart/RevertingsEnd events.
    await reverting.revert();

    const events = recorder.getEvents();
    const revertStart = events.find((e) => e.kind === "RevertingsStart");
    const revertEnd = events.find((e) => e.kind === "RevertingsEnd");
    expect(revertStart).toBeDefined();
    expect(revertEnd).toBeDefined();
  });

  test("CAPI flow records ActionStart and ActionEnd events", async () => {
    const kubectl = new FakeKubectl();
    kubectl.onGet(() =>
      stringifyYaml({
        apiVersion: "cluster.x-k8s.io/v1beta1",
        kind: "Cluster",
        metadata: { name: "evtest", namespace: "ns" },
        status: {
          conditions: [{ type: "Ready", status: "True" }],
        },
      })
    );
    kubectl.onGetSecretData("kc");

    const recorder = new Recorder();
    const reverting = createReverting({ recorder });
    const deps = makeDeps(kubectl, { recorder, reverting });

    await resolveCluster(
      deps,
      {
        apiVersion: "cluster.x-k8s.io/v1beta1",
        kind: "Cluster",
        name: "evtest",
        namespace: "ns",
      },
      { timeout: "2s", interval: "100ms" }
    );

    const events = recorder.getEvents();
    const actionStart = events.find((e) => e.kind === "ActionStart");
    expect(actionStart).toBeDefined();
    expect(
      (actionStart as { data: { description: string } }).data.description
    ).toContain("useCluster");

    const actionEnd = events.find((e) => e.kind === "ActionEnd");
    expect(actionEnd).toBeDefined();
    expect((actionEnd as { data: { ok: boolean } }).data.ok).toBe(true);
  });

  test("CAPI polling times out when cluster never becomes ready", async () => {
    const kubectl = new FakeKubectl();

    // Always return a not-ready cluster
    for (let i = 0; i < 10; i++) {
      kubectl.onGet(() =>
        stringifyYaml({
          apiVersion: "cluster.x-k8s.io/v1beta1",
          kind: "Cluster",
          metadata: { name: "stuck", namespace: "ns" },
          status: {
            conditions: [{ type: "Ready", status: "False" }],
          },
        })
      );
    }

    const recorder = new Recorder();
    const reverting = createReverting({ recorder });
    const deps = makeDeps(kubectl, { recorder, reverting });

    const promise = resolveCluster(
      deps,
      {
        apiVersion: "cluster.x-k8s.io/v1beta1",
        kind: "Cluster",
        name: "stuck",
        namespace: "ns",
      },
      { timeout: "500ms", interval: "100ms" }
    );

    await expect(promise).rejects.toThrow("is not ready");
  });
});

describe("buildClusterSurface", () => {
  test("returns an object with all Cluster methods", () => {
    const kubectl = new FakeKubectl();
    const deps = makeDeps(kubectl);
    const surface = buildClusterSurface(deps);

    expect(surface.apply).toBeFunction();
    expect(surface.create).toBeFunction();
    expect(surface.assertApplyError).toBeFunction();
    expect(surface.assertCreateError).toBeFunction();
    expect(surface.applyStatus).toBeFunction();
    expect(surface.delete).toBeFunction();
    expect(surface.label).toBeFunction();
    expect(surface.get).toBeFunction();
    expect(surface.assert).toBeFunction();
    expect(surface.assertAbsence).toBeFunction();
    expect(surface.assertList).toBeFunction();
    expect(surface.assertOne).toBeFunction();
    expect(surface.newNamespace).toBeFunction();
    expect(surface.useCluster).toBeFunction();
  });
});
