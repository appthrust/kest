import type { K8sResource, LabelInput } from "../apis";
import { toKubectlType } from "./kubectl-type";
import type { OneWayMutateDef } from "./types";

export const label = {
  type: "oneWayMutate",
  name: "Label",
  mutate:
    ({ kubectl }) =>
    async <T extends K8sResource>(input: LabelInput<T>) => {
      const overrideContext = input.namespace
        ? { namespace: input.namespace }
        : undefined;
      await kubectl.label(toKubectlType(input), input.name, input.labels, {
        overwrite: input.overwrite,
        context: overrideContext,
      });
      return undefined;
    },
} satisfies OneWayMutateDef<LabelInput, void>;
