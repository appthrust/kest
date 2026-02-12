import type { AssertCreateErrorInput } from "../apis";
import { create } from "./create";
import type { MutateDef } from "./types";

export const assertCreateError = {
  type: "mutate",
  name: "AssertCreateError",
  mutate:
    ({ kubectl }) =>
    async (input) => {
      const createFn = create.mutate({ kubectl });
      let result: Awaited<ReturnType<typeof createFn>> | undefined;
      let rejection: Error | undefined;
      try {
        result = await createFn(input.create);
      } catch (err) {
        rejection = err as Error;
      }

      // Create succeeded unexpectedly -- revert immediately and throw so that
      // the scenario wrapper retries.
      if (result !== undefined) {
        await result.revert();
        throw new Error(
          `Expected ${create.describe(input.create)} to err, but it succeeded`
        );
      }

      // Create erred as expected -- run test callback.
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
    return `${create.describe(input.create)} (expected error)`;
  },
} satisfies MutateDef<AssertCreateErrorInput, void>;
