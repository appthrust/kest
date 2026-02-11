import { expect, test } from "bun:test";
import { Recorder } from "./recording";
import { retryUntil } from "./retry";

test("retryUntil records success flow events", async () => {
  const recorder = new Recorder();
  let n = 0;

  const value = await retryUntil(
    () => {
      n += 1;
      if (n < 3) {
        throw new Error("nope");
      }
      return Promise.resolve("ok");
    },
    { recorder, timeout: "50ms", interval: "1ms" }
  );

  expect(value).toBe("ok");

  const kinds = recorder.getEvents().map((e) => e.kind);
  expect(kinds).toEqual(["RetryStart", "RetryEnd"]);

  const end = recorder.getEvents().at(-1);
  expect(end?.kind).toBe("RetryEnd");
  if (end?.kind === "RetryEnd") {
    // First call is not a "retry", so attempts start from the 2nd call.
    expect(end.data.attempts).toBe(2);
    expect(end.data.success).toBe(true);
  }
});

test("retryUntil records timeout flow events", async () => {
  const recorder = new Recorder();
  let n = 0;

  let thrown: unknown;
  try {
    await retryUntil(
      () => {
        n += 1;
        throw new Error("always");
      },
      { recorder, timeout: "10ms", interval: "1ms" }
    );
  } catch (err) {
    thrown = err;
  }

  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toBe("always");

  const kinds = recorder.getEvents().map((e) => e.kind);
  expect(kinds[0]).toBe("RetryStart");
  expect(kinds.at(-1)).toBe("RetryEnd");
  expect(n).toBeGreaterThan(0);
});
