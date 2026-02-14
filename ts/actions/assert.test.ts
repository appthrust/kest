import { expect, test } from "bun:test";
import type { K8sResource } from "../apis";
import type { Kubectl, KubectlContext } from "../kubectl";
import { assert } from "./assert";

interface ConfigMap extends K8sResource {
  apiVersion: "v1";
  kind: "ConfigMap";
  metadata: { name: string };
  data: { mode: string };
}

interface EKSCluster extends K8sResource {
  apiVersion: "cluster.appthrust.io/v1alpha1";
  kind: "EKSCluster";
  metadata: { name: string; namespace: string };
}

function makeKubectl(
  getImpl: (
    type: string,
    name: string,
    context?: KubectlContext
  ) => Promise<string>
): Kubectl {
  const kubectl: Kubectl = {
    extends: () => kubectl,
    apply: async () => "",
    applyStatus: async () => "",
    create: async () => "",
    get: getImpl,
    list: async () => "",
    patch: async () => "",
    delete: async () => "",
    label: async () => "",
  };
  return kubectl;
}

test("assert passes namespace context to kubectl.get", async () => {
  let capturedContext: KubectlContext | undefined;
  const kubectl = makeKubectl((_type, _name, context) => {
    capturedContext = context;
    return Promise.resolve(
      `
apiVersion: cluster.appthrust.io/v1alpha1
kind: EKSCluster
metadata:
  name: c-00001
  namespace: my-ns
`.trim()
    );
  });

  const fn = assert.query({ kubectl });
  await fn<EKSCluster>({
    apiVersion: "cluster.appthrust.io/v1alpha1",
    kind: "EKSCluster",
    name: "c-00001",
    namespace: "my-ns",
    test() {
      // no-op
    },
  });

  expect(capturedContext).toEqual({ namespace: "my-ns" });
});

test("assert does not override context when namespace is omitted", async () => {
  let capturedContext: KubectlContext | undefined;
  const kubectl = makeKubectl((_type, _name, context) => {
    capturedContext = context;
    return Promise.resolve(
      `
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  mode: demo
`.trim()
    );
  });

  const fn = assert.query({ kubectl });
  await fn<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    name: "my-config",
    test() {
      // no-op
    },
  });

  expect(capturedContext).toBeUndefined();
});
