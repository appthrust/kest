import { expect, test } from "bun:test";
import type { K8sResource } from "../apis";
import type { Kubectl } from "../kubectl";
import { assertAbsence } from "./assert-absence";

interface ConfigMap extends K8sResource {
  apiVersion: "v1";
  kind: "ConfigMap";
  metadata: { name: string };
}

interface Deployment extends K8sResource {
  apiVersion: "apps/v1";
  kind: "Deployment";
  metadata: { name: string };
}

function makeKubectl(
  getImpl: (type: string, name: string) => Promise<string>
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

test("assertAbsence succeeds when the resource does not exist", async () => {
  const kubectl = makeKubectl(() => {
    throw new Error(
      'kubectl get failed (exit code 1): Error from server (NotFound): configmaps "missing" not found'
    );
  });

  const fn = assertAbsence.query({ kubectl });

  // Should not throw
  await fn<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    name: "missing",
  });
});

test("assertAbsence throws when the resource exists", async () => {
  const kubectl = makeKubectl(
    async () =>
      "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: my-config\n"
  );

  const fn = assertAbsence.query({ kubectl });

  await expect(
    fn<ConfigMap>({
      apiVersion: "v1",
      kind: "ConfigMap",
      name: "my-config",
    })
  ).rejects.toThrow(
    'Expected ConfigMap "my-config" to be absent, but it exists'
  );
});

test("assertAbsence re-throws non-NotFound errors", async () => {
  const kubectl = makeKubectl(() => {
    throw new Error(
      "kubectl get failed (exit code 1): dial tcp 127.0.0.1:6443: connect: connection refused"
    );
  });

  const fn = assertAbsence.query({ kubectl });

  await expect(
    fn<ConfigMap>({
      apiVersion: "v1",
      kind: "ConfigMap",
      name: "my-config",
    })
  ).rejects.toThrow("connection refused");
});

test("assertAbsence uses Kind.version.group for non-core resources", async () => {
  let calledWith: { type: string; name: string } | undefined;
  const kubectl = makeKubectl((type, name) => {
    calledWith = { type, name };
    throw new Error(
      'kubectl get failed (exit code 1): Error from server (NotFound): deployments.apps "my-app" not found'
    );
  });

  const fn = assertAbsence.query({ kubectl });
  await fn<Deployment>({
    apiVersion: "apps/v1",
    kind: "Deployment",
    name: "my-app",
  });

  expect(calledWith).toEqual({ type: "Deployment.v1.apps", name: "my-app" });
});
