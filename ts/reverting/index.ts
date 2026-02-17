import type { Revert } from "../actions/types";
import type { Recorder } from "../recording";

export function createReverting(deps: Deps) {
  const { recorder } = deps;
  const revertFns: Array<Revert> = [];
  return {
    add(revert: Revert): void {
      revertFns.push(revert);
    },
    async revert(): Promise<void> {
      recorder.record("RevertingsStart", {});
      let revertFn: undefined | Revert;
      try {
        for (;;) {
          revertFn = revertFns.pop();
          if (!revertFn) {
            break;
          }
          await revertFn();
        }
      } finally {
        if (revertFn) {
          revertFns.push(revertFn);
        }
        recorder.record("RevertingsEnd", {});
      }
    },
    skip(): void {
      recorder.record("RevertingsSkipped", {});
    },
  };
}

export type Reverting = ReturnType<typeof createReverting>;

interface Deps {
  readonly recorder: Recorder;
}
