import type { K8sResource, K8sResourceReference } from "../apis";
import { toKubectlType } from "./kubectl-type";
import type { Deps, QueryDef } from "./types";

export const assertAbsence = {
  type: "query",
  name: "AssertAbsence",
  query:
    ({ kubectl }: Deps) =>
    async <T extends K8sResource>(
      resource: K8sResourceReference<T>
    ): Promise<void> => {
      const overrideContext = resource.namespace
        ? { namespace: resource.namespace }
        : undefined;
      try {
        await kubectl.get(
          toKubectlType(resource),
          resource.name,
          overrideContext
        );
      } catch (error) {
        if (isNotFoundError(error)) {
          return;
        }
        throw error;
      }
      throw new Error(
        `Expected ${resource.kind} "${resource.name}" to be absent, but it exists`
      );
    },
  describe: (resource) =>
    `Assert that \`${resource.kind}\` "${resource.name}" is absent`,
} satisfies QueryDef<K8sResourceReference, void>;

/**
 * Checks whether a kubectl error is a "NotFound" error.
 *
 * kubectl outputs `Error from server (NotFound):` when the resource does not
 * exist, and the {@link RealKubectl} wrapper embeds that message in the
 * thrown `Error`.
 */
function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("(NotFound)");
}
