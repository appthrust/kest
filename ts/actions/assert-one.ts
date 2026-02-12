import { YAML } from "bun";
import type { K8sResource, ResourceOneTest } from "../apis";
import { parseK8sResourceListYaml } from "../k8s-resource";
import type { QueryDef } from "./types";

export const assertOne = {
  type: "query",
  name: "AssertOne",
  query:
    ({ kubectl }) =>
    async <T extends K8sResource>(
      condition: ResourceOneTest<T>
    ): Promise<T> => {
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
      const found = findExactlyOne(typed, condition);
      await condition.test.call(found, found);
      return found;
    },
  describe: <T extends K8sResource>(condition: ResourceOneTest<T>): string => {
    return `Assert one \`${condition.kind}\` resource`;
  },
} satisfies QueryDef<ResourceOneTest, K8sResource>;

function findExactlyOne<T extends K8sResource>(
  items: Array<T>,
  condition: ResourceOneTest<T>
): T {
  const candidates = condition.where ? items.filter(condition.where) : items;
  const hasWhere = condition.where !== undefined;

  if (candidates.length === 0) {
    throw new Error(
      hasWhere
        ? `No ${condition.kind} resource found matching the "where" predicate`
        : `No ${condition.kind} resource found`
    );
  }

  if (candidates.length > 1) {
    throw new Error(
      hasWhere
        ? `Expected exactly one ${condition.kind} matching the "where" predicate, but found ${candidates.length}`
        : `Expected exactly one ${condition.kind}, but found ${candidates.length}`
    );
  }

  return candidates[0] as T;
}

function isSameGVK<T extends K8sResource>(
  finding: Pick<ResourceOneTest<T>, "apiVersion" | "kind">,
  fetched: K8sResource
): fetched is T {
  return (
    finding.apiVersion === fetched.apiVersion && finding.kind === fetched.kind
  );
}

function assertSameGVK<T extends K8sResource>(
  finding: Pick<ResourceOneTest<T>, "apiVersion" | "kind">,
  fetched: K8sResource
): void {
  if (!isSameGVK(finding, fetched)) {
    throw new Error(
      `Fetched Kubernetes resource: ${YAML.stringify(fetched)} is not expected: ${YAML.stringify(finding)}`
    );
  }
}

function toKubectlType<T extends K8sResource>(
  condition: Pick<ResourceOneTest<T>, "apiVersion" | "kind">
): string {
  const { kind, apiVersion } = condition;
  const [group, version] = apiVersion.split("/");
  if (version === undefined) {
    // core group cannot include version in the type
    return kind;
  }
  return [kind, version, group].filter(Boolean).join(".");
}
