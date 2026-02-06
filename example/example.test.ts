/** biome-ignore-all lint/style/noDoneCallback: that's not the done callback */
import { expect } from "bun:test";
import { type K8sResource, test } from "@appthrust/kest";

interface ConfigMap extends K8sResource {
  apiVersion: "v1";
  kind: "ConfigMap";
  metadata: {
    name: string;
  };
  data: {
    [key: string]: string;
  };
}

test("Example: applies ConfigMap using YAML, file import, and object literal", async (s) => {
  s.given("a new namespace exists");
  // A random namespace is created
  const ns = await s.newNamespace();

  s.when("I apply ConfigMaps using different formats");
  // Example of applying YAML
  await ns.apply(`
    apiVersion: v1
    kind: ConfigMap
    metadata:
      name: my-config-1
    data:
      mode: demo-1
  `);
  // Example of applying from a file
  await ns.apply(import("./config-map.yaml"));
  // Example of applying with an object literal
  await ns.apply<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: "my-config-3" },
    data: { mode: "demo-3" },
  });

  s.then("the ConfigMap should have the expected data");
  await ns.assert<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    name: "my-config-1",
    // Retries until the following condition is satisfied
    test() {
      expect(this).toMatchObject({
        data: {
          mode: "demo-1",
        },
      });
    },
  });

  // Resources created during the test are deleted in reverse order of creation.
  // 1. ConfigMap/my-config-3
  // 2. ConfigMap/my-config-2
  // 3. ConfigMap/my-config-1
  // 4. Namespace
});

test("Example: asserts a non-existent ConfigMap (expected to fail)", async (s) => {
  s.given("a new namespace exists");
  const ns = await s.newNamespace();

  s.then("asserting a non-existent ConfigMap should fail");
  // This will fail because no ConfigMap named "non-existent-config" has been created
  await ns.assert<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    name: "non-existent-config",
    test() {
      expect(this).toMatchObject({
        data: {
          mode: "should-not-exist",
        },
      });
    },
  });
});

test("Example: manages resources across multiple clusters", async (s) => {
  s.given("two clusters are configured");
  // Use cluster 1
  const cluster1 = await s.useCluster({
    kubeconfig: ".kubeconfig.yaml", // optional
    context: "kind-kest-test-cluster-1", // optional
  });
  // Use cluster 2
  const cluster2 = await s.useCluster({
    context: "kind-kest-test-cluster-2",
  });

  s.when("I apply ConfigMaps to each cluster");
  // Apply ConfigMap using cluster 1
  await cluster1.apply<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: "my-config-1" },
    data: { mode: "demo-1" },
  });
  // Apply ConfigMap using cluster 2
  await cluster2.apply<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: "my-config-2" },
    data: { mode: "demo-2" },
  });

  s.then("each cluster should have its ConfigMap");
  // Verify ConfigMap using cluster 1
  await cluster1.assert<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    name: "my-config-1",
    test() {
      expect(this.data["mode"]).toBe("demo-1");
    },
  });
  // Verify ConfigMap using cluster 2
  await cluster2.assert<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    name: "my-config-2",
    test() {
      expect(this.data["mode"]).toBe("demo-2");
    },
  });
});

test("Example: executes shell commands with revert cleanup", async (s) => {
  const name = await s.exec({
    do: async ({ $ }) => {
      const name = "my-secret";
      await $`kubectl create secret generic ${name} --from-literal=username=admin --from-literal=password=123456`.quiet();
      return name;
    },
    // revert is optional. If specified, it runs during revert. Useful for cleaning up resources created by do.
    revert: async ({ $ }) => {
      await $`kubectl delete secret my-secret`.quiet();
    },
  });
  expect(name).toBe("my-secret");
});

test("Example: asserts resource presence and absence in a list", async (s) => {
  s.given("a new namespace exists");
  const ns = await s.newNamespace();

  s.when("I apply a single ConfigMap");
  await ns.apply<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: "my-config-1" },
    data: { mode: "demo-1" },
  });

  s.then("the list should contain only the applied ConfigMap");
  await ns.assertList<ConfigMap>({
    apiVersion: "v1",
    kind: "ConfigMap",
    test() {
      // Verify existence
      expect(this.some((c) => c.metadata.name === "my-config-1")).toBe(true);
      // Verify non-existence
      expect(this.some((c) => c.metadata.name === "my-config-2")).toBe(false);
    },
  });
});

test("Example: applies status subresource to custom resource", async (s) => {
  s.given("a HelloWorld custom resource definition exists");
  await s.apply(import("./hello-world-crd.yaml"));

  s.given("a new namespace exists");
  const ns = await s.newNamespace();

  s.given("a HelloWorld custom resource is created");
  await ns.apply({
    apiVersion: "example.com/v2",
    kind: "HelloWorld",
    metadata: { name: "my-hello-world" },
  });

  s.when("I apply a status with Ready condition");
  await ns.applyStatus({
    apiVersion: "example.com/v2",
    kind: "HelloWorld",
    metadata: { name: "my-hello-world" },
    status: {
      conditions: [
        {
          type: "Ready",
          status: "True",
          lastTransitionTime: "2026-02-05T00:00:00Z",
          reason: "ManuallySet",
          message: "Ready condition set to True via server-side apply.",
        },
      ],
    },
  });

  s.then("the HelloWorld should have the Ready status");
  await ns.assert({
    apiVersion: "example.com/v2",
    kind: "HelloWorld",
    name: "my-hello-world",
    test() {
      expect(this).toMatchObject({
        status: {
          conditions: [
            {
              type: "Ready",
              status: "True",
              lastTransitionTime: "2026-02-05T00:00:00Z",
              reason: "ManuallySet",
              message: "Ready condition set to True via server-side apply.",
            },
          ],
        },
      });
    },
  });
});
