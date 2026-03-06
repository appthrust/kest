# Lima VM Snapshot for Fast Kubernetes Cluster Provisioning

**Date**: 2025-03-05
**Status**: Validated — practical approach for isolated, pre-provisioned clusters
**Environments tested**:
- macOS (Apple Silicon), Lima 2.0.3 (VZ driver), kind v0.32.0, APFS filesystem
- Linux (GitHub Actions `ubuntu-latest`), Lima 2.0.3 (QEMU driver), kind v0.32.0, QEMU 8.2.2

---

## Motivation

E2E testing frameworks like kest need isolated Kubernetes clusters per test scenario. Creating a kind cluster from scratch is fast (~11s), but installing Helm charts (cert-manager, ingress-nginx, monitoring, etc.) adds minutes. We investigated whether Lima VM snapshots could provide pre-provisioned clusters in seconds.

## Approach: APFS Clone as VM Snapshot

Lima 2.0.3 does not yet implement `limactl snapshot` for the VZ driver (`unimplemented`). However, Lima VM disks on macOS are stored as sparse files on APFS, which supports **copy-on-write cloning** via `cp -c`. This effectively gives us instant, zero-cost snapshots.

### How It Works

```
1. Create Lima VM + kind cluster + install Helm charts (one-time setup)
2. Stop VM
3. cp -c diffdisk diffdisk.snapshot          # APFS clone: ~0.003s, ~0 bytes extra
4. Per test scenario:
   a. cp -c diffdisk.snapshot diffdisk       # Restore: ~0.003s
   b. limactl start <instance>              # Boot VM: ~16-21s
   c. Cluster is Ready with all charts installed
   d. Run tests
   e. limactl stop <instance>
```

### Why APFS Clone Works

- APFS (Apple File System) supports block-level copy-on-write
- `cp -c` creates a clone that shares physical blocks with the source
- Only blocks that are modified after cloning consume additional disk space
- The 100GB sparse disk (4.8GB actual) clones in **0.003 seconds**

---

## Benchmark Results

### Test 1: Single VM Restore Time

| Phase | Time |
|-------|------|
| Disk restore (`cp -c`) | ~0s |
| VM boot (`limactl start`) | 16s |
| kind cluster Ready | **21s total** |

### Test 2: Parallel VM Startup (4 VMs simultaneously)

| Metric | Result |
|--------|--------|
| VMs started | 4 (criu-test, clone-1, clone-2, clone-3) |
| All VMs ready | **31s** |
| All clusters Ready | Immediately after VM boot |
| Cluster status | All 4 reported `Ready` with identical state |

Parallel startup scales well — 4 VMs take only ~10s longer than 1 VM, likely due to shared CPU/IO contention during boot.

### Test 3: Fresh kind + Helm Install vs VM Restore

Measured on the same hardware (Lima VM, 4 CPU, 8GB RAM):

| Approach | Time |
|----------|------|
| **Lima VM snapshot restore** | **21s** |
| kind create cluster (bare) | 11s |
| + cert-manager (helm install --wait) | 54s cumulative |
| + ingress-nginx (helm install --wait) | 253s+ cumulative (timeout) |

**VM snapshot restore is ~12x faster** than creating a new cluster with just two Helm charts. The gap widens with every additional chart, while VM restore time remains constant at ~21s regardless of what is pre-installed.

---

## Parallel Instance Cloning

To run multiple isolated clusters in parallel, clone the entire Lima instance directory:

```bash
clone_instance() {
  local src="$1"
  local dst="$2"
  local dir="$HOME/.lima/$dst"

  mkdir -p "$dir" "$dir/sock"

  # APFS clone large files (near-zero disk cost)
  cp -c "$HOME/.lima/$src/diffdisk" "$dir/diffdisk"
  cp -c "$HOME/.lima/$src/basedisk" "$dir/basedisk"
  cp -c "$HOME/.lima/$src/vz-efi"   "$dir/vz-efi"

  # Copy small config files
  cp "$HOME/.lima/$src/lima.yaml"      "$dir/lima.yaml"
  cp "$HOME/.lima/$src/cidata.iso"     "$dir/cidata.iso"
  cp "$HOME/.lima/$src/lima-version"   "$dir/lima-version"

  # Generate unique VZ machine identifier
  uuidgen | tr '[:upper:]' '[:lower:]' \
    | python3 -c "import sys,json; print(json.dumps({'machineIdentifier': sys.stdin.read().strip()}))" \
    > "$dir/vz-identifier"
}

# Create 3 clones from a golden image
clone_instance golden-vm test-vm-1
clone_instance golden-vm test-vm-2
clone_instance golden-vm test-vm-3

# Start all in parallel
limactl start test-vm-1 &
limactl start test-vm-2 &
limactl start test-vm-3 &
wait
```

Lima automatically recognizes directories under `~/.lima/` as instances.

---

## Important Notes

### Kubeconfig Persistence

The kind kubeconfig must be saved to a **persistent location** inside the VM before taking the snapshot. `/tmp` is cleared on reboot.

```bash
# Inside the VM, after kind cluster creation:
kind export kubeconfig --name <cluster> --kubeconfig /etc/kind-kubeconfig
chmod 644 /etc/kind-kubeconfig
```

### Lima VZ Snapshot Status

As of Lima 2.0.3, `limactl snapshot create` with `vmType: vz` returns `unimplemented`. The APFS clone workaround achieves the same result. QEMU-based VMs support `limactl snapshot` natively (see [Linux/QEMU Results](#linux-github-actions--qemu-snapshot) below).

### Disk Space

- Each clone uses near-zero additional space initially (APFS copy-on-write)
- Writes during VM operation consume proportional space
- A kind cluster VM uses ~4.8GB actual disk (100GB sparse)
- Monitor with `du -h ~/.lima/<instance>/diffdisk` (logical) and `diskutil apfs list` (physical)

### Resource Requirements per VM

| Resource | Per VM |
|----------|--------|
| CPU | 4 cores (shared with host) |
| Memory | 8 GiB (reserved) |
| Disk | ~4.8 GB (sparse, grows with writes) |

For parallel execution, plan **8 GiB RAM per VM**. On a 32GB Mac, 3-4 concurrent VMs is practical.

---

## Comparison with Other Approaches

| Approach | Clean Guarantee | Provisioning Time | Parallel Support |
|----------|----------------|-------------------|-----------------|
| **Firecracker snapshot** | Full (VM memory state) | **~28ms** (SSH: ~1.7s) | Yes (separate VMs) |
| **Lima VM snapshot** | Full (byte-level disk state) | **~21s** | Yes (APFS clone) |
| kind create + helm install | Full (fresh cluster) | 60-253s+ | Yes (but slow each) |
| Namespace isolation | Partial (namespace-scoped only) | ~0s | Yes |
| CRIU checkpoint/restore | N/A | N/A | **Not feasible** (see [criu-kind-checkpoint-failure.md](./criu-kind-checkpoint-failure.md)) |

---

## Linux (GitHub Actions) — QEMU Snapshot

We validated `limactl snapshot` with the QEMU driver on GitHub Actions free Linux runners (`ubuntu-latest`).

### How It Works (Linux/QEMU)

On Linux, Lima uses QEMU with KVM acceleration. QEMU has mature `savevm`/`loadvm` support, and `limactl snapshot` is fully implemented for the QEMU driver. Unlike macOS where we use APFS clone workarounds, this is a first-class feature.

```
1. Create Lima VM (QEMU + KVM) + kind cluster + install Helm charts
2. limactl stop <instance>
3. limactl snapshot create <instance> --tag kind-ready     # QEMU savevm
4. Per test scenario:
   a. limactl snapshot apply <instance> --tag kind-ready   # QEMU loadvm
   b. limactl start <instance>                             # Resume VM
   c. Cluster is Ready (state fully restored from snapshot)
   d. Run tests
   e. limactl stop <instance>
```

### KVM on GitHub Actions

Standard `ubuntu-latest` runners provide `/dev/kvm`. Enable it with:

```yaml
- name: Enable KVM
  run: |
    echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666"' | sudo tee /etc/udev/rules.d/99-kvm.rules
    sudo udevadm control --reload-rules
    sudo udevadm trigger
```

### Benchmark Results (GitHub Actions)

Measured on `ubuntu-latest` runner (2 vCPU, 7GB RAM):

| Phase | Time |
|-------|------|
| VM creation (first time, QEMU) | 66s |
| kind cluster creation | 43s |
| **Snapshot create** (`limactl snapshot create`) | **0s** |
| **Snapshot restore → cluster Ready** | **24s** (boot: 23s + cluster: 1s) |

The snapshot restore is **~4.5x faster** than creating a fresh kind cluster (43s) on the same hardware — and this gap grows dramatically when Helm charts are pre-installed.

Notable: cluster readiness after snapshot restore takes only **1 second** because the QEMU snapshot captures the full VM memory state, including all running processes (Docker, kubelet, etcd, etc.). There is no cold-start penalty for K8s components.

### Cross-Platform Comparison

| | macOS (VZ + APFS clone) | Linux (QEMU snapshot) |
|---|---|---|
| Snapshot mechanism | `cp -c` (APFS CoW) | `limactl snapshot` (QEMU savevm) |
| Snapshot restore → Ready | **21s** | **24s** |
| VM boot time | 16s | 23s |
| Cluster ready after boot | 5s (cold start) | 1s (state restored) |
| KVM required | No (VZ native) | Yes (`/dev/kvm`) |
| Native snapshot support | No (workaround) | **Yes** (first-class) |
| CI compatibility | macOS runners (expensive) | **Linux runners (free)** |

The QEMU approach is slightly slower on VM boot (23s vs 16s) due to QEMU overhead compared to VZ, but the full state restore means the cluster is ready almost instantly after boot. The total times are comparable (~21s vs ~24s).

### Firecracker — Validated: Sub-Second Snapshot Restore

[Firecracker](https://github.com/firecracker-microvm/firecracker) microVMs achieve **~182ms snapshot restore** with a fully provisioned kind cluster. Validated on GitHub Actions `ubuntu-latest` with Firecracker v1.12.0.

#### How It Works

Firecracker snapshots capture VM memory + VMM state. Combined with a pre-built rootfs (containing Docker, kind, kubectl, and kernel modules), the entire cluster state is restored from a snapshot file.

```
1. Build rootfs with Docker + kind + kubectl + kernel modules (one-time)
2. Boot Firecracker VM → kind creates cluster automatically (~42s from boot)
3. Pause VM → Create snapshot (vmstate + mem files) (~18s)
4. Per test scenario:
   a. Start new Firecracker process
   b. Load snapshot (166ms) + Resume VM (16ms)
   c. Cluster is immediately Ready with all processes running
   d. Run tests
   e. Kill Firecracker process
```

#### Benchmark Results (GitHub Actions `ubuntu-latest`)

| Phase | Time |
|-------|------|
| VM boot → Docker ready | **~2s** |
| VM boot → kind cluster Ready | **~42s** |
| cert-manager install (Helm, --wait) | **~20s** |
| **Snapshot create** (Full, 6 GiB RAM) | **~16s** |
| **Snapshot load** | **18ms** |
| **VM resume** | **10ms** |
| **Total restore (load + resume)** | **~28ms** |
| Network reachable after restore | **58ms** |
| SSH reachable after restore | **~1.7s** |

#### Post-Restore Verification (cert-manager + cluster operations)

Comprehensive verification after snapshot restore (cert-manager pre-installed in snapshot):

| Verification | Result |
|-------------|--------|
| Node status | Ready (v1.35.1) |
| All kube-system pods | Running (9/9) |
| cert-manager pods | Running (3/3) |
| Existing ClusterIssuer | Preserved, True |
| Existing Certificate | Preserved, Ready |
| **Create NEW Certificate** | **Ready after 1s** (cert-manager fully functional) |
| **Create nginx Deployment (2 replicas)** | **Rollout success, 2/2 Running** |
| Docker inside VM | Running normally |

This proves that Firecracker snapshot restore preserves full Kubernetes cluster state including:
- Control plane (API server, scheduler, controller-manager, etcd)
- Networking (CNI, kube-proxy, CoreDNS)
- Installed Helm charts (cert-manager with webhooks and CRDs)
- The ability to create new resources and schedule new workloads post-restore

#### Snapshot File Sizes

| File | Size | Contents |
|------|------|----------|
| `mem` | 6.0 GB | Full VM memory dump |
| `vmstate` | 29 KB | VMM state (CPU registers, device state) |

#### Implementation Details

Key requirements discovered during validation:

1. **Host kernel modules in rootfs**: Firecracker uses the host kernel but the rootfs must contain `/lib/modules/$KVER`. Without them, Docker fails (overlay, br_netfilter, veth, nf_conntrack, iptable_nat, iptable_filter required).

2. **systemd `%` escaping**: Inline bash in `ExecStart=` fails if it contains `%` characters (e.g., `date +%s`). Use a standalone script file instead.

3. **TAP networking**: Required for VM ↔ host communication. Setup: `tap0` (172.16.0.1/24) on host, `eth0` (172.16.0.2/24) in guest, with iptables NAT masquerade.

4. **VM config**: 2 vCPU, 6144 MiB RAM, 10 GB ext4 rootfs. Boot args: `console=ttyS0 reboot=k panic=1 init=/sbin/init systemd.unified_cgroup_hierarchy=1`.

5. **SSH `-n` flag when piping to bash**: When running scripts via `echo ... | base64 -d | bash`, SSH commands consume stdin (the rest of the script). Always use `ssh -n` to prevent this.

#### Cross-Platform Comparison (Updated)

| | macOS (VZ + APFS) | Linux (QEMU snapshot) | **Linux (Firecracker)** |
|---|---|---|---|
| Snapshot restore → Ready | 21s | 24s | **~28ms** (SSH: ~1.7s) |
| VM boot time | 16s | 23s | ~2s |
| Cluster ready after boot | 5s (cold) | 1s (state) | **0s (state)** |
| KVM required | No (VZ) | Yes | **Yes** |
| CI compatibility | macOS ($$) | Linux (free) | **Linux (free)** |
| Implementation effort | Low | Low | **Medium** |
| Snapshot size | ~4.8 GB (disk) | ~4.8 GB (disk) | **6 GB (mem) + 29 KB (state)** |

Firecracker is **~860x faster** than Lima QEMU snapshot restore (28ms vs 24s) and **~750x faster** than Lima APFS clone restore (28ms vs 21s). Even measuring to SSH availability (~1.7s), it is **~14x faster** than Lima.

---

## Alternative VM Managers Evaluated

We evaluated other free macOS VM managers to determine if any could outperform Lima, particularly via suspend/resume (VM hibernation).

### Tart (v2.31.0)

[Tart](https://github.com/cirruslabs/tart) is a VM manager built for CI, using Apple's Virtualization.framework. It advertises `tart suspend` / resume for instant VM state save/restore.

**Finding: `tart suspend` is macOS-only. Linux VMs are not supported.**

```
$ tart suspend tart-kind
Error: You can only suspend macOS VMs
```

Additional issues observed with Tart + Linux VMs:

- **Guest agent instability**: After `tart stop` + `tart run` (cold boot), the Tart Guest Agent failed to reconnect, making `tart exec` unusable. This prevented benchmarking cold boot times.
- **SSH access**: The pre-built Ubuntu image (`ghcr.io/cirruslabs/ubuntu:latest`) did not allow SSH password authentication, and no SSH keys were pre-configured, making it difficult to access the VM without the guest agent.
- **No APFS clone integration for restore**: While `tart clone` exists for creating new VMs, there is no built-in mechanism for snapshot-based restore (save state → run tests → restore to saved state).

### Full Comparison

| VM Manager | VZ Support | Linux Suspend/Resume | APFS Clone | Guest Access (Linux) | License |
|-----------|-----------|---------------------|-----------|---------------------|---------|
| **Lima 2.0.3** | Yes | No (cold boot only) | Manual (`cp -c`) | SSH (stable) | Apache 2.0 |
| **Tart 2.31.0** | Yes | **No** (macOS only) | `tart clone` | Guest agent (unstable after reboot) | Apache 2.0 |
| **Colima** | Yes (Lima wrapper) | No | No | SSH (Lima) | MIT |
| **Multipass** | Yes | No | No | Shell | AGPL |
| **UTM** | Yes | saveState (GUI only) | No | SSH | Apache 2.0 |

### Why Lima Wins (For Now)

1. **Reliable SSH access**: Lima's SSH-based access works consistently across cold boots, unlike Tart's guest agent
2. **Manual APFS clone works**: While not built-in, the `cp -c` approach for disk images is simple and effective
3. **Proven parallel execution**: 4 VMs started simultaneously in 31s
4. **Mature Linux VM support**: Lima was designed for Linux VMs from the start; Tart's focus is macOS CI

### Future Re-evaluation Triggers

- **Tart adds Linux suspend/resume**: Would make Tart the clear winner (instant resume vs 21s cold boot)
- **Lima implements `limactl snapshot` for VZ**: Would eliminate the manual `cp -c` workaround
- **Any VM manager exposes VZ `saveMachineStateTo`/`restoreMachineStateFrom` for Linux**: These Virtualization.framework APIs support Linux VMs in principle; no tool exposes them yet

---

## Conclusion

**Firecracker snapshot restore is the fastest approach**, achieving ~28ms restore times (load 18ms + resume 10ms) for a fully provisioned kind cluster with cert-manager on free GitHub Actions Linux runners. SSH is available within ~1.7s. Post-restore verification confirmed full cluster functionality: existing cert-manager certificates preserved, new certificates issued in 1s, new deployments scheduled and running. This is ~860x faster than Lima QEMU snapshots (24s) and makes per-scenario cluster isolation practical even for large test suites.

For **macOS local development**, Lima APFS clone remains the best option (~21s restore, zero additional setup).

For **Linux CI** (GitHub Actions), the recommended approach depends on scale:

| Test Suite Size | Recommended Approach | Restore Time |
|----------------|---------------------|-------------|
| < 10 scenarios | Lima QEMU snapshot | ~24s |
| 10-50 scenarios | Lima QEMU snapshot | ~24s |
| 50+ scenarios | **Firecracker snapshot** | **~28ms** (~1.7s to SSH) |

All approaches are well-suited for:
- E2E test frameworks needing cluster-level isolation
- Testing cluster-scoped resources (CRDs, webhooks, ClusterRoles)
- Parallel test execution with independent clusters
- Reproducing identical cluster states across test runs

### Next Steps

1. Build a CLI/library to automate golden image creation and instance cloning
2. Integrate with kest's `useCluster` API
3. ~~Investigate Linux CI support (QEMU snapshots or alternative VM managers)~~ **Done** — validated on GitHub Actions
4. ~~Measure restore times on CI hardware (GitHub Actions runners, etc.)~~ **Done** — 24s on free runners
5. ~~Consider Firecracker for sub-second restore if test suite scale demands it~~ **Done** — 28ms restore validated, full cluster functionality confirmed post-restore (cert-manager, new deployments)
6. Build Firecracker rootfs image as reusable artifact (pre-built, cached in CI) — see [Firecracker Snapshot Knowledge Doc](./firecracker-snapshot-kind-cluster.md)
7. Implement disk CoW (e.g., `cp --reflink=auto`) for rootfs per-test isolation
8. ~~Validate parallel VM startup from same snapshot using network namespaces~~ **Done** — 3 VMs, all functional, 3.2s SSH-ready, isolation confirmed — see [Firecracker Snapshot Knowledge Doc](./firecracker-snapshot-kind-cluster.md#phase-6-parallel-vms-validated)
8. Monitor Tart for Linux suspend/resume support
9. Monitor Lima for native VZ snapshot implementation
