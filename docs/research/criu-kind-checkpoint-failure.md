# Why CRIU Checkpoint/Restore Does Not Work with kind Clusters

**Date**: 2025-03-05
**Status**: Blocked — not feasible with current CRIU/kind architecture
**Environment**: Lima VM (Ubuntu 24.04, kernel 6.8.0-90-generic, aarch64), CRIU 4.2, Docker 28.x (experimental), kind v0.32.0

---

## Motivation

We investigated using Docker's checkpoint/restore feature (backed by CRIU) to snapshot a fully provisioned kind cluster and restore it in seconds. The goal was to provide each E2E test scenario with an isolated, clean Kubernetes cluster without paying the cost of full cluster creation + Helm provisioning (~2-3 minutes) every time.

The ideal workflow:

```
1. Create kind cluster + install Helm charts → docker checkpoint create (once)
2. Per test: docker start --checkpoint <name> → run test → docker stop (seconds)
```

## Experiment Setup

1. Created a Lima VM (`vmType: vz`) with Ubuntu 24.04 on macOS (Apple Silicon)
2. Installed Docker (rootful) with `experimental: true`
3. Installed CRIU 4.2 from the official PPA (`ppa:criu/ppa`)
4. Verified CRIU kernel compatibility: `sudo criu check` → `Looks good.`
5. Confirmed kernel config: `CONFIG_CHECKPOINT_RESTORE=y`
6. Created a single-node kind cluster (control-plane only, no separate workers)
7. Attempted: `docker checkpoint create criu-test-control-plane ready-state`

## Failure

The checkpoint operation failed with the following errors:

```
Error (criu/namespaces.c:460): Can't dump nested pid namespace for 5913
Error (criu/namespaces.c:700): Can't make pidns id
iptables-restore: line 3 failed: Bad rule (does a matching rule exist in that chain?).
ip6tables-restore: line 3 failed: Bad rule (does a matching rule exist in that chain?).
Error (criu/cr-dump.c:2128): Dumping FAILED.
```

## Root Cause Analysis

### Primary Failure: Nested PID Namespaces

The critical error is:

```
Can't dump nested pid namespace for 5913
```

This is a fundamental architectural conflict between how kind works and what CRIU can checkpoint.

#### How kind Works (Docker-in-Docker)

A kind node is a Docker container that runs a full Linux init system (systemd) and a container runtime (containerd) inside it. The process tree looks like:

```
Host Docker daemon
 └─ kind-control-plane container (PID namespace 1)
     └─ systemd (PID 1 in container)
         ├─ containerd
         ├─ kubelet
         │    └─ spawns pods as containers → (PID namespace 2, 3, ...)
         ├─ etcd (as a static pod container)
         ├─ kube-apiserver (as a static pod container)
         ├─ kube-scheduler (as a static pod container)
         └─ kube-controller-manager (as a static pod container)
```

Each Kubernetes pod runs in its own PID namespace, nested inside the kind container's PID namespace. This creates a **multi-level PID namespace hierarchy**.

#### Why CRIU Cannot Handle This

CRIU's checkpoint mechanism works by:

1. Freezing all processes in the target container
2. Iterating through `/proc` to dump each process's state (memory, file descriptors, sockets, namespaces, etc.)
3. Serializing everything to image files on disk

The problem is in step 2. CRIU needs to understand and record the full namespace topology. As of CRIU 4.2, **nested PID namespaces are not supported for dump operations**. The relevant code path in `criu/namespaces.c` explicitly fails when it encounters a PID namespace that is a child of the container's PID namespace:

```c
// criu/namespaces.c:460
// When CRIU finds a process (e.g., PID 5913) that belongs to a PID namespace
// different from (and nested within) the root PID namespace of the container,
// it cannot serialize the relationship and fails.
```

This is not a configuration issue — it is a hard limitation in CRIU's architecture. Supporting nested PID namespaces would require CRIU to:

- Track parent-child relationships between PID namespaces
- Preserve PID assignments across namespace boundaries during restore
- Re-create the namespace hierarchy in the correct order on restore

This is an [open area of work in the CRIU project](https://criu.org/Pid_namespaces) but is not yet implemented for the general case.

### Secondary Failure: iptables Rules

```
iptables-restore: line 3 failed: Bad rule (does a matching rule exist in that chain?).
ip6tables-restore: line 3 failed: Bad rule (does a matching rule exist in that chain?).
```

During the network-unlock phase of the dump, CRIU attempts to save and restore iptables rules. kind clusters create complex iptables/nftables rules for:

- Kubernetes Service routing (kube-proxy)
- CNI (kindnet) pod-to-pod networking
- Docker bridge networking

These rules reference network interfaces and chains that exist inside the nested network namespaces of pods, making them impossible to cleanly dump/restore from the outer container context.

### Additional Concerns (Even If Dump Succeeded)

Even if CRIU could somehow dump the container, restore would face additional challenges:

1. **Containerd state**: The inner containerd maintains state in memory and on disk. Restoring processes without also restoring containerd's internal state would leave the container runtime in an inconsistent state.

2. **etcd WAL/snapshots**: etcd uses write-ahead logs and periodic snapshots. A CRIU restore would restore etcd's memory state to a point in time, but the WAL on disk might be ahead or behind, causing data corruption.

3. **Kubernetes lease objects**: Controller manager, scheduler, and other components use lease-based leader election with timestamps. Restored processes would have stale lease timestamps, causing temporary leader election failures.

4. **Socket/connection state**: Kubelet maintains gRPC connections to the API server and containerd. These connections reference file descriptors and socket states that cannot be meaningfully restored.

## What Works with CRIU

Docker checkpoint/restore works well for **simple, single-process containers** or containers that:

- Do not create child PID namespaces
- Do not run nested container runtimes
- Have simple networking (no complex iptables chains)
- Do not manage sub-processes with their own namespaces

Examples: a Redis container, a simple web server, a database container.

## Alternatives

| Approach | Clean Guarantee | Speed | Feasibility |
|----------|----------------|-------|-------------|
| Lima VM snapshot/restore | Full (byte-level VM state) | ~10-30s (TBD) | Needs testing |
| etcd snapshot/restore | Partial (etcd state only) | ~5s | Moderate complexity |
| kind cluster pool (pre-created) | Full (fresh cluster) | 0s (from pool) | High — proven pattern |
| kind cluster per test (on-demand) | Full (fresh cluster) | 60-180s | Simple but slow |

## References

- [CRIU PID Namespaces documentation](https://criu.org/Pid_namespaces)
- [CRIU nested namespace tracking issue](https://github.com/checkpoint-restore/criu/issues)
- [Docker checkpoint documentation](https://docs.docker.com/reference/cli/docker/checkpoint/)
- [kind architecture: node image](https://kind.sigs.k8s.io/docs/design/node-image/)
- [kind architecture: initial design](https://kind.sigs.k8s.io/docs/design/initial/)
