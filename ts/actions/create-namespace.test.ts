import { expect, test } from "bun:test";
import type { K8sResource } from "../apis";
import type { Kubectl, KubectlDeleteOptions } from "../kubectl";
import { createNamespace } from "./create-namespace";

function makeKubectlRecorder(
  onCreate: (resource: K8sResource) => void,
  onDelete?: (
    kind: string,
    name: string,
    options?: KubectlDeleteOptions
  ) => void
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
    delete: (resource, name, options) => {
      onDelete?.(resource, name, options);
      return Promise.resolve("");
    },
    getSecretData: () => Promise.resolve(""),
  };
  return kubectl;
}

test("generates kest-{random} name when input is undefined", async () => {
  const created: Array<K8sResource> = [];
  const kubectl = makeKubectlRecorder((r) => created.push(r));

  const fn = createNamespace.mutate({ kubectl });
  const { output: name } = await fn(undefined);

  expect(name).toMatch(/^kest-[bcdfghjklmnpqrstvwxyz0-9]{5}$/);
  expect(created).toHaveLength(1);
  expect(created[0]?.metadata.name).toBe(name);
});

test("uses exact name when input is a string", async () => {
  const created: Array<K8sResource> = [];
  const kubectl = makeKubectlRecorder((r) => created.push(r));

  const fn = createNamespace.mutate({ kubectl });
  const { output: name } = await fn("my-ns");

  expect(name).toBe("my-ns");
  expect(created[0]?.metadata.name).toBe("my-ns");
});

test("generates prefixed name when input has generateName", async () => {
  const created: Array<K8sResource> = [];
  const kubectl = makeKubectlRecorder((r) => created.push(r));

  const fn = createNamespace.mutate({ kubectl });
  const { output: name } = await fn({ generateName: "foo-" });

  expect(name).toMatch(/^foo-[bcdfghjklmnpqrstvwxyz0-9]{5}$/);
  expect(created[0]?.metadata.name).toBe(name);
});

test("revert deletes namespace with wait: false", async () => {
  const deleted: Array<{
    kind: string;
    name: string;
    options?: undefined | KubectlDeleteOptions;
  }> = [];
  const kubectl = makeKubectlRecorder(
    () => {
      /* no-op */
    },
    (kind, name, options) => deleted.push({ kind, name, options })
  );

  const fn = createNamespace.mutate({ kubectl });
  const { revert } = await fn("test-ns");

  expect(deleted).toHaveLength(0);
  await revert();
  expect(deleted).toHaveLength(1);
  expect(deleted[0]).toEqual({
    kind: "Namespace",
    name: "test-ns",
    options: { ignoreNotFound: true, wait: false },
  });
});
