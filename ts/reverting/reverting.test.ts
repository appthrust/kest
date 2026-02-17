import { expect, test } from "bun:test";
import { Recorder } from "../recording";
import { createReverting } from "./index";

test("skip() records RevertingsSkipped event without calling revert functions", () => {
  const recorder = new Recorder();
  const reverting = createReverting({ recorder });
  let revertCalled = false;
  reverting.add(() => {
    revertCalled = true;
    return Promise.resolve();
  });

  reverting.skip();

  expect(revertCalled).toBe(false);
  const events = recorder.getEvents();
  expect(events).toEqual([{ kind: "RevertingsSkipped", data: {} }]);
});

test("revert() calls revert functions in LIFO order", async () => {
  const recorder = new Recorder();
  const reverting = createReverting({ recorder });
  const order: Array<string> = [];
  reverting.add(() => {
    order.push("first");
    return Promise.resolve();
  });
  reverting.add(() => {
    order.push("second");
    return Promise.resolve();
  });

  await reverting.revert();

  expect(order).toEqual(["second", "first"]);
  const kinds = recorder.getEvents().map((e) => e.kind);
  expect(kinds).toEqual(["RevertingsStart", "RevertingsEnd"]);
});
