import { YAML } from "bun";
import type { K8sResource, K8sResourceReference } from "../apis";
import { assert } from "./assert";
import type { QueryDef } from "./types";

export const get = {
  type: "query",
  name: "Get",
  query:
    ({ kubectl }) =>
    async <T extends K8sResource>(
      finding: K8sResourceReference<T>
    ): Promise<T> =>
      assert.query({ kubectl })({
        ...finding,
        test: (fetched) => assertSameGVK<T>(finding, fetched),
      }),
  describe: (finding) => {
    return `Get \`${finding.kind}\` "${finding.name}"`;
  },
} satisfies QueryDef<K8sResourceReference, K8sResource>;

function isSameGVK<T extends K8sResource>(
  finding: K8sResourceReference<T>,
  fetched: K8sResource
): fetched is T {
  return (
    finding.apiVersion === fetched.apiVersion &&
    finding.kind === fetched.kind &&
    finding.name === fetched.metadata.name
  );
}

function assertSameGVK<T extends K8sResource>(
  finding: K8sResourceReference<T>,
  fetched: K8sResource
): void {
  if (!isSameGVK<T>(finding, fetched)) {
    throw new Error(
      `Fetched Kubernetes resource: ${YAML.stringify(fetched)} is not expected: ${YAML.stringify(finding)}`
    );
  }
}
