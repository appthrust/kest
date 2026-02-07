import { expect, test } from "bun:test";
import type { K8sResource } from "../apis";
import type { Kubectl } from "../kubectl";
import { create } from "./create";

function makeKubectlRecorder(
  onCreate: (resource: K8sResource) => void,
  onDelete?: (kind: string, name: string) => void
): Kubectl {
  const kubectl: Kubectl = {
    extends: () => kubectl,
    apply: () => Promise.resolve(""),
    applyStatus: () => Promise.resolve(""),
    create: (resource) => {
      onCreate(resource);
      return Promise.resolve("");
    },
    get: () => Promise.resolve(""),
    list: () => Promise.resolve(""),
    patch: () => Promise.resolve(""),
    label: () => Promise.resolve(""),
    delete: (resource, name) => {
      onDelete?.(resource, name);
      return Promise.resolve("");
    },
  };
  return kubectl;
}

test("create calls kubectl.create with the parsed resource", async () => {
  const created: Array<K8sResource> = [];
  const kubectl = makeKubectlRecorder((r) => created.push(r));

  const fn = create.mutate({ kubectl });
  await fn({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: "my-config" },
    data: { mode: "demo" },
  });

  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: "my-config" },
    data: { mode: "demo" },
  });
});

test("create registers a revert that deletes the resource", async () => {
  const deleted: Array<{ kind: string; name: string }> = [];
  const kubectl = makeKubectlRecorder(
    () => {
      /* no-op */
    },
    (kind, name) => deleted.push({ kind, name })
  );

  const fn = create.mutate({ kubectl });
  const { revert } = await fn({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: "my-config" },
  });

  expect(deleted).toHaveLength(0);
  await revert();
  expect(deleted).toHaveLength(1);
  expect(deleted[0]).toEqual({ kind: "ConfigMap", name: "my-config" });
});

test("create accepts a YAML string", async () => {
  const created: Array<K8sResource> = [];
  const kubectl = makeKubectlRecorder((r) => created.push(r));

  const fn = create.mutate({ kubectl });
  await fn(`
    apiVersion: v1
    kind: ConfigMap
    metadata:
      name: yaml-config
    data:
      key: value
  `);

  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: "yaml-config" },
    data: { key: "value" },
  });
});
