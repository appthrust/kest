import { expect, test } from "bun:test";
import type { Kubectl, KubectlContext, KubectlDeleteOptions } from "../kubectl";
import { Recorder } from "../recording";
import type { Reporter } from "../reporter/interface";
import { createReverting } from "../reverting";
import { createScenario } from "./index";

type DeleteCall = Readonly<{
  resource: string;
  name: string;
  context: KubectlContext;
  options?: KubectlDeleteOptions;
}>;

class FakeKubectl implements Kubectl {
  private readonly calls: Array<DeleteCall>;
  private readonly ctx: KubectlContext;

  constructor(calls: Array<DeleteCall>, ctx: KubectlContext = {}) {
    this.calls = calls;
    this.ctx = ctx;
  }

  extends(overrideContext: KubectlContext): Kubectl {
    return new FakeKubectl(this.calls, { ...this.ctx, ...overrideContext });
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

  delete(
    resource: string,
    name: string,
    options?: KubectlDeleteOptions
  ): Promise<string> {
    const call: DeleteCall = options
      ? { resource, name, context: this.ctx, options }
      : { resource, name, context: this.ctx };
    this.calls.push(call);
    return Promise.resolve("");
  }
}

const noopReporter: Reporter = {
  report: async () => "",
};

test("Scenario/Cluster/Namespace expose delete bound to kubectl context", async () => {
  const calls: Array<DeleteCall> = [];
  const recorder = new Recorder();
  const kubectl = new FakeKubectl(calls);
  const reverting = createReverting({ recorder });

  const scenario = createScenario({
    name: "delete wiring",
    recorder,
    kubectl,
    reverting,
    reporter: noopReporter,
  });

  await scenario.delete({
    apiVersion: "v1",
    kind: "ConfigMap",
    name: "root-cm",
  });

  const cluster = await scenario.useCluster({
    context: "kind-primary",
    kubeconfig: ".kubeconfig.yaml",
  });
  await cluster.delete({
    apiVersion: "v1",
    kind: "Namespace",
    name: "ns-in-cluster",
  });

  const ns = await scenario.newNamespace("my-ns");
  await ns.delete({
    apiVersion: "apps/v1",
    kind: "Deployment",
    name: "my-app",
  });

  expect(calls).toHaveLength(3);

  expect(calls[0]).toMatchObject({
    resource: "ConfigMap",
    name: "root-cm",
    context: {},
  });

  expect(calls[1]).toMatchObject({
    resource: "Namespace",
    name: "ns-in-cluster",
    context: { context: "kind-primary", kubeconfig: ".kubeconfig.yaml" },
  });

  expect(calls[2]).toMatchObject({
    resource: "Deployment.v1.apps",
    name: "my-app",
    context: { namespace: "my-ns" },
  });
});
