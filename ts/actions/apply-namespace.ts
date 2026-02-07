import { apply } from "./apply";
import type { MutateDef } from "./types";

/**
 * Input for namespace creation.
 *
 * - `undefined` -- auto-generate a name like `kest-{random}`.
 * - `string` -- use the exact name provided.
 * - `{ generateName: string }` -- use the string as a prefix followed by
 *   random characters (e.g. `{ generateName: "foo-" }` → `"foo-d7kpn"`).
 */
export type ApplyNamespaceInput =
  | undefined
  | string
  | { readonly generateName: string };

export const applyNamespace = {
  type: "mutate",
  name: "ApplyNamespace",
  mutate:
    ({ kubectl }) =>
    async (input) => {
      const name = resolveNamespaceName(input);
      const { revert } = await apply.mutate({ kubectl })({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name,
        },
      });
      return { revert, output: name };
    },
} satisfies MutateDef<ApplyNamespaceInput, string>;

function resolveNamespaceName(input: ApplyNamespaceInput): string {
  if (input === undefined) {
    return `kest-${randomConsonantDigits(5)}`;
  }
  if (typeof input === "string") {
    return input;
  }
  return `${input.generateName}${randomConsonantDigits(5)}`;
}

function randomConsonantDigits(length = 8): string {
  const chars = "bcdfghjklmnpqrstvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
