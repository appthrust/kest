import { YAML } from "bun";
import type { K8sResource, ResourceListTest } from "../apis";
import { parseK8sResourceListYaml } from "../k8s-resource";
import type { Deps, QueryDef } from "./types";

export const assertList = {
  type: "query",
  name: "AssertList",
  query:
    ({ kubectl }: Deps) =>
    async <T extends K8sResource>(
      condition: ResourceListTest<T>
    ): Promise<Array<T>> => {
      const yaml = await kubectl.list(toKubectlType(condition));
      const result = parseK8sResourceListYaml(yaml);
      if (!result.ok) {
        throw new Error(
          `Invalid Kubernetes resource list: ${result.violations.join(", ")}`
        );
      }

      const fetched = result.value;
      for (const item of fetched) {
        assertSameGVK(condition, item);
      }

      const typed = fetched as Array<T>;
      await condition.test.call(typed, typed);
      return typed;
    },
} satisfies QueryDef<ResourceListTest, Array<K8sResource>>;

function isSameGVK<T extends K8sResource>(
  finding: Pick<ResourceListTest<T>, "apiVersion" | "kind">,
  fetched: K8sResource
): fetched is T {
  return (
    finding.apiVersion === fetched.apiVersion && finding.kind === fetched.kind
  );
}

function assertSameGVK<T extends K8sResource>(
  finding: Pick<ResourceListTest<T>, "apiVersion" | "kind">,
  fetched: K8sResource
): void {
  if (!isSameGVK(finding, fetched)) {
    throw new Error(
      `Fetched Kubernetes resource: ${YAML.stringify(fetched)} is not expected: ${YAML.stringify(finding)}`
    );
  }
}

function toKubectlType<T extends K8sResource>(
  condition: Pick<ResourceListTest<T>, "apiVersion" | "kind">
): string {
  const { kind, apiVersion } = condition;
  const [group, version] = apiVersion.split("/");
  if (version === undefined) {
    // core group cannot include version in the type
    return kind;
  }
  return [kind, version, group].filter(Boolean).join(".");
}
