# Cluster API (CAPI) with k0smotron on kind

How to create workload Kubernetes clusters using k0smotron as a CAPI control plane provider,
with a kind-based management cluster on macOS. The control plane runs as pods inside the
management cluster (Hosted Control Plane pattern), and workers run as Docker containers via CAPD.

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│  Host Machine (macOS + Docker Desktop)                     │
│                                                            │
│  ┌──────────────────────────────────────┐                  │
│  │ Management Cluster (kind)            │                  │
│  │                                      │                  │
│  │  - CAPI core controller              │                  │
│  │  - CAPD controller (Docker infra)    │                  │
│  │  - k0smotron controller              │                  │
│  │  - cert-manager                      │                  │
│  │                                      │                  │
│  │  ┌────────────────────────────────┐  │                  │
│  │  │ Child Cluster Control Plane    │  │                  │
│  │  │ (k0s as Pods/StatefulSet)      │  │                  │
│  │  │                                │  │                  │
│  │  │  - k0s controller pod          │  │                  │
│  │  │  - etcd StatefulSet            │  │                  │
│  │  │  - Konnectivity server         │  │                  │
│  │  │  - Service (NodePort)          │  │                  │
│  │  └────────────────────────────────┘  │                  │
│  └──────────────────────────────────────┘                  │
│                                                            │
│  ┌──────────────────────────────────────┐                  │
│  │ Child Cluster Workers (Docker)       │                  │
│  │                                      │                  │
│  │  ┌──────────┐  ┌──────────┐          │                  │
│  │  │ Worker 0 │  │ Worker 1 │  ...     │ (Docker          │
│  │  │(container│  │(container│          │  containers)     │
│  │  └──────────┘  └──────────┘          │                  │
│  └──────────────────────────────────────┘                  │
│                                                            │
│  kubectl ──► localhost:31443 ──► NodePort ──► k0s API      │
└────────────────────────────────────────────────────────────┘
```

### Comparison: kubeadm (CAPD) vs k0smotron (CAPD)

| Aspect | kubeadm + CAPD | k0smotron + CAPD |
|--------|----------------|------------------|
| Control plane | Runs on Docker containers via kubeadm | Runs as pods inside management cluster |
| CP resource usage | Requires dedicated containers | Shares management cluster resources |
| etcd | Embedded in CP container | Managed as a separate StatefulSet |
| Worker connectivity | Direct communication | Via Konnectivity tunnel |
| Multi-tenancy | Independent per cluster | Multiple CPs in a single mgmt cluster |

## Prerequisites

- Docker Desktop for macOS (running)
- `kubectl` installed
- `kind` installed (`brew install kind`)
- `clusterctl` installed (`brew install clusterctl`)

## Step 1: Create a kind Management Cluster

Using k0smotron + CAPD requires the following kind cluster configuration:

1. **Docker socket mount** -- Required for CAPD to create Docker containers (worker nodes)
2. **extraPortMappings** -- Makes NodePort services reachable from the macOS host

```yaml
# kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  ipFamily: ipv4
nodes:
  - role: control-plane
    extraMounts:
      - hostPath: /var/run/docker.sock
        containerPath: /var/run/docker.sock
    extraPortMappings:
      - containerPort: 30443
        hostPort: 30443
        protocol: TCP
      - containerPort: 30132
        hostPort: 30132
        protocol: TCP
```

> **Note**: The `containerPort` values must match `K0smotronControlPlane`'s `service.apiPort` /
> `service.konnectivityPort` configured later.

```bash
kind create cluster --name capi-mgmt --config kind-config.yaml
```

## Step 2: Install CAPI + k0smotron

### Option A: Using clusterctl (Recommended)

```bash
clusterctl init \
  --bootstrap k0sproject-k0smotron \
  --control-plane k0sproject-k0smotron \
  --infrastructure docker
```

This automatically installs:

- cert-manager
- CAPI core controllers
- k0smotron bootstrap provider
- k0smotron control plane provider
- Docker infrastructure provider (CAPD)

### Option B: kubectl apply + clusterctl

```bash
# 1. cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl wait --for=condition=Available deployment --all -n cert-manager --timeout=120s

# 2. k0smotron (includes all CAPI providers)
kubectl apply --server-side=true -f https://docs.k0smotron.io/stable/install.yaml

# 3. Docker infrastructure provider
clusterctl init --infrastructure docker
```

### Verify Installation

```bash
kubectl get pods -A | grep -E "capi|k0smotron|capd|cert-manager"
```

Expected namespaces:

- `cert-manager` -- cert-manager pods
- `capi-system` -- CAPI core controller
- `capd-system` -- Docker infrastructure provider
- `k0smotron` -- k0smotron controllers

Wait for all controllers to become ready:

```bash
kubectl wait --for=condition=Available deployment --all --all-namespaces --timeout=300s
```

## Step 3: Create a Child Cluster

### Required Resources

The Hosted Control Plane pattern requires the following resources:

| Resource | Kind | Purpose |
|----------|------|---------|
| Cluster | `cluster.x-k8s.io/v1beta1` | CAPI top-level resource |
| K0smotronControlPlane | `controlplane.cluster.x-k8s.io/v1beta1` | Control plane as pods definition |
| DockerCluster | `infrastructure.cluster.x-k8s.io/v1beta1` | Infrastructure definition |
| MachineDeployment | `cluster.x-k8s.io/v1beta1` | Worker node group definition |
| DockerMachineTemplate | `infrastructure.cluster.x-k8s.io/v1beta1` | Docker container template for workers |
| K0sWorkerConfigTemplate | `bootstrap.cluster.x-k8s.io/v1beta1` | Worker bootstrap configuration |

### Manifest

```yaml
# child-cluster.yaml

# --- Cluster (CAPI top-level) ---
apiVersion: cluster.x-k8s.io/v1beta1
kind: Cluster
metadata:
  name: child-cluster
  namespace: default
spec:
  clusterNetwork:
    pods:
      cidrBlocks:
        - 192.168.0.0/16
    serviceDomain: cluster.local
    services:
      cidrBlocks:
        - 10.128.0.0/12
  controlPlaneRef:
    apiVersion: controlplane.cluster.x-k8s.io/v1beta1
    kind: K0smotronControlPlane
    name: child-cluster-cp
  infrastructureRef:
    apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
    kind: DockerCluster
    name: child-cluster

---
# --- K0smotronControlPlane (CP as pods) ---
apiVersion: controlplane.cluster.x-k8s.io/v1beta1
kind: K0smotronControlPlane
metadata:
  name: child-cluster-cp
  namespace: default
spec:
  version: v1.31.2-k0s.0
  persistence:
    type: emptyDir
  service:
    type: NodePort
    apiPort: 30443
    konnectivityPort: 30132
  k0sConfig:
    apiVersion: k0s.k0sproject.io/v1beta1
    kind: ClusterConfig
    spec:
      telemetry:
        enabled: false

---
# --- DockerCluster (infrastructure) ---
# CRITICAL: The managed-by annotation is required
apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
kind: DockerCluster
metadata:
  name: child-cluster
  namespace: default
  annotations:
    cluster.x-k8s.io/managed-by: k0smotron
spec: {}

---
# --- MachineDeployment (workers) ---
apiVersion: cluster.x-k8s.io/v1beta1
kind: MachineDeployment
metadata:
  name: child-cluster-workers
  namespace: default
spec:
  clusterName: child-cluster
  replicas: 1
  selector:
    matchLabels:
      cluster.x-k8s.io/cluster-name: child-cluster
      pool: worker-pool
  template:
    metadata:
      labels:
        cluster.x-k8s.io/cluster-name: child-cluster
        pool: worker-pool
    spec:
      clusterName: child-cluster
      version: v1.31.2
      bootstrap:
        configRef:
          apiVersion: bootstrap.cluster.x-k8s.io/v1beta1
          kind: K0sWorkerConfigTemplate
          name: child-cluster-worker-config
      infrastructureRef:
        apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
        kind: DockerMachineTemplate
        name: child-cluster-worker-mt

---
# --- DockerMachineTemplate (worker container spec) ---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
kind: DockerMachineTemplate
metadata:
  name: child-cluster-worker-mt
  namespace: default
spec:
  template:
    spec: {}

---
# --- K0sWorkerConfigTemplate (worker bootstrap) ---
apiVersion: bootstrap.cluster.x-k8s.io/v1beta1
kind: K0sWorkerConfigTemplate
metadata:
  name: child-cluster-worker-config
  namespace: default
spec:
  template:
    spec:
      version: v1.31.2+k0s.0
```

### Key Points

1. **`DockerCluster` must have the `cluster.x-k8s.io/managed-by: k0smotron` annotation.**
   Without it, CAPI will incorrectly manage the DockerCluster lifecycle.

2. **`service.apiPort: 30443`** must match the kind `extraPortMappings` `containerPort: 30443`.

3. **`persistence.type: emptyDir`** is for development. Use `pvc` for production.

4. **k0s version** must use the same minor version in both `K0smotronControlPlane.spec.version`
   and `K0sWorkerConfigTemplate.spec.template.spec.version`.

### Apply

```bash
kubectl apply -f child-cluster.yaml
```

### Monitor Provisioning

```bash
# Watch cluster status
kubectl get cluster -w

# Detailed tree view
clusterctl describe cluster child-cluster

# Control plane pods
kubectl get pods -l cluster.x-k8s.io/cluster-name=child-cluster

# Machine status
kubectl get machine -w

# Check events
kubectl get events --sort-by=.metadata.creationTimestamp
```

Expected phase transitions: `Pending` -> `Provisioning` -> `Provisioned`

## Step 4: Access the Child Cluster from macOS

### Retrieve Kubeconfig

```bash
# Via clusterctl
clusterctl get kubeconfig child-cluster > ~/.kube/child-cluster.conf
```

Or directly from the Secret:

```bash
kubectl get secret child-cluster-kubeconfig \
  -o jsonpath='{.data.value}' | base64 -d > ~/.kube/child-cluster.conf
```

### Fix the Server Address

The retrieved kubeconfig's `server` field points to a cluster-internal IP that is unreachable
from macOS. Update it to point to the NodePort on localhost:

```bash
# Check the current server address
grep server ~/.kube/child-cluster.conf

# Replace with localhost NodePort
sed -i '' 's|server: https://.*|server: https://127.0.0.1:30443|' ~/.kube/child-cluster.conf
```

### Verify Access

```bash
# Connect to the child cluster
KUBECONFIG=~/.kube/child-cluster.conf kubectl get nodes

# Check system pods (may be Pending until workers join)
KUBECONFIG=~/.kube/child-cluster.conf kubectl get pods -A
```

### Register as a kubectl Context (Optional)

```bash
# Merge with existing kubeconfig
KUBECONFIG=~/.kube/config:~/.kube/child-cluster.conf kubectl config view --flatten > ~/.kube/merged
mv ~/.kube/merged ~/.kube/config

# Switch context
kubectl config use-context child-cluster-admin@child-cluster
```

## Alternative: LoadBalancer with cloud-provider-kind (Recommended)

Instead of NodePort + extraPortMappings + manual kubeconfig patching, you can use
`cloud-provider-kind` to automatically assign a host-reachable IP to the child cluster's
LoadBalancer Service. This eliminates the need for extraPortMappings in the kind config
and the `sed` server address patching in the kubeconfig.

### How cloud-provider-kind Works

cloud-provider-kind is a standalone binary that watches all kind clusters for Services
with `type: LoadBalancer`. When it detects one, it:

1. Creates an Envoy proxy container on the same Docker network as the kind cluster
2. Assigns the proxy container's IP as the Service's external IP
3. On macOS, adds the IP as a loopback alias (`ifconfig lo0 alias <IP>`) and creates
   per-port TCP tunnels so the IP is reachable from the host

```
┌────────────────────────────────────────────────────────────┐
│  Host Machine (macOS + Docker Desktop)                     │
│                                                            │
│  lo0: 172.18.0.X/32 (alias by cloud-provider-kind)        │
│                                                            │
│  cloud-provider-kind (sudo, tunneling)                     │
│    tunnel: 172.18.0.X:6443 ──► Docker VM ──► Envoy:6443   │
│    tunnel: 172.18.0.X:8132 ──► Docker VM ──► Envoy:8132   │
│                                                            │
│  ┌──────────────────────────────────────┐                  │
│  │ Management Cluster (kind)           │                  │
│  │                                      │                  │
│  │  K0smotronControlPlane               │                  │
│  │    Service type: LoadBalancer         │                  │
│  │    externalIP: 172.18.0.X            │                  │
│  └──────────────────────────────────────┘                  │
│                                                            │
│  ┌──────────────┐                                          │
│  │ kindccm-xxx  │ (Envoy proxy container)                  │
│  │ 172.18.0.X   │                                          │
│  └──────────────┘                                          │
│                                                            │
│  kubectl ──► https://172.18.0.X:6443 ──► tunnel ──► Envoy  │
│              ──► k0s API server pod                         │
└────────────────────────────────────────────────────────────┘
```

### Install cloud-provider-kind

```bash
# macOS (Homebrew)
brew install cloud-provider-kind

# Or via Go
go install sigs.k8s.io/cloud-provider-kind@latest
```

### Run cloud-provider-kind

Must run with `sudo` on macOS (needed for loopback alias and tunneling):

```bash
sudo cloud-provider-kind
```

Keep it running in a separate terminal for the entire session. It auto-discovers all
kind clusters.

### Simplified kind Config

With LoadBalancer, extraPortMappings are no longer needed. The kind config only needs
the Docker socket mount for CAPD:

```yaml
# kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  ipFamily: ipv4
nodes:
  - role: control-plane
    extraMounts:
      - hostPath: /var/run/docker.sock
        containerPath: /var/run/docker.sock
```

### K0smotronControlPlane with LoadBalancer

```yaml
apiVersion: controlplane.cluster.x-k8s.io/v1beta1
kind: K0smotronControlPlane
metadata:
  name: child-cluster-cp
  namespace: default
spec:
  version: v1.31.2-k0s.0
  persistence:
    type: emptyDir
  service:
    type: LoadBalancer        # Instead of NodePort
    apiPort: 6443             # Standard port (no NodePort range constraint)
    konnectivityPort: 8132    # Standard port
  k0sConfig:
    apiVersion: k0s.k0sproject.io/v1beta1
    kind: ClusterConfig
    spec:
      telemetry:
        enabled: false
```

k0smotron automatically detects the LoadBalancer's external IP and embeds it in the
generated kubeconfig. No manual `sed` patching is required.

### Access the Child Cluster (No Patching Needed)

```bash
clusterctl get kubeconfig child-cluster > ~/.kube/child-cluster.conf

# The server address already points to the LB IP -- just use it directly
KUBECONFIG=~/.kube/child-cluster.conf kubectl get nodes
```

### NodePort vs LoadBalancer Comparison

| Aspect | NodePort | LoadBalancer |
|--------|----------|--------------|
| kind config | Needs `extraPortMappings` | Only Docker socket mount |
| apiPort | Must be in 30000-32767 range | Can use standard 6443 |
| Kubeconfig | Needs `sed` patching to `127.0.0.1:<port>` | Works as-is |
| Extra process | None | `sudo cloud-provider-kind` must run |
| Port conflicts | Fixed NodePorts can clash between clusters | Dynamic, no conflicts |
| Multiple clusters | Each needs unique NodePort pair | Automatic, each gets its own LB IP |

### Gotchas on macOS

- **sudo required**: cloud-provider-kind needs root to manage loopback aliases
- **Must keep running**: If the process dies, tunnels and loopback aliases disappear
- **Docker Desktop only**: OrbStack has reported compatibility issues
  ([cloud-provider-kind#142](https://github.com/kubernetes-sigs/cloud-provider-kind/issues/142))
- **Timing**: There may be a brief delay before the LB IP is assigned. Wait for
  `kubectl get svc` to show an external IP before fetching the kubeconfig

## K0smotronControlPlane Configuration Reference

```yaml
apiVersion: controlplane.cluster.x-k8s.io/v1beta1
kind: K0smotronControlPlane
spec:
  # k0s version (required)
  version: v1.31.2-k0s.0

  # Container image (default: k0sproject/k0s)
  image: ghcr.io/k0sproject/k0s:v1.31.2-k0s.0

  # Replica count (>1 requires Kine or external etcd)
  replicas: 1

  # Service exposure configuration
  service:
    type: NodePort        # ClusterIP | NodePort | LoadBalancer
    apiPort: 30443        # API server port
    konnectivityPort: 30132  # Konnectivity tunnel port
    annotations: {}       # Cloud LB annotations etc.

  # Data persistence
  persistence:
    type: emptyDir        # emptyDir | pvc
    # For pvc:
    # persistentVolumeClaim:
    #   spec:
    #     accessModes: [ReadWriteOnce]
    #     resources:
    #       requests:
    #         storage: 1Gi

  # etcd configuration (managed as a separate StatefulSet)
  etcd:
    image: quay.io/k0sproject/etcd:v3.5.13
    persistence:
      size: 1Gi

  # k0s configuration
  k0sConfig:
    apiVersion: k0s.k0sproject.io/v1beta1
    kind: ClusterConfig
    spec:
      telemetry:
        enabled: false
      network:
        provider: kuberouter  # kuberouter | calico

  # Resource limits
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 512Mi

  # Certificate references (for sharing with infrastructure)
  certificateRefs:
    - name: child-cluster-ca
      type: ca

  # Additional manifests (mounted at /var/lib/k0s/manifests/)
  manifests:
    - name: extra-manifests
      configMap:
        name: extra-manifests-cm
```

## K0sWorkerConfig Configuration Reference

```yaml
apiVersion: bootstrap.cluster.x-k8s.io/v1beta1
kind: K0sWorkerConfig
spec:
  # k0s version (must match CP minor version)
  version: v1.31.2+k0s.0

  # k0s worker startup arguments
  args:
    - --labels=role=worker

  # Commands to execute before k0s install/start
  preStartCommands:
    - "apt-get update && apt-get install -y curl"

  # Commands to execute after k0s start
  postStartCommands:
    - "echo setup-complete"

  # Files to place on the worker
  files:
    - path: /tmp/config
      content: "my-config"
    - path: /tmp/secret-config
      contentFrom:
        secretRef:
          name: my-secret
          key: config
      permissions: "0644"
```

## Konnectivity

k0smotron uses **Konnectivity** to establish communication between the control plane
(pods inside the management cluster) and worker nodes.

```
┌─────────────────────────┐        ┌──────────────────┐
│ Management Cluster      │        │ Worker Node      │
│                         │        │                  │
│  k0s CP Pod             │        │  kubelet         │
│  ┌───────────────────┐  │        │  kube-proxy      │
│  │ API Server        │◄─┼────────┼─ Konnectivity    │
│  │ Konnectivity Srv  │  │ tunnel │  Agent           │
│  └───────────────────┘  │        │                  │
└─────────────────────────┘        └──────────────────┘
```

- Workers open a bi-directional tunnel to the control plane
- API server -> worker traffic flows through this tunnel
- Both `apiPort` and `konnectivityPort` must be exposed as NodePorts
- Works even behind firewalls/NAT

## Cluster Deletion

**Always delete via the top-level Cluster resource.** This ensures proper cascading deletion.

```bash
kubectl delete cluster child-cluster
```

> Do not use `kubectl delete -f child-cluster.yaml`. Resource deletion order is not guaranteed
> and orphaned resources may remain.

## K0sControlPlane (Control Plane on VMs/Containers)

For the traditional CAPI pattern where the CP runs on dedicated machines instead of as hosted pods:

```yaml
apiVersion: cluster.x-k8s.io/v1beta1
kind: Cluster
metadata:
  name: standalone-cp-test
spec:
  clusterNetwork:
    pods:
      cidrBlocks: ["10.244.0.0/16"]
    services:
      cidrBlocks: ["10.96.0.0/12"]
  controlPlaneRef:
    apiVersion: controlplane.cluster.x-k8s.io/v1beta1
    kind: K0sControlPlane       # Not K0smotronControlPlane
    name: standalone-cp-test
  infrastructureRef:
    apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
    kind: DockerCluster
    name: standalone-cp-test
---
apiVersion: controlplane.cluster.x-k8s.io/v1beta1
kind: K0sControlPlane
metadata:
  name: standalone-cp-test
spec:
  replicas: 1
  version: v1.31.2+k0s.0
  k0sConfigSpec:
    k0s:
      apiVersion: k0s.k0sproject.io/v1beta1
      kind: ClusterConfig
      spec:
        telemetry:
          enabled: false
    args:
      - --enable-worker   # Run workloads on CP nodes
      - --no-taints
  machineTemplate:
    infrastructureRef:
      apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
      kind: DockerMachineTemplate
      name: standalone-cp-template
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
kind: DockerMachineTemplate
metadata:
  name: standalone-cp-template
spec:
  template:
    spec: {}
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
kind: DockerCluster
metadata:
  name: standalone-cp-test
spec: {}
```

### K0smotronControlPlane vs K0sControlPlane

| | K0smotronControlPlane | K0sControlPlane |
|---|---|---|
| CP location | Pods inside management cluster | CAPI-managed machines |
| Resource efficiency | High (shared) | Lower (dedicated machines) |
| Scalability | Many cluster CPs in one mgmt cluster | Dedicated resources per cluster |
| Use case | Multi-tenancy, dev environments | Production, strict isolation |
| DockerCluster annotation | `cluster.x-k8s.io/managed-by: k0smotron` required | Not required |

## Standalone k0smotron (Without CAPI)

To create just a control plane without Cluster API integration:

```yaml
apiVersion: k0smotron.io/v1beta1
kind: Cluster
metadata:
  name: simple-cluster
spec:
  replicas: 1
  k0sVersion: v1.31.2-k0s.0
  service:
    type: NodePort
    apiPort: 30443
    konnectivityPort: 30132
  persistence:
    type: emptyDir
```

Retrieve kubeconfig:

```bash
kubectl get secret simple-cluster-kubeconfig \
  -o jsonpath='{.data.value}' | base64 -d > ~/.kube/simple.conf
```

Manual worker join using JoinTokenRequest:

```yaml
apiVersion: k0smotron.io/v1beta1
kind: JoinTokenRequest
metadata:
  name: worker-token
spec:
  clusterRef:
    name: simple-cluster
    namespace: default
  expiry: 1h
```

```bash
# Retrieve token
kubectl get secret worker-token -o jsonpath='{.data.token}' | base64 -d > join-token.txt

# On the worker node
curl -sSLf https://get.k0s.sh | sudo sh
sudo k0s install worker --token-file ./join-token.txt
sudo k0s start
```

## HA Configuration

For replicas > 1, a Kine (SQL backend) or external etcd is required:

```yaml
apiVersion: k0smotron.io/v1beta1
kind: Cluster
spec:
  replicas: 3
  service:
    type: LoadBalancer
  kineDataSourceURL: postgres://user:pass@host:5432/kine?sslmode=disable
```

## ClusterClass Pattern

For reusable cluster templates with k0smotron:

```yaml
apiVersion: controlplane.cluster.x-k8s.io/v1beta1
kind: K0smotronControlPlaneTemplate
metadata:
  name: cp-template
spec:
  template:
    spec:
      version: v1.31.2-k0s.0
      persistence:
        type: emptyDir
      service:
        type: NodePort
---
apiVersion: bootstrap.cluster.x-k8s.io/v1beta1
kind: K0sWorkerConfigTemplate
metadata:
  name: worker-template
spec:
  template:
    spec:
      version: v1.31.2+k0s.0
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
kind: DockerClusterTemplate
metadata:
  name: docker-cluster-template
spec:
  template:
    spec: {}
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
kind: DockerMachineTemplate
metadata:
  name: worker-machine-template
spec:
  template:
    spec: {}
---
apiVersion: cluster.x-k8s.io/v1beta1
kind: ClusterClass
metadata:
  name: k0smotron-class
spec:
  controlPlane:
    ref:
      apiVersion: controlplane.cluster.x-k8s.io/v1beta1
      kind: K0smotronControlPlaneTemplate
      name: cp-template
  infrastructure:
    ref:
      apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
      kind: DockerClusterTemplate
      name: docker-cluster-template
  workers:
    machineDeployments:
      - class: default-worker
        template:
          bootstrap:
            ref:
              apiVersion: bootstrap.cluster.x-k8s.io/v1beta1
              kind: K0sWorkerConfigTemplate
              name: worker-template
          infrastructure:
            ref:
              apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
              kind: DockerMachineTemplate
              name: worker-machine-template
---
# Create a cluster using the ClusterClass
apiVersion: cluster.x-k8s.io/v1beta1
kind: Cluster
metadata:
  name: my-cluster
spec:
  topology:
    class: k0smotron-class
    version: v1.31.2
    controlPlane:
      replicas: 1
    workers:
      machineDeployments:
        - class: default-worker
          name: workers
          replicas: 1
```

## Troubleshooting

### Workers Cannot Join

- Check if the join token has expired
- Verify k0s CP/worker versions use the same minor version
- Ensure the Konnectivity port is reachable

### Kubeconfig Connection Fails

- Verify the `server` field points to `https://127.0.0.1:<NodePort>`
- Confirm kind `extraPortMappings` includes the matching ports
- Check if CP pod is Running and Ready: `kubectl get pods -l cluster.x-k8s.io/cluster-name=<name>`

### DockerCluster Stuck in Provisioning

- Verify `cluster.x-k8s.io/managed-by: k0smotron` annotation is present
- Check k0smotron controller logs: `kubectl logs -n k0smotron deploy/k0smotron-controller-manager`

### CAPD Cannot Create Containers

- Verify Docker socket is mounted on the kind node
- Check Docker Desktop is running
- Check CAPD controller logs: `kubectl logs -n capd-system deploy/capd-controller-manager`

### k0s Version Notes

- k0s requires controllers and workers to use the same minor version
- Skipping minor versions during upgrades is not supported (e.g., v1.30.x -> v1.32.x without v1.31.x)
- k0s maintains support for the four most recent minor Kubernetes versions

## References

- [k0smotron Documentation](https://docs.k0smotron.io/stable/)
- [k0smotron GitHub](https://github.com/k0sproject/k0smotron)
- [k0smotron CAPI Overview](https://docs.k0smotron.io/stable/cluster-api/)
- [k0smotron Installation](https://docs.k0smotron.io/stable/install/)
- [k0smotron Docker Provider](https://docs.k0smotron.io/stable/capi-docker/)
- [k0smotron Control Plane Provider](https://docs.k0smotron.io/stable/capi-controlplane/)
- [k0smotron Bootstrap Provider](https://docs.k0smotron.io/stable/capi-bootstrap/)
- [k0smotron Join Worker Nodes](https://docs.k0smotron.io/stable/join-nodes/)
- [k0smotron Configuration](https://docs.k0smotron.io/stable/configuration/)
- [k0smotron Resource Reference](https://docs.k0smotron.io/stable/resource-reference/k0smotron.io-v1beta1/)
- [Cluster API Quick Start](https://cluster-api.sigs.k8s.io/user/quick-start)
