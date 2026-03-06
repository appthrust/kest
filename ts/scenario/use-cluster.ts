import { mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { apply } from "../actions/apply";
import { applyStatus } from "../actions/apply-status";
import { assert } from "../actions/assert";
import { assertAbsence } from "../actions/assert-absence";
import { assertApplyError } from "../actions/assert-apply-error";
import { assertCreateError } from "../actions/assert-create-error";
import { assertList } from "../actions/assert-list";
import { assertOne } from "../actions/assert-one";
import { create } from "../actions/create";
import { deleteResource } from "../actions/delete";
import { get } from "../actions/get";
import { label } from "../actions/label";
import type {
  ActionOptions,
  Cluster,
  ClusterReference,
  ClusterResourceReference,
} from "../apis";
import { retryUntil } from "../retry";
import { parseYaml } from "../yaml";
import {
  type CreateScenarioOptions,
  createMutateFn,
  createNewNamespaceFn,
  createOneWayMutateFn,
  createQueryFn,
  createUseNamespaceFn,
} from "./index";

function isClusterResourceReference(
  ref: ClusterReference
): ref is ClusterResourceReference {
  return (
    "apiVersion" in ref &&
    "kind" in ref &&
    (ref as unknown as Record<string, unknown>)["kind"] === "Cluster"
  );
}

/**
 * Builds a {@link Cluster} object with all action methods wired to the given deps.
 */
export function buildClusterSurface(deps: CreateScenarioOptions): Cluster {
  return {
    apply: createMutateFn(deps, apply),
    create: createMutateFn(deps, create),
    assertApplyError: createMutateFn(deps, assertApplyError),
    assertCreateError: createMutateFn(deps, assertCreateError),
    applyStatus: createOneWayMutateFn(deps, applyStatus),
    delete: createOneWayMutateFn(deps, deleteResource),
    label: createOneWayMutateFn(deps, label),
    get: createQueryFn(deps, get),
    assert: createQueryFn(deps, assert),
    assertAbsence: createQueryFn(deps, assertAbsence),
    assertList: createQueryFn(deps, assertList),
    assertOne: createQueryFn(deps, assertOne),
    newNamespace: createNewNamespaceFn(deps),
    useNamespace: createUseNamespaceFn(deps),
    useCluster: (
      cluster: ClusterReference,
      options?: ActionOptions
    ): Promise<Cluster> => {
      return resolveCluster(deps, cluster, options);
    },
  };
}

/**
 * Resolves a {@link ClusterReference} to a fully-wired {@link Cluster} surface.
 *
 * - For {@link StaticClusterReference}: extends kubectl with context/kubeconfig.
 * - For {@link ClusterResourceReference}: polls CAPI until the cluster is ready,
 *   fetches the kubeconfig secret, writes a temp file, and returns a Cluster
 *   bound to that kubeconfig.
 */
export async function resolveCluster(
  deps: CreateScenarioOptions,
  cluster: ClusterReference,
  options?: ActionOptions
): Promise<Cluster> {
  if (!isClusterResourceReference(cluster)) {
    // Static cluster reference — same as the original implementation.
    const clusterKubectl = deps.kubectl.extends({
      context: cluster.context,
      kubeconfig: cluster.kubeconfig,
    });
    return buildClusterSurface({ ...deps, kubectl: clusterKubectl });
  }

  // CAPI cluster resource reference
  const { apiVersion, name, namespace } = cluster;
  const { recorder, kubectl, reverting } = deps;

  const resourceType = `Cluster.${apiVersion.split("/")[1]}.${apiVersion.split("/")[0]}`;
  const description = `useCluster(${apiVersion} Cluster "${name}" in "${namespace}")`;

  recorder.record("ActionStart", { description });

  let actionErr: undefined | Error;
  try {
    // Poll until the CAPI Cluster is ready.
    await retryUntil(
      async () => {
        const yaml = await kubectl.get(resourceType, name, { namespace });
        const resource = parseYaml(yaml) as Record<string, unknown>;
        const status = resource["status"] as
          | Record<string, unknown>
          | undefined;
        if (!status) {
          throw new Error(
            `Cluster "${name}" in "${namespace}" has no status yet`
          );
        }

        const version = apiVersion.split("/")[1]; // "v1beta1" or "v1beta2"
        let conditions: Array<Record<string, unknown>> | undefined;
        let targetType: string;

        if (version === "v1beta1") {
          conditions = status["conditions"] as
            | Array<Record<string, unknown>>
            | undefined;
          targetType = "Ready";
        } else if (version === "v1beta2") {
          const v1beta2 = status["v1beta2"] as
            | Record<string, unknown>
            | undefined;
          conditions = v1beta2?.["conditions"] as
            | Array<Record<string, unknown>>
            | undefined;
          targetType = "Available";
        } else {
          throw new Error(`Unsupported CAPI API version: ${apiVersion}`);
        }

        if (!conditions) {
          throw new Error(
            `Cluster "${name}" in "${namespace}" has no conditions`
          );
        }

        const condition = conditions.find((c) => c["type"] === targetType);
        if (!condition || condition["status"] !== "True") {
          throw new Error(
            `Cluster "${name}" in "${namespace}" is not ready (${targetType} != True)`
          );
        }
      },
      { ...options, recorder }
    );

    // Fetch kubeconfig from the cluster's secret.
    const kubeconfigData = await retryUntil(
      () => kubectl.getSecretData(`${name}-kubeconfig`, "value", { namespace }),
      { timeout: "30s", interval: "1s", recorder }
    );

    // Write kubeconfig to a temp file.
    const dir = `${tmpdir()}/kest/kubeconfigs`;
    await mkdir(dir, { recursive: true });
    const tempPath = `${dir}/capi-${namespace}-${name}-${crypto.randomUUID()}.yaml`;
    await Bun.write(tempPath, kubeconfigData);

    // Register cleanup to delete the temp file.
    reverting.add(async () => {
      await unlink(tempPath);
    });

    // Clear the parent's context so kubectl uses the current-context from the
    // child kubeconfig file rather than the management cluster's context name.
    const clusterKubectl = kubectl.extends({
      kubeconfig: tempPath,
      context: undefined,
    });
    return buildClusterSurface({ ...deps, kubectl: clusterKubectl });
  } catch (error) {
    actionErr = error as Error;
    throw error;
  } finally {
    recorder.record("ActionEnd", {
      ok: actionErr === undefined,
      error: actionErr,
    });
  }
}
