import { expect, test } from "bun:test";
import type { K8sResource } from "../apis";
import type { Kubectl } from "../kubectl";
import { assertList } from "./assert-list";

interface ConfigMap extends K8sResource {
  apiVersion: "v1";
  kind: "ConfigMap";
  metadata: { name: string };
  data: { mode: string };
}

function makeKubectlReturningList(yaml: string): Kubectl {
  const kubectl: Kubectl = {
    extends: () => kubectl,
    apply: async () => "",
    applyStatus: async () => "",
    create: async () => "",
    get: async () => "",
    list: async () => yaml,
    patch: async () => "",
    delete: async () => "",
    label: async () => "",
  };
  return kubectl;
}

test("assertList returns items and binds `this` to the list", async () => {
  const yaml = `
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: my-config-1
    data:
      mode: demo-1
`.trim();

  const kubectl = makeKubectlReturningList(yaml);
  const fn = assertList.query({ kubectl });

  const resources = await fn<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    test(resources) {
      expect(resources).toBe(this);
      expect(this).toHaveLength(1);
      expect(this[0]?.metadata.name).toBe("my-config-1");
      expect(this[0]?.data.mode).toBe("demo-1");
    },
  });

  expect(resources).toHaveLength(1);
});

test("assertList throws when list contains unexpected kinds", async () => {
  const yaml = `
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: Secret
    metadata:
      name: not-a-configmap
`.trim();

  const kubectl = makeKubectlReturningList(yaml);
  const fn = assertList.query({ kubectl });

  await expect(
    fn<ConfigMap>({
      apiVersion: "v1",
      kind: "ConfigMap",
      test() {
        // no-op
      },
    })
  ).rejects.toThrow("is not expected");
});
