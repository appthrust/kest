# Cluster API: Cluster Status Conditions Specification

## Overview

The Cluster API (CAPI) uses `status.conditions` on the `Cluster` resource to provide an "at a glance" view of the cluster's operational state. Conditions follow a structured format with well-defined types, statuses, and severity levels.

CAPI is currently in a transition period between two condition formats:

- **Legacy conditions** (`status.conditions`): CAPI-specific `Condition` type with a `severity` field.
- **V1Beta2 conditions** (`status.v1beta2.conditions`): Standard Kubernetes `metav1.Condition` type (no severity field).

When the v1beta2 API is fully released, `status.v1beta2.conditions` will be promoted to `status.conditions` and the legacy format will be removed.

## Condition Struct (Legacy v1beta1)

Each legacy condition has the following fields:

| Field               | Type              | Required | Description                                                            |
| ------------------- | ----------------- | -------- | ---------------------------------------------------------------------- |
| `type`              | string            | Yes      | Condition name in CamelCase (e.g. `Ready`, `InfrastructureReady`)      |
| `status`            | `True`/`False`/`Unknown` | Yes | Current state                                                   |
| `severity`          | `Error`/`Warning`/`Info`/`""` | No | Set only when `status=False`. Indicates how serious the issue is |
| `lastTransitionTime`| Time              | Yes      | When the status last changed                                           |
| `reason`            | string            | No       | One-word CamelCase reason for the last transition                      |
| `message`           | string            | No       | Human-readable details about the transition                            |

The `severity` field is a CAPI extension not present in the standard Kubernetes `metav1.Condition`.

## Legacy Condition Types (v1beta1)

These are stored in `status.conditions`:

| Condition Type              | Description                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ready`                     | Summary condition for the overall operational state of the Cluster.                                                                           |
| `InfrastructureReady`       | Mirrored from the `Ready` condition of the infrastructure provider object (e.g. AWSCluster, VSphereCluster).                                  |
| `ControlPlaneInitialized`   | True when the control plane is functional enough that the API server is reachable. Once set to True, this value never changes.                 |
| `ControlPlaneReady`         | Mirrored from the `Ready` condition of the control plane object. Reflects the current readiness of the control plane.                         |
| `TopologyReconciled`        | Only present when the Cluster uses a ClusterClass / managed topology. True when `spec.topology` has been applied to managed objects.           |

### Common Reasons

| Reason                                       | Severity | Description                                              |
| -------------------------------------------- | -------- | -------------------------------------------------------- |
| `Deleting`                                   | Info     | Object is being deleted                                  |
| `DeletionFailed`                             | Warning  | Deletion encountered problems (reconciler will retry)    |
| `Deleted`                                    | Info     | Object was deleted                                       |
| `MissingNodeRef`                             | Info     | Waiting for a control plane Machine to have a node ref   |
| `WaitingForControlPlaneProviderInitialized`  | Info     | Waiting for control plane provider initialization        |
| `WaitingForInfrastructure`                   | Info     | Fallback reason when infra object has no Ready condition |
| `WaitingForControlPlane`                     | Info     | Fallback reason when CP object has no Ready condition    |
| `TopologyReconcileFailed`                    | Error    | Topology reconciliation failed                           |
| `ControlPlaneUpgradePending`                 | Info     | Control plane not yet updated to desired topology spec   |
| `MachineDeploymentsUpgradePending`           | Info     | MachineDeployments not yet updated                       |
| `LifecycleHookBlocking`                      | Info     | A lifecycle hook is blocking reconciliation              |

## V1Beta2 Condition Types

These are stored in `status.v1beta2.conditions` and use the standard `metav1.Condition` type:

| Condition Type            | Description                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `Available`               | True if the Cluster is not deleted and critical conditions are met.                              |
| `InfrastructureReady`     | Mirrors the infrastructure provider's Ready condition.                                          |
| `ControlPlaneInitialized` | True when the control plane is functional enough to accept requests.                            |
| `ControlPlaneAvailable`   | Mirrors the control plane provider's Available condition.                                       |
| `WorkersAvailable`        | Summary of MachineDeployment and MachinePool Available conditions.                              |
| `MachinesReady`           | Aggregate of controlled machines' Ready conditions.                                             |
| `MachinesUpToDate`        | Whether controlled machines are up-to-date with the desired spec.                               |
| `RemoteConnectionProbe`   | True when the workload cluster's control plane is reachable.                                    |
| `ScalingUp`               | Whether the cluster is currently scaling up.                                                    |
| `ScalingDown`             | Whether the cluster is currently scaling down.                                                  |
| `Remediating`             | Whether remediation of machines is in progress.                                                 |
| `Deleting`                | Whether the cluster is being deleted, with progress details.                                    |
| `Paused`                  | Whether reconciliation is paused for the cluster.                                               |
| `TopologyReconciled`      | Only added if the Cluster references a ClusterClass / managed topology.                         |

## ClusterStatus Structure

```go
type ClusterStatus struct {
    FailureDomains      FailureDomains           // Failure domains synced from infra provider
    FailureReason       *ClusterStatusError       // Fatal error code (deprecated)
    FailureMessage      *string                   // Fatal error message (deprecated)
    Phase               string                    // Pending|Provisioning|Provisioned|Deleting|Failed|Unknown
    InfrastructureReady bool                      // Infrastructure provider ready state
    ControlPlaneReady   bool                      // CP ready state at initial provisioning (never updated after)
    Conditions          Conditions                // Legacy conditions (v1beta1)
    ObservedGeneration  int64                     // Last observed generation
    V1Beta2             *ClusterV1Beta2Status     // V1Beta2 conditions and replica counts
}

type ClusterV1Beta2Status struct {
    Conditions   []metav1.Condition         // V1Beta2 conditions (standard K8s format)
    ControlPlane *ClusterControlPlaneStatus // CP replica counts
    Workers      *WorkersStatus             // Worker replica counts
}
```

## Design Principles

1. **Ready is a summary condition**: A Cluster cannot be `Ready=True` if any dependent object (infra, control plane) is `Ready=False`.
2. **Mirroring**: `InfrastructureReady` and `ControlPlaneReady` mirror the `Ready` condition from the referenced external objects.
3. **ControlPlaneInitialized is one-way**: Once set to `True`, it never reverts. Use `ControlPlaneReady` (legacy) or `ControlPlaneAvailable` (v1beta2) to check current state.
4. **Severity classifies urgency** (legacy only): `Error` > `Warning` > `Info`. Only set when `status=False`.
5. **Provider-agnostic**: Core Cluster conditions are provider-agnostic. Provider-specific details live on the provider's own objects.

## References

- [Cluster API v1beta1 Go Package](https://pkg.go.dev/sigs.k8s.io/cluster-api/api/v1beta1)
- [Conditions Proposal](https://github.com/kubernetes-sigs/cluster-api/blob/main/docs/proposals/20200506-conditions.md)
- [Source: cluster_types.go](https://github.com/kubernetes-sigs/cluster-api/blob/main/api/core/v1beta1/cluster_types.go)
- [Source: condition_types.go](https://github.com/kubernetes-sigs/cluster-api/blob/main/api/core/v1beta1/condition_types.go)
- [Source: condition_consts.go](https://github.com/kubernetes-sigs/cluster-api/blob/main/api/core/v1beta1/condition_consts.go)
- [Source: v1beta2_condition_consts.go](https://github.com/kubernetes-sigs/cluster-api/blob/main/api/core/v1beta1/v1beta2_condition_consts.go)
