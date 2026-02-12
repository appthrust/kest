import { generateName } from "../naming";
import { create } from "./create";
import type { MutateDef } from "./types";

/**
 * Input for namespace creation.
 *
 * - `undefined` -- auto-generate a name like `kest-{random}`.
 * - `string` -- use the exact name provided.
 * - `{ generateName: string }` -- use the string as a prefix followed by
 *   random characters (e.g. `{ generateName: "foo-" }` → `"foo-d7kpn"`).
 */
export type CreateNamespaceInput =
  | undefined
  | string
  | { readonly generateName: string };

export const createNamespace = {
  type: "mutate",
  name: "CreateNamespace",
  mutate:
    ({ kubectl }) =>
    async (input) => {
      const name = resolveNamespaceName(input);
      const { revert } = await create.mutate({ kubectl })({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name,
        },
      });
      return { revert, output: name };
    },
  describe: (input) => {
    if (input === undefined) {
      return "Create `Namespace` with auto-generated name";
    }
    if (typeof input === "string") {
      return `Create \`Namespace\` "${input}"`;
    }
    return `Create \`Namespace\` with prefix "${input.generateName}"`;
  },
} satisfies MutateDef<CreateNamespaceInput, string>;

function resolveNamespaceName(input: CreateNamespaceInput): string {
  if (input === undefined) {
    return generateName("kest-", 5);
  }
  if (typeof input === "string") {
    return input;
  }
  return generateName(input.generateName, 5);
}
