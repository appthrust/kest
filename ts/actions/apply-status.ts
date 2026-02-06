import type { ApplyingManifest } from "../apis";
import { parseK8sResourceAny } from "../k8s-resource";
import type { OneWayMutateDef } from "./types";

export const applyStatus = {
  type: "oneWayMutate",
  name: "ApplyStatus",
  mutate:
    ({ kubectl }) =>
    async (manifest) => {
      const result = await parseK8sResourceAny(manifest);
      if (!result.ok) {
        throw new Error(
          `Invalid Kubernetes resource: ${result.violations.join(", ")}`
        );
      }
      if (result.value["status"] === undefined) {
        throw new Error("Invalid Kubernetes resource: status is required");
      }
      await kubectl.applyStatus(result.value);
      return undefined;
    },
} satisfies OneWayMutateDef<ApplyingManifest, void>;
