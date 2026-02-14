import { expect, test } from "bun:test";
import type { K8sResource } from "../apis";
import type { Kubectl, KubectlContext } from "../kubectl";
import { assertOne } from "./assert-one";

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

function makeKubectlCapturingListContext(
  yaml: string,
  onList: (type: string, context?: KubectlContext) => void
): Kubectl {
  const kubectl: Kubectl = {
    extends: () => kubectl,
    apply: async () => "",
    applyStatus: async () => "",
    create: async () => "",
    get: async () => "",
    list: (type, context) => {
      onList(type, context);
      return Promise.resolve(yaml);
    },
    patch: async () => "",
    delete: async () => "",
    label: async () => "",
  };
  return kubectl;
}

test("assertOne returns the single resource and binds `this` to it", async () => {
  const yaml = `
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: my-config
    data:
      mode: demo
`.trim();

  const kubectl = makeKubectlReturningList(yaml);
  const fn = assertOne.query({ kubectl });

  const resource = await fn<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    test(resource) {
      expect(resource).toBe(this);
      expect(this.metadata.name).toBe("my-config");
      expect(this.data.mode).toBe("demo");
    },
  });

  expect(resource.metadata.name).toBe("my-config");
});

test("assertOne with `where` selects the matching resource", async () => {
  const yaml = `
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: config-a
    data:
      mode: alpha
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: config-b
    data:
      mode: beta
`.trim();

  const kubectl = makeKubectlReturningList(yaml);
  const fn = assertOne.query({ kubectl });

  const resource = await fn<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    where: (cm) => cm.metadata.name === "config-b",
    test() {
      expect(this.metadata.name).toBe("config-b");
      expect(this.data.mode).toBe("beta");
    },
  });

  expect(resource.metadata.name).toBe("config-b");
});

test("assertOne throws when no resources exist", async () => {
  const yaml = `
apiVersion: v1
kind: List
items: []
`.trim();

  const kubectl = makeKubectlReturningList(yaml);
  const fn = assertOne.query({ kubectl });

  await expect(
    fn<ConfigMap>({
      apiVersion: "v1",
      kind: "ConfigMap",
      test() {
        // should not reach here
      },
    })
  ).rejects.toThrow("No ConfigMap resource found");
});

test("assertOne throws when no resource matches `where`", async () => {
  const yaml = `
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: config-a
    data:
      mode: alpha
`.trim();

  const kubectl = makeKubectlReturningList(yaml);
  const fn = assertOne.query({ kubectl });

  await expect(
    fn<ConfigMap>({
      apiVersion: "v1",
      kind: "ConfigMap",
      where: (cm) => cm.metadata.name === "nonexistent",
      test() {
        // should not reach here
      },
    })
  ).rejects.toThrow(
    'No ConfigMap resource found matching the "where" predicate'
  );
});

test("assertOne throws when multiple resources exist without `where`", async () => {
  const yaml = `
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: config-a
    data:
      mode: alpha
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: config-b
    data:
      mode: beta
`.trim();

  const kubectl = makeKubectlReturningList(yaml);
  const fn = assertOne.query({ kubectl });

  await expect(
    fn<ConfigMap>({
      apiVersion: "v1",
      kind: "ConfigMap",
      test() {
        // should not reach here
      },
    })
  ).rejects.toThrow("Expected exactly one ConfigMap, but found 2");
});

test("assertOne throws when multiple resources match `where`", async () => {
  const yaml = `
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: config-a
    data:
      mode: alpha
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: config-b
    data:
      mode: alpha
`.trim();

  const kubectl = makeKubectlReturningList(yaml);
  const fn = assertOne.query({ kubectl });

  await expect(
    fn<ConfigMap>({
      apiVersion: "v1",
      kind: "ConfigMap",
      where: (cm) => cm.data.mode === "alpha",
      test() {
        // should not reach here
      },
    })
  ).rejects.toThrow(
    'Expected exactly one ConfigMap matching the "where" predicate, but found 2'
  );
});

test("assertOne throws when list contains unexpected kinds", async () => {
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
  const fn = assertOne.query({ kubectl });

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

test("assertOne passes namespace context to kubectl.list", async () => {
  const yaml = `
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: my-config
    data:
      mode: demo
`.trim();

  let capturedContext: KubectlContext | undefined;
  const kubectl = makeKubectlCapturingListContext(yaml, (_type, context) => {
    capturedContext = context;
  });

  const fn = assertOne.query({ kubectl });
  await fn<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    namespace: "my-ns",
    test() {
      // no-op
    },
  });

  expect(capturedContext).toEqual({ namespace: "my-ns" });
});

test("assertOne does not override context when namespace is omitted", async () => {
  const yaml = `
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      name: my-config
    data:
      mode: demo
`.trim();

  let capturedContext: KubectlContext | undefined;
  const kubectl = makeKubectlCapturingListContext(yaml, (_type, context) => {
    capturedContext = context;
  });

  const fn = assertOne.query({ kubectl });
  await fn<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    test() {
      // no-op
    },
  });

  expect(capturedContext).toBeUndefined();
});
