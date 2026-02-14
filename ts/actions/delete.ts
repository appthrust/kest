import type { K8sResource, K8sResourceReference } from "../apis";
import { toKubectlType } from "./kubectl-type";
import type { OneWayMutateDef } from "./types";

export const deleteResource = {
  type: "oneWayMutate",
  name: "Delete",
  mutate:
    ({ kubectl }) =>
    async <T extends K8sResource>(resource: K8sResourceReference<T>) => {
      const overrideContext = resource.namespace
        ? { context: { namespace: resource.namespace } }
        : undefined;
      await kubectl.delete(
        toKubectlType(resource),
        resource.name,
        overrideContext
      );
      return undefined;
    },
  describe: (resource) => {
    return `Delete \`${resource.kind}\` "${resource.name}"`;
  },
} satisfies OneWayMutateDef<K8sResourceReference, void>;
