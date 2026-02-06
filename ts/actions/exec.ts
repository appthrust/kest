import { $ as bunShell } from "bun";
import type { ExecContext, ExecInput } from "../apis";
import type { MutateDef } from "./types";

const noopRevert = (): Promise<void> => Promise.resolve();

/** Executes arbitrary processing and registers optional revert. */
export const exec = {
  type: "mutate",
  name: "Exec",
  mutate: () => async (input) => {
    const context: ExecContext = { $: bunShell };
    const output = await input.do(context);
    const revert = input.revert;
    return {
      output,
      revert: revert ? () => revert(context) : noopRevert,
    };
  },
  // biome-ignore lint/suspicious/noExplicitAny: 本当はunknownにしたいが、createMutateFnとの噛み合せが難しいためanyにしている
} satisfies MutateDef<ExecInput<any>, unknown>;
