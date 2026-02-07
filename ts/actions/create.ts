import type { ApplyingManifest } from "../apis";
import { parseK8sResourceAny } from "../k8s-resource";
import type { MutateDef } from "./types";

export const create = {
  type: "mutate",
  name: "Create",
  mutate:
    ({ kubectl }) =>
    async (manifest) => {
      const result = await parseK8sResourceAny(manifest);
      if (!result.ok) {
        throw new Error(
          `Invalid Kubernetes resource: ${result.violations.join(", ")}`
        );
      }
      await kubectl.create(result.value);
      return {
        async revert() {
          await kubectl.delete(result.value.kind, result.value.metadata.name, {
            ignoreNotFound: true,
          });
        },
        output: undefined,
      };
    },
} satisfies MutateDef<ApplyingManifest, void>;
