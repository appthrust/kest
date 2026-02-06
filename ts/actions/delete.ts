import type { K8sResource, K8sResourceReference } from "../apis";
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

function toKubectlType<T extends K8sResource>(
  resource: K8sResourceReference<T>
): string {
  const { kind, apiVersion } = resource;
  const [group, version] = apiVersion.split("/");
  if (version === undefined) {
    // core group cannot include version in the type
    return kind;
  }
  return [kind, version, group].filter(Boolean).join(".");
}
