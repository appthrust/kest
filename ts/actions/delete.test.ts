import { expect, test } from "bun:test";
import type { K8sResource } from "../apis";
import type { Kubectl } from "../kubectl";
import { deleteResource } from "./delete";

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

function makeKubectlRecorder(
  onDelete: (resource: string, name: string) => void
): Kubectl {
  const kubectl: Kubectl = {
    extends: () => kubectl,
    apply: () => Promise.resolve(""),
    applyStatus: () => Promise.resolve(""),
    create: () => Promise.resolve(""),
    get: () => Promise.resolve(""),
    list: () => Promise.resolve(""),
    patch: () => Promise.resolve(""),
    label: () => Promise.resolve(""),
    delete: (resource, name) => {
      onDelete(resource, name);
      return Promise.resolve("");
    },
  };
  return kubectl;
}

test("delete uses Kind for core-group resources", async () => {
  let saw: undefined | { resource: string; name: string };
  const kubectl = makeKubectlRecorder((resource, name) => {
    saw = { resource, name };
  });

  const fn = deleteResource.mutate({ kubectl });
  await fn<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    name: "my-config",
  });

  expect(saw).toEqual({ resource: "ConfigMap", name: "my-config" });
});

test("delete uses Kind.version.group for non-core resources", async () => {
  let saw: undefined | { resource: string; name: string };
  const kubectl = makeKubectlRecorder((resource, name) => {
    saw = { resource, name };
  });

  const fn = deleteResource.mutate({ kubectl });
  await fn<Deployment>({
    apiVersion: "apps/v1",
    kind: "Deployment",
    name: "my-app",
  });

  expect(saw).toEqual({ resource: "Deployment.v1.apps", name: "my-app" });
});
