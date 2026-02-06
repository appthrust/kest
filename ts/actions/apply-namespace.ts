import { apply } from "./apply";
import type { MutateDef } from "./types";

export const applyNamespace = {
  type: "mutate",
  name: "ApplyNamespace",
  mutate:
    ({ kubectl }) =>
    async (namespaceName) => {
      const name = namespaceName ?? `kest-${randomConsonantDigits(5)}`;
      const { revert } = await apply.mutate({ kubectl })({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name,
        },
      });
      return { revert, output: name };
    },
} satisfies MutateDef<undefined | string, string>;

function randomConsonantDigits(length = 8): string {
  const chars = "bcdfghjklmnpqrstvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
