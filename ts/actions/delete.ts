import type { K8sResource, K8sResourceReference } from "../apis";
import { toKubectlType } from "./kubectl-type";
import type { OneWayMutateDef } from "./types";

export const deleteResource = {
  type: "oneWayMutate",
  name: "Delete",
  mutate:
    ({ kubectl }) =>
    async <T extends K8sResource>(resource: K8sResourceReference<T>) => {
      await kubectl.delete(toKubectlType(resource), resource.name);
      return undefined;
    },
} satisfies OneWayMutateDef<K8sResourceReference, void>;
