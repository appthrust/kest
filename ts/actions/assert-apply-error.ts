import type { AssertApplyErrorInput } from "../apis";
import { apply } from "./apply";
import type { MutateDef } from "./types";

export const assertApplyError = {
  type: "mutate",
  name: "AssertApplyError",
  mutate:
    ({ kubectl }) =>
    async (input) => {
      const applyFn = apply.mutate({ kubectl });
      let result: Awaited<ReturnType<typeof applyFn>> | undefined;
      let rejection: Error | undefined;
      try {
        result = await applyFn(input.apply);
      } catch (err) {
        rejection = err as Error;
      }

      // Apply succeeded unexpectedly -- revert immediately and throw so that
      // the scenario wrapper retries.
      if (result !== undefined) {
        await result.revert();
        throw new Error(
          `Expected ${apply.describe(input.apply)} to err, but it succeeded`
        );
      }

      // Apply erred as expected -- run test callback.
      // biome-ignore lint/style/noNonNullAssertion: rejection is guaranteed non-undefined when result is undefined
      await input.test.call(rejection!, rejection!);

      return {
        async revert() {
          // Nothing to clean up -- the resource was never created.
        },
        output: undefined,
      };
    },
  describe: (input) => {
    return `${apply.describe(input.apply)} (expected error)`;
  },
} satisfies MutateDef<AssertApplyErrorInput, void>;
