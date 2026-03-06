# Firecracker Snapshot for Fast kind Cluster Provisioning

**Date**: 2026-03-05
**Status**: Validated — sub-second restore of fully provisioned kind cluster on GitHub Actions
**Environment**: Linux (GitHub Actions `ubuntu-latest`), Firecracker v1.12.0, kind v0.32.0, Kubernetes v1.35.1
**GitHub Actions Run IDs**:
- Single VM + cert-manager: [22704981588](https://github.com/suinplayground/github-action-exec/actions/runs/22704981588)
- Parallel 3 VMs: [22712050097](https://github.com/suinplayground/github-action-exec/actions/runs/22712050097)
- Test script (gist): [b759cb641c51404e821354abdf2fdb6b](https://gist.github.com/suin/b759cb641c51404e821354abdf2fdb6b)

---

## TL;DR — What We Achieved

Using Firecracker microVM snapshots, we demonstrated that a kind cluster with cert-manager pre-installed can be restored in **28ms** on GitHub Actions. Furthermore, using Linux network namespaces, we **launched 3 VMs in parallel from the same snapshot** and confirmed full cluster functionality on all VMs (nodes Ready, all 12 pods Running, new Certificate issuance, cross-VM isolation).

This makes it practical to **provide a fully independent cluster per test scenario in seconds** for E2E testing.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  GitHub Actions Runner (ubuntu-latest, 2 vCPU, 7GB RAM) │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Host                                           │    │
│  │                                                 │    │
│  │  firecracker ──── /tmp/firecracker.sock (API)   │    │
│  │       │                                         │    │
│  │       │ virtio-net                              │    │
│  │       ▼                                         │    │
│  │  tap0 (172.16.0.1/24) ── iptables NAT ── eth0   │    │
│  │       │                                         │    │
│  └───────│─────────────────────────────────────────┘    │
│          │                                              │
│  ┌───────▼─────────────────────────────────────────┐    │
│  │  microVM (2 vCPU, 6 GiB RAM)                    │    │
│  │  eth0: 172.16.0.2/24                            │    │
│  │                                                 │    │
│  │  systemd                                        │    │
│  │    ├── firecracker-init.service (modules + net) │    │
│  │    ├── docker.service                           │    │
│  │    ├── sshd.service                             │    │
│  │    └── auto-kind.service                        │    │
│  │                                                 │    │
│  │  Docker                                         │    │
│  │    └── kind cluster (fc-test)                   │    │
│  │        ├── control-plane node                   │    │
│  │        │   ├── kube-apiserver                   │    │
│  │        │   ├── etcd                             │    │
│  │        │   ├── kube-scheduler                   │    │
│  │        │   ├── kube-controller-manager          │    │
│  │        │   ├── kube-proxy                       │    │
│  │        │   ├── CoreDNS (x2)                     │    │
│  │        │   ├── kindnet-cni                      │    │
│  │        │   └── local-path-provisioner           │    │
│  │        └── cert-manager (3 pods)                │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Benchmark Summary

| Phase | Time |
|-------|------|
| VM boot → Docker ready | ~2s |
| VM boot → kind cluster Ready | ~42s |
| cert-manager install (Helm) | ~20s |
| **Snapshot create** (Full, 6 GiB RAM) | ~16s |
| **Snapshot load** | **18ms** |
| **VM resume** | **10ms** |
| **Total restore (load + resume)** | **28ms** |
| Network reachable after restore (ping) | 58ms |
| SSH reachable after restore | ~1.7s |

### Comparison with Other Approaches

| Approach | Restore to Cluster Ready |
|----------|------------------------|
| **Firecracker snapshot** | **28ms** (load 18ms + resume 10ms), SSH ~1.7s |
| Lima QEMU snapshot (Linux CI) | 24s |
| Lima APFS clone (macOS) | 21s |
| kind create fresh | 39–43s |
| kind + Helm charts (cert-manager) | 60–253s+ |

Firecracker is **~860x faster** than Lima QEMU snapshot restore.

### Snapshot File Sizes

| File | Size | Contents |
|------|------|----------|
| `mem` | 6.0 GB | Full VM memory dump |
| `vmstate` | 29 KB | VMM state (CPU registers, device state) |

---

## Prerequisites

- **KVM access**: `/dev/kvm` must be available (GitHub Actions `ubuntu-latest` provides this)
- **Firecracker v1.12.0**: binary + jailer
- **Docker**: for building rootfs via `docker export`
- **Host kernel**: extract `vmlinux` from `/boot/vmlinuz-$(uname -r)`
- **sshpass**: for automated SSH authentication during testing
- **Disk**: ~20 GB free (10 GB rootfs + 6 GB snapshot mem + headroom)

### Enable KVM on GitHub Actions

```bash
echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666"' | sudo tee /etc/udev/rules.d/99-kvm.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```

### Install Firecracker

```bash
FC_VERSION=v1.12.0
curl -fsSL https://github.com/firecracker-microvm/firecracker/releases/download/${FC_VERSION}/firecracker-${FC_VERSION}-x86_64.tgz \
  | sudo tar xz -C /tmp
sudo mv /tmp/release-${FC_VERSION}-x86_64/firecracker-${FC_VERSION}-x86_64 /usr/local/bin/firecracker
sudo mv /tmp/release-${FC_VERSION}-x86_64/jailer-${FC_VERSION}-x86_64 /usr/local/bin/jailer
```

---

## Phase 1: Build Rootfs

Build an ext4 root filesystem containing Ubuntu 24.04, Docker CE, kind, kubectl, helm, and SSH.

### 1.1 Extract Host Kernel

Firecracker's minimal kernel lacks modules needed for Docker (overlay, br_netfilter, veth, etc.). Use the host kernel instead:

```bash
KVER=$(uname -r)
curl -fsSL https://raw.githubusercontent.com/torvalds/linux/master/scripts/extract-vmlinux \
  -o /tmp/extract-vmlinux
chmod +x /tmp/extract-vmlinux
sudo /tmp/extract-vmlinux /boot/vmlinuz-$KVER > /tmp/vmlinux
```

### 1.2 Build Rootfs via Docker

```bash
docker run --name rootfs-builder -d ubuntu:24.04 sleep 3600
docker exec rootfs-builder bash -c "
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl iptables iproute2 kmod systemd dbus udev openssh-server
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  curl -Lo /usr/local/bin/kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64 && chmod +x /usr/local/bin/kind
  curl -LO https://dl.k8s.io/release/v1.32.0/bin/linux/amd64/kubectl && chmod +x kubectl && mv kubectl /usr/local/bin/
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  mkdir -p /root/.ssh
  echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config
  echo 'root:firecracker' | chpasswd
  systemctl enable ssh
  apt-get clean && rm -rf /var/lib/apt/lists/*
"
```

### 1.3 Create ext4 Image

```bash
dd if=/dev/zero of=/tmp/rootfs.ext4 bs=1M count=10240
mkfs.ext4 /tmp/rootfs.ext4
sudo mkdir -p /tmp/rootfs_mnt
sudo mount /tmp/rootfs.ext4 /tmp/rootfs_mnt
docker export rootfs-builder | sudo tar x -C /tmp/rootfs_mnt
```

### 1.4 Copy Host Kernel Modules

```bash
sudo mkdir -p /tmp/rootfs_mnt/lib/modules/
sudo cp -r /lib/modules/$KVER /tmp/rootfs_mnt/lib/modules/
```

### 1.5 Create systemd Services

**firecracker-init.service** — loads kernel modules and configures networking:

```bash
sudo tee /tmp/rootfs_mnt/etc/systemd/system/firecracker-init.service <<'EOF'
[Unit]
Description=Firecracker Init (load modules + configure network)
Before=docker.service containerd.service
After=systemd-modules-load.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash -c 'modprobe overlay || true; modprobe br_netfilter || true; modprobe iptable_nat || true; modprobe iptable_filter || true; modprobe veth || true; modprobe nf_conntrack || true; ip addr add 172.16.0.2/24 dev eth0; ip link set eth0 up; ip route add default via 172.16.0.1; echo "nameserver 8.8.8.8" > /etc/resolv.conf'

[Install]
WantedBy=multi-user.target
EOF
sudo chroot /tmp/rootfs_mnt systemctl enable firecracker-init.service
```

**auto-kind.sh** — creates kind cluster (standalone script to avoid systemd `%` escaping issues):

```bash
sudo tee /tmp/rootfs_mnt/usr/local/bin/auto-kind.sh <<'EOF'
#!/bin/bash
set -x
echo "=== Waiting for Docker socket ==="
for i in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then
    echo "Docker ready after ${i}s"
    break
  fi
  sleep 1
done
echo "=== Creating kind cluster ==="
KIND_START=$(date +%s%3N)
kind create cluster --name fc-test --wait 120s 2>&1
KIND_RC=$?
KIND_END=$(date +%s%3N)
echo "=== kind create time: $((KIND_END - KIND_START))ms ==="
echo "=== kind exit code: $KIND_RC ==="
kubectl get nodes 2>&1
kind export kubeconfig --name fc-test --kubeconfig /etc/kind-kubeconfig
chmod 644 /etc/kind-kubeconfig
echo "=== STEP3_COMPLETE ==="
EOF
sudo chmod +x /tmp/rootfs_mnt/usr/local/bin/auto-kind.sh

sudo tee /tmp/rootfs_mnt/etc/systemd/system/auto-kind.service <<'EOF'
[Unit]
Description=Auto create kind cluster
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
StandardOutput=journal+console
StandardError=journal+console
ExecStart=/usr/local/bin/auto-kind.sh

[Install]
WantedBy=multi-user.target
EOF
sudo chroot /tmp/rootfs_mnt systemctl enable auto-kind.service
```

### 1.6 Finalize

```bash
sudo ln -sf /lib/systemd/systemd /tmp/rootfs_mnt/sbin/init 2>/dev/null || true
sudo umount /tmp/rootfs_mnt
```

---

## Phase 2: Host Networking

Create a TAP interface for VM-to-host communication with NAT for internet access:

```bash
sudo ip tuntap add tap0 mode tap
sudo ip addr add 172.16.0.1/24 dev tap0
sudo ip link set tap0 up
sudo sh -c "echo 1 > /proc/sys/net/ipv4/ip_forward"
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
sudo iptables -A FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
sudo iptables -A FORWARD -i tap0 -o eth0 -j ACCEPT
```

---

## Phase 3: Boot VM and Provision

### 3.1 Start Firecracker

```bash
rm -f /tmp/firecracker.sock
firecracker --api-sock /tmp/firecracker.sock --id fc-snap 2>&1 &
FC_PID=$!
sleep 0.5
```

### 3.2 Configure VM via API

```bash
# Boot source (host kernel)
curl -s --unix-socket /tmp/firecracker.sock -X PUT http://localhost/boot-source \
  -H "Content-Type: application/json" \
  -d '{
    "kernel_image_path": "/tmp/vmlinux",
    "boot_args": "console=ttyS0 reboot=k panic=1 init=/sbin/init systemd.unified_cgroup_hierarchy=1"
  }'

# Root drive
curl -s --unix-socket /tmp/firecracker.sock -X PUT http://localhost/drives/rootfs \
  -H "Content-Type: application/json" \
  -d '{
    "drive_id": "rootfs",
    "path_on_host": "/tmp/rootfs.ext4",
    "is_root_device": true,
    "is_read_only": false
  }'

# Machine config
curl -s --unix-socket /tmp/firecracker.sock -X PUT http://localhost/machine-config \
  -H "Content-Type: application/json" \
  -d '{"vcpu_count": 2, "mem_size_mib": 6144}'

# Network interface
curl -s --unix-socket /tmp/firecracker.sock -X PUT http://localhost/network-interfaces/eth0 \
  -H "Content-Type: application/json" \
  -d '{
    "iface_id": "eth0",
    "guest_mac": "AA:FC:00:00:00:01",
    "host_dev_name": "tap0"
  }'

# Start VM
curl -s --unix-socket /tmp/firecracker.sock -X PUT http://localhost/actions \
  -H "Content-Type: application/json" \
  -d '{"action_type": "InstanceStart"}'
```

### 3.3 Wait for Cluster

```bash
# Wait for kind cluster to be ready (~42s from boot)
SSH="sshpass -p firecracker ssh -n -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@172.16.0.2"

for i in $(seq 1 120); do
  if $SSH "KUBECONFIG=/etc/kind-kubeconfig kubectl get nodes" 2>/dev/null | grep -q Ready; then
    echo "Cluster ready after ${i}s"
    break
  fi
  sleep 1
done
```

### 3.4 Install cert-manager (optional, pre-snapshot)

```bash
$SSH "KUBECONFIG=/etc/kind-kubeconfig helm repo add jetstack https://charts.jetstack.io --force-update 2>&1"
$SSH "KUBECONFIG=/etc/kind-kubeconfig helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace --version v1.17.2 \
  --set crds.enabled=true --wait --timeout 180s 2>&1"
```

---

## Phase 4: Create Snapshot

```bash
# Pause VM
curl -s --unix-socket /tmp/firecracker.sock -X PATCH http://localhost/vm \
  -H "Content-Type: application/json" \
  -d '{"state": "Paused"}'

# Create snapshot
mkdir -p /tmp/fc-snapshot
curl -s --unix-socket /tmp/firecracker.sock -X PUT http://localhost/snapshot/create \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_type": "Full",
    "snapshot_path": "/tmp/fc-snapshot/vmstate",
    "mem_file_path": "/tmp/fc-snapshot/mem"
  }'
```

---

## Phase 5: Restore from Snapshot

```bash
# Copy rootfs (each restored VM needs its own)
cp /tmp/rootfs.ext4 /tmp/rootfs-restored.ext4

# Start new Firecracker process
rm -f /tmp/firecracker-restore.sock
firecracker --api-sock /tmp/firecracker-restore.sock --id fc-restored 2>&1 &
FC_RESTORE_PID=$!
sleep 0.5

# Load snapshot (resume_vm: true starts the VM immediately)
curl -s --unix-socket /tmp/firecracker-restore.sock -X PUT http://localhost/snapshot/load \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_path": "/tmp/fc-snapshot/vmstate",
    "mem_backend": {
      "backend_type": "File",
      "backend_path": "/tmp/fc-snapshot/mem"
    },
    "enable_diff_snapshots": false,
    "resume_vm": true
  }'
```

The VM is now running with the full kind cluster and cert-manager intact. SSH is available within ~1.7s.

---

## Phase 6: Parallel VMs (Validated)

**Status**: Validated on GitHub Actions `ubuntu-latest` — 3 VMs from same snapshot, all fully functional.

### Parallel VM Benchmark Results

| Metric | Value |
|--------|-------|
| **Parallel VM start** (3 VMs, incl. rootfs copy) | **25.3s** |
| **All VMs SSH-ready** | **3.2s** (after snapshot load) |
| **API server ready** (per VM) | **~3s** (first attempt) |
| **Snapshot load per VM** | **210–226ms** (contention from parallel reads) |
| All pods Running per VM | 12/12 (kube-system 9 + cert-manager 3) |
| Pre-snapshot cert preserved | Yes |
| Post-restore new cert issued | Yes (6s) |
| VM isolation | Confirmed (unique ConfigMaps per VM) |

### The IP Address Problem

The snapshot contains a baked-in guest IP (172.16.0.2). Multiple VMs from the same snapshot all have this same IP, so they cannot share a network namespace on the host.

### Solution: Network Namespaces

Each VM runs inside its own Linux network namespace. Each namespace has an independent `tap0` at `172.16.0.1/24`, so the guest IP `172.16.0.2` works without modification.

```
┌──────────────────────────────────────────────────────────────┐
│  Host                                                        │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  netns: vm1  │  │  netns: vm2  │  │  netns: vm3  │         │
│  │             │  │             │  │             │          │
│  │  tap0       │  │  tap0       │  │  tap0       │          │
│  │  172.16.0.1 │  │  172.16.0.1 │  │  172.16.0.1 │          │
│  │      │      │  │      │      │  │      │      │          │
│  │  firecracker│  │  firecracker│  │  firecracker│          │
│  │      │      │  │      │      │  │      │      │          │
│  │  ┌───▼───┐  │  │  ┌───▼───┐  │  │  ┌───▼───┐  │          │
│  │  │microVM│  │  │  │microVM│  │  │  │microVM│  │          │
│  │  │.0.2   │  │  │  │.0.2   │  │  │  │.0.2   │  │          │
│  │  └───────┘  │  │  └───────┘  │  │  └───────┘  │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└──────────────────────────────────────────────────────────────┘
```

### Per-VM Setup

```bash
setup_vm() {
  local N=$1  # VM number (1, 2, 3, ...)

  # Create network namespace
  ip netns add vm${N}

  # Create TAP inside namespace
  ip netns exec vm${N} ip tuntap add tap0 mode tap
  ip netns exec vm${N} ip addr add 172.16.0.1/24 dev tap0
  ip netns exec vm${N} ip link set tap0 up
  ip netns exec vm${N} ip link set lo up

  # NAT for internet access (optional, requires veth pair to host)
  # For basic testing, skip internet — cluster is already provisioned

  # Copy rootfs
  cp /tmp/rootfs.ext4 /tmp/rootfs-vm${N}.ext4

  # Start Firecracker inside namespace
  ip netns exec vm${N} firecracker \
    --api-sock /tmp/fc-${N}.sock \
    --id fc-vm${N} &

  sleep 0.5

  # Load snapshot
  ip netns exec vm${N} curl -s --unix-socket /tmp/fc-${N}.sock \
    -X PUT http://localhost/snapshot/load \
    -H "Content-Type: application/json" \
    -d "{
      \"snapshot_path\": \"/tmp/fc-snapshot/vmstate\",
      \"mem_backend\": {
        \"backend_type\": \"File\",
        \"backend_path\": \"/tmp/fc-snapshot/mem\"
      },
      \"enable_diff_snapshots\": false,
      \"resume_vm\": true
    }"
}
```

### SSH Access

```bash
# SSH into VM N from host
ip netns exec vm${N} sshpass -p firecracker ssh -n \
  -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@172.16.0.2
```

### Resource Requirements

| Resource | Per VM | 3 VMs |
|----------|--------|-------|
| vCPU | 2 (shared) | 6 (shared) |
| Memory | 4096 MiB | 12 GiB |
| Rootfs | 10 GB | 30 GB |
| Snapshot (shared) | — | 6 GB mem + 29 KB vmstate |

For 3 VMs on a 16 GB runner, reduce per-VM memory to 4096 MiB (12 GB total).

Note: On a 7 GB runner (`ubuntu-latest`), 3 VMs x 4 GiB = 12 GiB exceeds physical RAM but works because Firecracker uses demand-paging from the snapshot memory file — not all 4 GiB is resident at once.

### Parallel Performance Notes

- **Snapshot load is slower under contention**: Single VM loads in 18ms; 3 parallel VMs load in ~210-226ms each (12x slower due to disk I/O contention reading the 4 GB mem file simultaneously).
- **Rootfs copy dominates startup time**: The 25s parallel start time is mostly `cp` of the 10 GB rootfs per VM. Using `cp --reflink=auto` on a filesystem with reflink support (XFS, Btrfs) would reduce this to near-zero.
- **API server needs ~3s to stabilize**: After snapshot restore, the Kubernetes API server needs a few seconds before TLS handshakes succeed. The first `kubectl` attempt may fail with "TLS handshake timeout" — always retry.
- **All 3 VMs passed full verification on first attempt**: nodes Ready, all 12 pods Running, pre-snapshot resources preserved, new certificates issued, cross-VM isolation confirmed.

---

## Gotchas and Troubleshooting

### 1. Host kernel modules MUST be in rootfs

Firecracker uses the host kernel but the rootfs must contain `/lib/modules/$KVER`. Without them, Docker fails because `overlay`, `br_netfilter`, `veth`, `nf_conntrack`, `iptable_nat`, `iptable_filter` modules cannot be loaded.

**Fix**: `sudo cp -r /lib/modules/$KVER /tmp/rootfs_mnt/lib/modules/`

### 2. systemd `%` escaping in ExecStart

Inline bash in systemd `ExecStart=` fails if it contains `%` characters. For example, `date +%s%3N` — systemd interprets `%s` as the service name and `%3N` as an invalid specifier.

**Fix**: Move bash logic to a standalone script file, reference via `ExecStart=/path/to/script.sh`.

### 3. SSH `-n` flag when piping to bash

When running scripts via `echo ... | base64 -d | bash`, SSH commands consume stdin (the rest of the script), causing the host script to terminate silently after the first SSH command.

**Fix**: Always use `ssh -n` to prevent SSH from reading stdin.

### 4. Firecracker minimal kernel lacks Docker modules

The kernel from `s3.amazonaws.com/spec.ccfc.min/` is too minimal for Docker/kind.

**Fix**: Extract the host kernel using `extract-vmlinux` from the Linux source tree.

### 5. Memory pressure on GitHub Actions runners

A VM with 6 GB RAM on a 7 GB runner causes OOM issues. The host script may be silently killed with no error output.

**Fix**: Reduce VM memory or stop host Docker daemon after rootfs build (`sudo systemctl stop docker`).

### 6. Rootfs sizing

| Use Case | Size |
|----------|------|
| Alpine only (no Docker) | 512 MB |
| Docker CE | 4 GB |
| Docker + kernel modules | 8 GB |
| Docker + kind + images | 10 GB |

---

## Reproduction Steps

### Quick Reproduction (Parallel VM Test)

The following commands reproduce the entire parallel VM test on GitHub Actions:

```bash
# 1. Fetch and review the script from gist
curl -fsSL https://gist.githubusercontent.com/suin/b759cb641c51404e821354abdf2fdb6b/raw/fc-step5-parallel.sh

# 2. Dispatch to GitHub Actions
gh workflow run exec.yml \
  --repo suinplayground/github-action-exec \
  -f runner=ubuntu-latest \
  -f 'command=curl -fsSL https://gist.githubusercontent.com/suin/b759cb641c51404e821354abdf2fdb6b/raw/fc-step5-parallel.sh | bash'

# 3. Check results (~5 minutes)
gh run list --workflow=exec.yml --repo suinplayground/github-action-exec --limit 1
gh run view <RUN_ID> --repo suinplayground/github-action-exec --log
```

### What the Script Does (End-to-End Flow)

```
Phase 0: Prerequisites (~30s)
  ├── Enable KVM on runner
  ├── Install Firecracker v1.12.0
  ├── Install sshpass
  └── Extract host kernel (vmlinux)

Phase 1: Build Rootfs (~90s)
  ├── Docker container with Ubuntu 24.04 + Docker CE + kind + kubectl + helm + SSH
  ├── Export to 10 GB ext4 image
  ├── Copy host kernel modules into rootfs
  ├── Create systemd services (firecracker-init, auto-kind)
  └── Stop host Docker (free memory)

Phase 2: Boot VM + Provision + Snapshot (~120s)
  ├── Create TAP networking (172.16.0.1/24 <-> 172.16.0.2/24)
  ├── Boot Firecracker VM (4096 MiB RAM, 2 vCPU)
  ├── Wait for kind cluster Ready (~42s)
  ├── Install cert-manager via Helm (~20s)
  ├── Create test ClusterIssuer + Certificate
  ├── Pause VM -> Create snapshot
  └── Kill original VM

Phase 3: Parallel VM Startup (~25s)
  ├── Create 3 network namespaces (vm1, vm2, vm3)
  ├── Per namespace: TAP + rootfs copy + Firecracker + snapshot load
  └── All 3 VMs running simultaneously

Phase 4: SSH Wait (~3s)
  └── All 3 VMs SSH-ready in parallel

Phase 5: Verification (~45s)
  ├── Per VM: wait for API server (~3s)
  ├── Per VM: check node Ready, all 12 pods Running
  ├── Per VM: verify pre-snapshot Certificate preserved
  ├── Per VM: create unique ConfigMap (isolation test)
  ├── Per VM: create new Certificate (cert-manager functionality)
  └── Per VM: verify only own ConfigMap exists (cross-VM isolation)
```

### Validated Parallel VM Results (Run 22712050097)

The following results were extracted from actual GitHub Actions logs:

```
=== All VMs started in 25349ms ===
[VM1] SSH ready after 3834ms
[VM2] SSH ready after 4035ms
[VM3] SSH ready after 3933ms
=== All VMs SSH-ready in 3238ms ===   <- wait runs in parallel

[VM1] API server ready after 3051ms (attempt 1)  <- no retry needed
[VM2] API server ready after 3051ms (attempt 1)
[VM3] API server ready after 3051ms (attempt 1)

VM1: fc-test-control-plane  Ready  control-plane  2m27s  v1.35.1
VM2: fc-test-control-plane  Ready  control-plane  2m27s  v1.35.1
VM3: fc-test-control-plane  Ready  control-plane  2m27s  v1.35.1

VM1: 12/12 pods Running (kube-system 9 + cert-manager 3)
VM2: 12/12 pods Running
VM3: 12/12 pods Running

VM1: pre-snapshot-cert   True  (preserved from snapshot)
VM2: pre-snapshot-cert   True
VM3: pre-snapshot-cert   True

VM1: post-restore-cert-vm1  True  (new cert issued post-restore, 6s)
VM2: post-restore-cert-vm2  True
VM3: post-restore-cert-vm3  True

VM1 ConfigMaps: kube-root-ca.crt, vm1-marker  <- no vm2/vm3 markers
VM2 ConfigMaps: kube-root-ca.crt, vm2-marker  <- full isolation confirmed
VM3 ConfigMaps: kube-root-ca.crt, vm3-marker

Total time: 309183ms (~5m9s)
```

### Single VM Reproduction (Simpler)

To verify single-VM snapshot restore only (without parallel test), simply execute the Phase 1 through Phase 5 commands in this document sequentially from top to bottom.

---

## Firecracker API Reference

| API Endpoint | Method | Purpose |
|-------------|--------|---------|
| `/boot-source` | PUT | Set kernel image path and boot args |
| `/drives/{id}` | PUT | Attach block device |
| `/machine-config` | PUT | Set vCPU count and memory |
| `/network-interfaces/{id}` | PUT | Attach TAP network device |
| `/actions` | PUT | `InstanceStart` to boot |
| `/vm` | PATCH | `Paused` / `Resumed` state changes |
| `/snapshot/create` | PUT | Create snapshot (vmstate + mem files) |
| `/snapshot/load` | PUT | Load snapshot with optional `resume_vm` |

---

## Post-Restore Verification Results

### Single VM (Run 22704981588)

Comprehensive verification after snapshot restore (cert-manager pre-installed):

| Verification | Result |
|-------------|--------|
| Node status | Ready (v1.35.1) |
| All kube-system pods | Running (9/9) |
| cert-manager pods | Running (3/3) |
| Existing ClusterIssuer | Preserved, True |
| Existing Certificate | Preserved, Ready |
| **Create NEW Certificate** | **Ready after 1s** |
| **Create nginx Deployment (2 replicas)** | **Rollout success, 2/2 Running** |
| Docker inside VM | Running normally |

### Parallel VMs (Run 22712050097)

| Verification | VM1 | VM2 | VM3 |
|-------------|-----|-----|-----|
| Node Ready | v1.35.1 | v1.35.1 | v1.35.1 |
| All pods Running | 12/12 | 12/12 | 12/12 |
| Pre-snapshot cert preserved | True | True | True |
| New cert issued post-restore | True (6s) | True (6s) | True (6s) |
| Unique ConfigMap created | vm1-marker | vm2-marker | vm3-marker |
| Cross-VM isolation | No other VM markers | No other VM markers | No other VM markers |

This proves Firecracker snapshot restore preserves full Kubernetes cluster state including control plane, networking, installed Helm charts with webhooks and CRDs, and the ability to create new resources and schedule new workloads — both in single VM and parallel multi-VM configurations.

---

## Integration with kest — Outlook

### Current kest Architecture

kest's `useCluster` API already supports multiple cluster reference methods:

```typescript
// 1. Static reference (existing kubeconfig/context)
const c = await s.useCluster({ context: "kind-kind" });

// 2. CAPI cluster resource reference
const c = await s.useCluster({
  apiVersion: "cluster.x-k8s.io/v1beta1",
  kind: "Cluster",
  name: "workload-1",
  namespace: "default",
});
```

`ClusterReference` is a union type (`StaticClusterReference | ClusterResourceReference`), and the documentation explicitly states it "leaves room for additional providers in the future." Firecracker fits naturally into this extension point.

### Integration Approach

#### Phase A: Extend ClusterReference

```typescript
// Add new Firecracker cluster reference to ClusterReference
export interface FirecrackerClusterReference {
  readonly provider: "firecracker";
  /** Path to snapshot directory */
  readonly snapshotDir: string;
  /** Path to rootfs image (defaults to same directory as snapshot) */
  readonly rootfs?: string;
  /** VM memory in MiB (default: 4096) */
  readonly memSizeMib?: number;
  /** Number of vCPUs (default: 2) */
  readonly vcpuCount?: number;
}

export type ClusterReference =
  | StaticClusterReference
  | ClusterResourceReference
  | FirecrackerClusterReference;  // <- added

// Usage
const c = await s.useCluster({
  provider: "firecracker",
  snapshotDir: "/tmp/fc-snapshot",
});
```

#### Phase B: VM Lifecycle Management

Add `FirecrackerClusterProvider` as an internal implementation of `useCluster`:

```
useCluster({ provider: "firecracker", ... })
  |
  ├── 1. Create network namespace (ip netns add)
  ├── 2. Create TAP interface (ip tuntap add)
  ├── 3. Copy rootfs (cp --reflink=auto)
  ├── 4. Start Firecracker process (ip netns exec)
  ├── 5. Load snapshot (/snapshot/load API)
  ├── 6. Wait for SSH (~3s)
  ├── 7. Extract kubeconfig (SSH -> cat /etc/kind-kubeconfig)
  ├── 8. Set up SSH port forwarding
  ├── 9. Rewrite kubeconfig server URL to localhost:PORT
  └── 10. Return Cluster handle
          |
          └── On cleanup (LIFO Reverting):
              ├── Kill Firecracker process
              ├── Delete network namespace
              └── Delete rootfs file
```

This fits perfectly with kest's existing **LIFO cleanup** (`Reverting`). VM teardown is registered with `Reverting`, so cleanup happens automatically even on test failure.

#### Phase C: Golden Image Build Tool

```bash
# Build golden image with kest CLI
kest snapshot build \
  --helm cert-manager=jetstack/cert-manager:v1.17.2 \
  --helm ingress-nginx=ingress-nginx/ingress-nginx:4.12.0 \
  --output ./snapshots/full-stack/
```

The build process automates Phase 1 through Phase 4 of this document.

### Example Test Code

```typescript
import { scenario } from "@appthrust/kest";

scenario("cert-manager Certificate issuance", async (s) => {
  // Get cluster from Firecracker snapshot in ~3s
  // cert-manager is pre-installed
  const cluster = await s.useCluster({
    provider: "firecracker",
    snapshotDir: "./snapshots/cert-manager",
  });

  // Test: create a new Certificate
  await cluster.apply({
    apiVersion: "cert-manager.io/v1",
    kind: "Certificate",
    metadata: { name: "test-cert", namespace: "default" },
    spec: {
      secretName: "test-cert-tls",
      issuerRef: { name: "selfsigned-issuer", kind: "ClusterIssuer" },
      commonName: "test.example.com",
    },
  });

  // Verify cert-manager generated the Secret
  await cluster.assert({
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name: "test-cert-tls", namespace: "default" },
  });
});
```

### Parallel Test Execution

Each kest `scenario()` gets its own independent VM, so parallel test execution directly translates to parallel cluster execution:

```
bun test --concurrency 3 ts/e2e/
  |
  ├── scenario A -> useCluster -> VM1 (netns vm1, tap0, 172.16.0.2)
  ├── scenario B -> useCluster -> VM2 (netns vm2, tap0, 172.16.0.2)
  └── scenario C -> useCluster -> VM3 (netns vm3, tap0, 172.16.0.2)
```

Each VM has its own fully independent kernel, Docker, and Kubernetes, enabling testing of **cluster-scoped resources (CRDs, ClusterRoles, webhooks)** that namespace isolation cannot support.

### Implementation Challenges and Solutions

| Challenge | Severity | Solution |
|-----------|----------|----------|
| `sudo` required (netns, TAP) | High | No issue in CI. Local dev falls back to Lima/Docker Desktop |
| Linux-only (KVM required) | Medium | macOS falls back to Lima APFS clone (21s). `ClusterReference` abstraction switches transparently |
| Rootfs copy is slow (10GB, ~8s) | Medium | `cp --reflink=auto` (near-zero on XFS/Btrfs). Future: overlayfs for diffs only |
| Snapshot is large (4-6GB mem) | Medium | Exceeds GitHub Actions 10GB cache limit. Store as Docker image in container registry, or use GCS/S3 |
| API server TLS stabilization (~3s) | Low | Retry inside `useCluster`. Transparent to callers |
| Firecracker snapshots are DevPreview | Low | Acceptable for test environments, not production |

### Roadmap

```
v1: StaticClusterReference (current) <- we are here
v2: CapiClusterResourceReference (current, implemented in #9)
v3: FirecrackerClusterReference <- next step
    ├── Auto-install Firecracker binary
    ├── Rootfs builder (kest snapshot build)
    ├── Network namespace lifecycle management
    ├── SSH port forwarding + kubeconfig rewriting
    └── macOS fallback (Lima APFS clone)
v4: Golden Image CI Pipeline
    ├── CI build for rootfs + snapshot
    ├── Cache via container registry
    └── Customizable Helm chart pre-installation
```

### Expected Impact

| Metric | Current (kind create) | After Firecracker Integration |
|--------|----------------------|-------------------------------|
| Cluster acquisition time | 39-43s (bare) / 60-253s (with charts) | **~3s** (SSH ready) |
| Test parallelism | Unlimited (namespace) / 1 (cluster-scoped) | **3+ VMs** (cluster-scoped OK) |
| Cluster-scoped resource testing | Not possible (namespace isolation) | **Fully supported** |
| Scenarios per CI job | ~5 (time-constrained) | **50+** (3s/scenario) |
| Cross-test interference | Yes (cluster-scoped) | **None** (VM isolation) |

---

## CI Setup

### GitHub Actions Workflow Fragment

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Enable KVM
        run: |
          echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666"' | sudo tee /etc/udev/rules.d/99-kvm.rules
          sudo udevadm control --reload-rules && sudo udevadm trigger

      - name: Install Firecracker
        run: |
          FC_VERSION=v1.12.0
          curl -fsSL https://github.com/firecracker-microvm/firecracker/releases/download/${FC_VERSION}/firecracker-${FC_VERSION}-x86_64.tgz \
            | sudo tar xz -C /tmp
          sudo mv /tmp/release-${FC_VERSION}-x86_64/firecracker-${FC_VERSION}-x86_64 /usr/local/bin/firecracker
          sudo mv /tmp/release-${FC_VERSION}-x86_64/jailer-${FC_VERSION}-x86_64 /usr/local/bin/jailer

      - name: Cache rootfs + snapshot
        uses: actions/cache@v4
        with:
          path: |
            /tmp/rootfs.ext4
            /tmp/fc-snapshot/
            /tmp/vmlinux
          key: fc-rootfs-${{ hashFiles('scripts/build-rootfs.sh') }}

      - name: Build rootfs (if not cached)
        if: steps.cache.outputs.cache-hit != 'true'
        run: ./scripts/build-rootfs.sh

      - name: Run E2E tests
        run: bun test ts/
```

### Caching Strategy

| Artifact | Size | Cache Key |
|----------|------|-----------|
| `rootfs.ext4` | 10 GB | Hash of build script |
| `fc-snapshot/mem` | 4-6 GB | Hash of rootfs + provisioning script |
| `fc-snapshot/vmstate` | 29 KB | Same as mem |
| `vmlinux` | ~30 MB | Kernel version |

Note: GitHub Actions cache limit is 10 GB per repository. The rootfs alone exceeds this. Consider:
- Hosting rootfs on a storage bucket (S3/GCS)
- Building rootfs as a Docker image and caching via container registry
- Using `actions/cache` with compression (zstd reduces 10 GB rootfs to ~2 GB)

---

## Related Documents

- [Lima VM Snapshot Benchmark](./lima-vm-snapshot-benchmark.md) — comparison of Lima APFS clone, QEMU snapshot, and Firecracker approaches
- [CRIU kind Checkpoint Failure](./criu-kind-checkpoint-failure.md) — why CRIU doesn't work for kind clusters
- [CAPI Docker Provider Setup](../knowledge/capi-docker-provider-setup.md) — CAPI integration (another cluster provider for kest)
- [Japanese version of this document](../../refs/firecracker-snapshot-kind-cluster.md)
