import type { K8sResource, ResourceTest } from "../apis";
import { parseK8sResourceYaml } from "../k8s-resource";
import type { Deps, QueryDef } from "./types";

export const assert = {
  type: "query",
  name: "Assert",
  query:
    ({ kubectl }: Deps) =>
    async <T extends K8sResource>(condition: ResourceTest<T>): Promise<T> => {
      const overrideContext = condition.namespace
        ? { namespace: condition.namespace }
        : undefined;
      const yaml = await kubectl.get(
        toKubectlType(condition),
        condition.name,
        overrideContext
      );
      const result = parseK8sResourceYaml(yaml);
      if (!result.ok) {
        throw new Error(
          `Invalid Kubernetes resource: ${result.violations.join(", ")}`
        );
      }
      const fetched = result.value as T;
      await condition.test.call(fetched, fetched);
      return fetched;
    },
  describe: <T extends K8sResource>(condition: ResourceTest<T>): string => {
    return `Assert \`${condition.kind}\` "${condition.name}"`;
  },
} satisfies QueryDef<ResourceTest, K8sResource>;

function toKubectlType<T extends K8sResource>(
  condition: ResourceTest<T>
): string {
  const { kind, apiVersion } = condition;
  const [group, version] = apiVersion.split("/");
  if (version === undefined) {
    // core group cannot include version in the type
    return kind;
  }
  return [kind, version, group].filter(Boolean).join(".");
}
