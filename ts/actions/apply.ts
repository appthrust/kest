import type { ApplyingManifest } from "../apis";
import { getResourceMeta, parseK8sResourceAny } from "../k8s-resource";
import type { MutateDef } from "./types";

export const apply = {
  type: "mutate",
  name: "Apply",
  mutate:
    ({ kubectl }) =>
    async (manifest) => {
      const result = await parseK8sResourceAny(manifest);
      if (!result.ok) {
        throw new Error(
          `Invalid Kubernetes resource: ${result.violations.join(", ")}`
        );
      }
      await kubectl.apply(result.value);
      return {
        async revert() {
          await kubectl.delete(result.value.kind, result.value.metadata.name, {
            ignoreNotFound: true,
          });
        },
        output: undefined,
      };
    },
  describe: (manifest) => {
    const meta = getResourceMeta(manifest);
    if (meta === undefined) {
      return "Apply a resource";
    }
    return `Apply \`${meta.kind}\` "${meta.name}"`;
  },
} satisfies MutateDef<ApplyingManifest, void>;
