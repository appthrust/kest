# Cluster API (CAPI) with Docker Provider (CAPD) on kind

How to create workload Kubernetes clusters using CAPI's Docker infrastructure provider (CAPD),
with a kind-based management cluster. Covers both v1beta1 and v1beta2 API versions.

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  Host Machine (Docker)                               │
│                                                      │
│  ┌─────────────────────────────┐                     │
│  │ Management Cluster (kind)   │                     │
│  │                             │                     │
│  │  - CAPI core controller     │                     │
│  │  - CAPD controller          │                     │
│  │  - KubeadmControlPlane ctrl │                     │
│  │  - KubeadmBootstrap ctrl    │                     │
│  │  - cert-manager             │                     │
│  │                             │                     │
│  │  Cluster CR ───────────┐    │                     │
│  └────────────────────────│────┘                     │
│                           │ creates                  │
│                           ▼                          │
│  ┌─────────────────────────────┐                     │
│  │ Workload Cluster (Docker)   │                     │
│  │                             │                     │
│  │  ┌──────────┐ ┌──────────┐  │                     │
│  │  │ CP Node  │ │ CP Node  │  │  (Docker containers │
│  │  │(container│ │(container│  │   using kindest/node)│
│  │  └──────────┘ └──────────┘  │                     │
│  │  ┌──────────┐ ┌──────────┐  │                     │
│  │  │ Worker   │ │ Worker   │  │                     │
│  │  │(container│ │(container│  │                     │
│  │  └──────────┘ └──────────┘  │                     │
│  │  ┌──────────┐               │                     │
│  │  │ HAProxy  │ (LB for API)  │                     │
│  │  └──────────┘               │                     │
│  └─────────────────────────────┘                     │
└──────────────────────────────────────────────────────┘
```

Each workload cluster node runs as a Docker container using the `kindest/node` image.
The `DockerCluster` controller creates an HAProxy container as the API server load balancer.

## API Version Timeline

| CAPI Version | Release Date    | API Version                                                           |
| ------------ | --------------- | --------------------------------------------------------------------- |
| v1.0 - v1.9  | Oct 2021 - 2024 | `v1beta1` only                                                       |
| v1.9         | Dec 2024        | `v1beta1` + v1beta2 conditions preview in `status.v1beta2`           |
| v1.10        | Apr 2025        | `v1beta1` + incremental v1beta2 improvements                        |
| **v1.11**    | **Aug 2025**    | **`v1beta2` launched as storage version**, v1beta1 deprecated        |
| v1.12        | Dec 2025        | `v1beta2` default, v1beta1 still served                              |
| v1.14 (plan) | ~Aug 2026       | v1beta1 **stops being served**                                       |

## Prerequisites

| Tool       | Minimum Version                                  |
| ---------- | ------------------------------------------------ |
| Docker     | 19.03+ (6GB RAM on macOS Docker Desktop)         |
| kind       | v0.24.0+ (v0.31.0+ recommended)                 |
| kubectl    | Latest stable                                    |
| clusterctl | v1.8+ for v1beta1, v1.11+ for full v1beta2      |

## Common Setup Steps (Both API Versions)

### 1. Install clusterctl

```bash
# macOS (Homebrew)
brew install clusterctl

# macOS Apple Silicon (manual)
curl -L https://github.com/kubernetes-sigs/cluster-api/releases/download/v1.12.3/clusterctl-darwin-arm64 -o clusterctl
chmod +x ./clusterctl
sudo mv ./clusterctl /usr/local/bin/clusterctl

# Linux AMD64 (manual)
curl -L https://github.com/kubernetes-sigs/cluster-api/releases/download/v1.12.3/clusterctl-linux-amd64 -o clusterctl
sudo install -o root -g root -m 0755 clusterctl /usr/local/bin/clusterctl

clusterctl version
```

### 2. Create kind Management Cluster

CAPD requires the Docker socket mounted into the kind control-plane container.

Create `kind-cluster-with-extramounts.yaml`:

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  ipFamily: dual
nodes:
  - role: control-plane
    extraMounts:
      - hostPath: /var/run/docker.sock
        containerPath: /var/run/docker.sock
```

```bash
kind create cluster --name capi-management --config kind-cluster-with-extramounts.yaml
```

### 3. Initialize CAPI with Docker Provider

```bash
export CLUSTER_TOPOLOGY=true
clusterctl init --infrastructure docker
```

This installs controllers into these namespaces:

| Namespace                              | Provider                 |
| -------------------------------------- | ------------------------ |
| `cert-manager`                         | cert-manager (dependency)|
| `capi-system`                          | cluster-api core         |
| `capi-kubeadm-bootstrap-system`        | kubeadm bootstrap        |
| `capi-kubeadm-control-plane-system`    | kubeadm control plane    |
| `capd-system`                          | Docker infrastructure    |

### 4. Post-Creation Steps (Common)

After creating a workload cluster:

```bash
# Monitor cluster status
kubectl get cluster
clusterctl describe cluster <CLUSTER_NAME>
kubectl get machines

# Get workload cluster kubeconfig
# macOS Docker Desktop:
kind get kubeconfig --name <CLUSTER_NAME> > workload.kubeconfig
# Linux:
clusterctl get kubeconfig <CLUSTER_NAME> > workload.kubeconfig

# Install CNI (required for nodes to become Ready)
kubectl --kubeconfig=./workload.kubeconfig apply -f \
  https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml

# Verify nodes
kubectl --kubeconfig=./workload.kubeconfig get nodes
```

### 5. Cleanup

```bash
# Delete workload cluster (removes all workload Docker containers)
kubectl delete cluster <CLUSTER_NAME>

# Delete management cluster
kind delete cluster --name capi-management
```

---

## v1beta1: Creating a Workload Cluster

### Quick Method (clusterctl generate)

```bash
clusterctl generate cluster my-cluster \
  --flavor development \
  --kubernetes-version v1.31.0 \
  --control-plane-machine-count=1 \
  --worker-machine-count=2 \
  > my-cluster.yaml

kubectl apply -f my-cluster.yaml
```

### Full Manifest (Standalone, No ClusterClass)

```yaml
---
apiVersion: cluster.x-k8s.io/v1beta1
kind: Cluster
metadata:
  name: my-cluster
  namespace: default
spec:
  clusterNetwork:
    services:
      cidrBlocks: ["10.128.0.0/12"]
    pods:
      cidrBlocks: ["192.168.0.0/16"]
    serviceDomain: "cluster.local"
  controlPlaneRef:
    apiVersion: controlplane.cluster.x-k8s.io/v1beta1
    kind: KubeadmControlPlane
    name: my-cluster-control-plane
  infrastructureRef:
    apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
    kind: DockerCluster
    name: my-cluster
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
kind: DockerCluster
metadata:
  name: my-cluster
  namespace: default
spec:
  loadBalancer:
    imageRepository: kindest/haproxy
    imageTag: v20230606-42a2262b
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
kind: DockerMachineTemplate
metadata:
  name: my-cluster-control-plane
  namespace: default
spec:
  template:
    spec:
      extraMounts:
        - containerPath: /var/run/docker.sock
          hostPath: /var/run/docker.sock
---
apiVersion: controlplane.cluster.x-k8s.io/v1beta1
kind: KubeadmControlPlane
metadata:
  name: my-cluster-control-plane
  namespace: default
spec:
  replicas: 1
  version: v1.31.0
  machineTemplate:
    infrastructureRef:
      apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
      kind: DockerMachineTemplate
      name: my-cluster-control-plane
  kubeadmConfigSpec:
    clusterConfiguration:
      apiServer:
        certSANs:
          - localhost
          - 127.0.0.1
      controllerManager:
        extraArgs:
          enable-hostpath-provisioner: "true"
    initConfiguration:
      nodeRegistration:
        criSocket: unix:///var/run/containerd/containerd.sock
        kubeletExtraArgs:
          eviction-hard: nodefs.available<0%,nodefs.inodesFree<0%,imagefs.available<0%
    joinConfiguration:
      nodeRegistration:
        criSocket: unix:///var/run/containerd/containerd.sock
        kubeletExtraArgs:
          eviction-hard: nodefs.available<0%,nodefs.inodesFree<0%,imagefs.available<0%
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
kind: DockerMachineTemplate
metadata:
  name: my-cluster-md-0
  namespace: default
spec:
  template:
    spec:
      extraMounts:
        - containerPath: /var/run/docker.sock
          hostPath: /var/run/docker.sock
---
apiVersion: bootstrap.cluster.x-k8s.io/v1beta1
kind: KubeadmConfigTemplate
metadata:
  name: my-cluster-md-0
  namespace: default
spec:
  template:
    spec:
      joinConfiguration:
        nodeRegistration:
          criSocket: unix:///var/run/containerd/containerd.sock
          kubeletExtraArgs:
            eviction-hard: nodefs.available<0%,nodefs.inodesFree<0%,imagefs.available<0%
---
apiVersion: cluster.x-k8s.io/v1beta1
kind: MachineDeployment
metadata:
  name: my-cluster-md-0
  namespace: default
spec:
  clusterName: my-cluster
  replicas: 2
  selector:
    matchLabels: {}
  template:
    spec:
      clusterName: my-cluster
      version: v1.31.0
      bootstrap:
        configRef:
          apiVersion: bootstrap.cluster.x-k8s.io/v1beta1
          kind: KubeadmConfigTemplate
          name: my-cluster-md-0
      infrastructureRef:
        apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
        kind: DockerMachineTemplate
        name: my-cluster-md-0
```

### CRD Resource Summary (v1beta1)

| Kind                   | API Group                              | Purpose                            |
| ---------------------- | -------------------------------------- | ---------------------------------- |
| `Cluster`              | `cluster.x-k8s.io`                    | Top-level cluster definition       |
| `DockerCluster`        | `infrastructure.cluster.x-k8s.io`     | Docker infra config (HAProxy LB)   |
| `DockerMachineTemplate`| `infrastructure.cluster.x-k8s.io`     | Docker container spec for nodes    |
| `KubeadmControlPlane`  | `controlplane.cluster.x-k8s.io`       | Control plane config & lifecycle   |
| `KubeadmConfigTemplate`| `bootstrap.cluster.x-k8s.io`          | Bootstrap config for worker nodes  |
| `MachineDeployment`    | `cluster.x-k8s.io`                    | Worker node group (like Deployment)|

---

## v1beta2: Creating a Workload Cluster

Requires CAPI v1.11+ (clusterctl v1.11+).

### Quick Method (clusterctl generate)

Same command - clusterctl automatically generates v1beta2 manifests when using CAPI v1.11+:

```bash
clusterctl generate cluster my-cluster \
  --flavor development \
  --kubernetes-version v1.32.0 \
  --control-plane-machine-count=1 \
  --worker-machine-count=2 \
  > my-cluster.yaml

kubectl apply -f my-cluster.yaml
```

### ClusterClass-Based Cluster (Recommended for v1beta2)

The `--flavor development` generates a Cluster that references the `quick-start` ClusterClass:

```yaml
apiVersion: cluster.x-k8s.io/v1beta2
kind: Cluster
metadata:
  name: my-cluster
  namespace: default
spec:
  clusterNetwork:
    services:
      cidrBlocks: ["10.128.0.0/12"]
    pods:
      cidrBlocks: ["192.168.0.0/16"]
    serviceDomain: "cluster.local"
  topology:
    classRef:
      name: quick-start          # v1beta2: classRef.name (was spec.topology.class in v1beta1)
    version: v1.32.0
    controlPlane:
      replicas: 1
    workers:
      machineDeployments:
        - class: default-worker
          name: md-0
          replicas: 2
```

### Full Manifest (Standalone, No ClusterClass)

```yaml
---
apiVersion: cluster.x-k8s.io/v1beta2
kind: Cluster
metadata:
  name: my-cluster
  namespace: default
spec:
  clusterNetwork:
    services:
      cidrBlocks: ["10.128.0.0/12"]
    pods:
      cidrBlocks: ["192.168.0.0/16"]
    serviceDomain: "cluster.local"
  controlPlaneRef:
    apiGroup: controlplane.cluster.x-k8s.io    # v1beta2: apiGroup (no version suffix)
    kind: KubeadmControlPlane
    name: my-cluster-control-plane
  infrastructureRef:
    apiGroup: infrastructure.cluster.x-k8s.io  # v1beta2: apiGroup (no version suffix)
    kind: DockerCluster
    name: my-cluster
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta2
kind: DockerCluster
metadata:
  name: my-cluster
  namespace: default
spec:
  loadBalancer:
    imageRepository: kindest/haproxy
    imageTag: v20230606-42a2262b
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta2
kind: DockerMachineTemplate
metadata:
  name: my-cluster-control-plane
  namespace: default
spec:
  template:
    spec:
      extraMounts:
        - containerPath: /var/run/docker.sock
          hostPath: /var/run/docker.sock
---
apiVersion: controlplane.cluster.x-k8s.io/v1beta2
kind: KubeadmControlPlane
metadata:
  name: my-cluster-control-plane
  namespace: default
spec:
  replicas: 1
  version: v1.32.0
  machineTemplate:
    infrastructureRef:
      apiGroup: infrastructure.cluster.x-k8s.io   # v1beta2: apiGroup
      kind: DockerMachineTemplate
      name: my-cluster-control-plane
  kubeadmConfigSpec:
    clusterConfiguration:
      apiServer:
        certSANs:
          - localhost
          - 127.0.0.1
      controllerManager:
        extraArgs:                              # v1beta2: []Arg format (was map[string]string)
          - name: enable-hostpath-provisioner
            value: "true"
    initConfiguration:
      nodeRegistration:
        criSocket: unix:///var/run/containerd/containerd.sock
        kubeletExtraArgs:
          - name: eviction-hard
            value: nodefs.available<0%,nodefs.inodesFree<0%,imagefs.available<0%
    joinConfiguration:
      nodeRegistration:
        criSocket: unix:///var/run/containerd/containerd.sock
        kubeletExtraArgs:
          - name: eviction-hard
            value: nodefs.available<0%,nodefs.inodesFree<0%,imagefs.available<0%
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta2
kind: DockerMachineTemplate
metadata:
  name: my-cluster-md-0
  namespace: default
spec:
  template:
    spec:
      extraMounts:
        - containerPath: /var/run/docker.sock
          hostPath: /var/run/docker.sock
---
apiVersion: bootstrap.cluster.x-k8s.io/v1beta2
kind: KubeadmConfigTemplate
metadata:
  name: my-cluster-md-0
  namespace: default
spec:
  template:
    spec:
      joinConfiguration:
        nodeRegistration:
          criSocket: unix:///var/run/containerd/containerd.sock
          kubeletExtraArgs:
            - name: eviction-hard
              value: nodefs.available<0%,nodefs.inodesFree<0%,imagefs.available<0%
---
apiVersion: cluster.x-k8s.io/v1beta2
kind: MachineDeployment
metadata:
  name: my-cluster-md-0
  namespace: default
spec:
  clusterName: my-cluster
  replicas: 2
  selector:
    matchLabels:
      cluster.x-k8s.io/cluster-name: my-cluster
  template:
    metadata:
      labels:
        cluster.x-k8s.io/cluster-name: my-cluster
    spec:
      clusterName: my-cluster
      version: v1.32.0
      bootstrap:
        configRef:
          apiGroup: bootstrap.cluster.x-k8s.io
          kind: KubeadmConfigTemplate
          name: my-cluster-md-0
      infrastructureRef:
        apiGroup: infrastructure.cluster.x-k8s.io
        kind: DockerMachineTemplate
        name: my-cluster-md-0
```

---

## Key Differences: v1beta1 vs v1beta2

### Object References

```yaml
# v1beta1 - uses apiVersion (includes version), allows namespace/uid/etc.
infrastructureRef:
  apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
  kind: DockerCluster
  name: my-cluster
  namespace: default

# v1beta2 - uses apiGroup (no version suffix), no namespace/uid
infrastructureRef:
  apiGroup: infrastructure.cluster.x-k8s.io
  kind: DockerCluster
  name: my-cluster
```

### ClusterClass Reference

```yaml
# v1beta1
spec:
  topology:
    class: quick-start

# v1beta2
spec:
  topology:
    classRef:
      name: quick-start
```

### extraArgs Format

```yaml
# v1beta1 - map[string]string
kubeletExtraArgs:
  eviction-hard: nodefs.available<0%,nodefs.inodesFree<0%,imagefs.available<0%
  cgroup-driver: cgroupfs

# v1beta2 - []Arg (list of name/value pairs, aligns with kubeadm v1beta4)
kubeletExtraArgs:
  - name: eviction-hard
    value: nodefs.available<0%,nodefs.inodesFree<0%,imagefs.available<0%
```

### Duration Fields

```yaml
# v1beta1 - metav1.Duration
nodeDeletionTimeout: 10m

# v1beta2 - *int32 with unit in field name
nodeDeletionTimeoutSeconds: 600
```

### Status Fields

```yaml
# v1beta1
status:
  infrastructureReady: true
  controlPlaneReady: true
  failureReason: "..."
  failureMessage: "..."

# v1beta2
status:
  initialization:
    infrastructureProvisioned: true
    controlPlaneInitialized: true
  # failureReason/failureMessage moved to status.deprecated.v1beta1
  conditions:            # uses metav1.Conditions (K8s-aligned)
    - type: Available
      status: "True"
```

### Rollout Configuration

```yaml
# v1beta1 - separate fields
spec:
  rolloutBefore: ...
  rolloutAfter: ...
  rolloutStrategy: ...

# v1beta2 - consolidated
spec:
  rollout: ...
```

### MachineDeployment Naming

```yaml
# v1beta1
spec:
  machineNamingStrategy: ...

# v1beta2
spec:
  machineNaming: ...
```

### Full Comparison Table

| Aspect                      | v1beta1                                   | v1beta2                                          |
| --------------------------- | ----------------------------------------- | ------------------------------------------------ |
| Object references           | `apiVersion` (group/version)              | `apiGroup` (group only)                          |
| ClusterClass ref            | `spec.topology.class`                     | `spec.topology.classRef.name`                    |
| extraArgs                   | `map[string]string`                       | `[]Arg` (list of {name, value})                  |
| Duration fields             | `metav1.Duration` (`10m`)                 | `*int32` with unit name (`600`)                  |
| Status: infra ready         | `status.infrastructureReady`              | `status.initialization.infrastructureProvisioned`|
| Status: CP ready            | `status.controlPlaneReady`                | `status.initialization.controlPlaneInitialized`  |
| Status: failure             | `failureReason` / `failureMessage`        | Removed (under `status.deprecated.v1beta1`)      |
| Status: conditions          | CAPI-specific conditions                  | `metav1.Conditions` (K8s-aligned)                |
| Paused field                | `spec.paused` (bool)                      | `spec.paused` (*bool)                            |
| Failure domains (status)    | `map[string]FailureDomainSpec`            | `[]FailureDomain` (array)                        |
| Rollout config              | Separate `rolloutBefore/After/Strategy`   | Consolidated `spec.rollout`                      |
| Naming strategy             | `machineNamingStrategy`                   | `machineNaming`                                  |
| MHC node startup timeout    | `spec.nodeStartupTimeout`                 | `spec.checks.nodeStartupTimeoutSeconds`          |
| MHC max unhealthy           | `spec.maxUnhealthy`                       | `spec.remediation.triggerIf.unhealthyLessThanOrEqualTo` |
| CAPI versions               | v1.0 - v1.13 (served)                     | v1.11+ (storage version)                         |

---

## Migration: v1beta1 to v1beta2

### Upgrade Path (In-Cluster)

```bash
# Check available upgrades
clusterctl upgrade plan

# Upgrade all providers
clusterctl upgrade apply \
  --core cluster-api:v1.12.3 \
  --bootstrap kubeadm:v1.12.3 \
  --control-plane kubeadm:v1.12.3 \
  --infrastructure docker:v1.12.3
```

CRD conversion webhooks handle field conversion automatically. Existing v1beta1 objects
are converted to v1beta2 (storage version) on read.

### Manual YAML Migration Checklist

1. Change all `apiVersion` from `*/v1beta1` to `*/v1beta2`
2. Replace `apiVersion` in object refs with `apiGroup` (remove version suffix)
3. Remove `namespace`, `uid`, `resourceVersion` from object references
4. Replace `spec.topology.class` with `spec.topology.classRef.name`
5. Convert `extraArgs` from `map[string]string` to `[]Arg` format
6. Convert duration fields to `*int32` with unit-suffixed names
7. Rename `machineNamingStrategy` to `machineNaming`
8. Consolidate rollout fields into `spec.rollout`

### Known Issues

- No automated YAML migration tool yet (proposed in [issue #12716](https://github.com/kubernetes-sigs/cluster-api/issues/12716))
- `rolloutStrategy.type` must be explicitly set if `rollingUpdate.maxSurge` is specified (fixed in v1.11.1+)
- `clusterctl move` has limitations between v1beta1/v1beta2 management clusters

---

## References

- [Quick Start - The Cluster API Book](https://cluster-api.sigs.k8s.io/user/quick-start)
- [Version Support - The Cluster API Book](https://cluster-api.sigs.k8s.io/reference/versions)
- [v1.10 to v1.11 Migration Guide](https://main.cluster-api.sigs.k8s.io/developer/providers/migrations/v1.10-to-v1.11)
- [CAPI Releases (GitHub)](https://github.com/kubernetes-sigs/cluster-api/releases)
- [Docker Provider Templates (GitHub)](https://github.com/kubernetes-sigs/cluster-api/tree/main/test/infrastructure/docker/templates)
