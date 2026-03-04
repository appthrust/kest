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

test(
  "Example: provision a CAPI child cluster, connect, and create resources",
  async (s) => {
    s.given("a management cluster with CAPI and k0smotron installed");
    const mgmt = await s.useCluster({ context: "kind-kest-test-cluster-1" });

    s.when("I provision a child cluster via CAPI");
    await mgmt.apply({
      apiVersion: "infrastructure.cluster.x-k8s.io/v1beta1",
      kind: "DockerMachineTemplate",
      metadata: { name: "child-cluster-worker-mt", namespace: "default" },
      spec: { template: { spec: {} } },
    });
    await mgmt.apply({
      apiVersion: "bootstrap.cluster.x-k8s.io/v1beta1",
      kind: "K0sWorkerConfigTemplate",
      metadata: { name: "child-cluster-worker-config", namespace: "default" },
      spec: { template: { spec: { version: "v1.31.2+k0s.0" } } },
    });
    await mgmt.apply({
      apiVersion: "infrastructure.cluster.x-k8s.io/v1beta1",
      kind: "DockerCluster",
      metadata: {
        name: "child-cluster",
        namespace: "default",
        annotations: { "cluster.x-k8s.io/managed-by": "k0smotron" },
      },
      spec: {},
    });
    await mgmt.apply({
      apiVersion: "controlplane.cluster.x-k8s.io/v1beta1",
      kind: "K0smotronControlPlane",
      metadata: { name: "child-cluster-cp", namespace: "default" },
      spec: {
        version: "v1.31.2-k0s.0",
        persistence: { type: "emptyDir" },
        service: {
          type: "LoadBalancer",
          apiPort: 6443,
          konnectivityPort: 8132,
        },
        k0sConfig: {
          apiVersion: "k0s.k0sproject.io/v1beta1",
          kind: "ClusterConfig",
          spec: { telemetry: { enabled: false } },
        },
      },
    });
    await mgmt.apply({
      apiVersion: "cluster.x-k8s.io/v1beta1",
      kind: "MachineDeployment",
      metadata: { name: "child-cluster-workers", namespace: "default" },
      spec: {
        clusterName: "child-cluster",
        replicas: 1,
        selector: {
          matchLabels: {
            "cluster.x-k8s.io/cluster-name": "child-cluster",
            pool: "worker-pool",
          },
        },
        template: {
          metadata: {
            labels: {
              "cluster.x-k8s.io/cluster-name": "child-cluster",
              pool: "worker-pool",
            },
          },
          spec: {
            clusterName: "child-cluster",
            version: "v1.31.2",
            bootstrap: {
              configRef: {
                apiVersion: "bootstrap.cluster.x-k8s.io/v1beta1",
                kind: "K0sWorkerConfigTemplate",
                name: "child-cluster-worker-config",
              },
            },
            infrastructureRef: {
              apiVersion: "infrastructure.cluster.x-k8s.io/v1beta1",
              kind: "DockerMachineTemplate",
              name: "child-cluster-worker-mt",
            },
          },
        },
      },
    });
    await mgmt.apply({
      apiVersion: "cluster.x-k8s.io/v1beta1",
      kind: "Cluster",
      metadata: { name: "child-cluster", namespace: "default" },
      spec: {
        clusterNetwork: {
          pods: { cidrBlocks: ["192.168.0.0/16"] },
          serviceDomain: "cluster.local",
          services: { cidrBlocks: ["10.128.0.0/12"] },
        },
        controlPlaneRef: {
          apiVersion: "controlplane.cluster.x-k8s.io/v1beta1",
          kind: "K0smotronControlPlane",
          name: "child-cluster-cp",
        },
        infrastructureRef: {
          apiVersion: "infrastructure.cluster.x-k8s.io/v1beta1",
          kind: "DockerCluster",
          name: "child-cluster",
        },
      },
    });

    s.and("the child cluster becomes ready");
    const child = await mgmt.useCluster(
      {
        apiVersion: "cluster.x-k8s.io/v1beta1",
        kind: "Cluster",
        name: "child-cluster",
        namespace: "default",
      },
      { timeout: "10m", interval: "5s" }
    );

    s.and("I create a namespace and apply a ConfigMap on the child cluster");
    const ns = await child.newNamespace();
    await ns.apply<ConfigMap>({
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "hello-from-capi" },
      data: { source: "management-cluster" },
    });

    s.then("the ConfigMap should exist on the child cluster");
    await ns.assert<ConfigMap>({
      apiVersion: "v1",
      kind: "ConfigMap",
      name: "hello-from-capi",
      test() {
        expect(this.data["source"]).toBe("management-cluster");
      },
    });
  },
  { timeout: "15m" }
);
