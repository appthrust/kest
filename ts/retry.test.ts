import { describe, expect, test } from "bun:test";
import { Duration } from "./duration";
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
  expect(kinds).toEqual([
    "RetryStart",
    "RetryAttempt",
    "RetryAttempt",
    "RetryEnd",
  ]);

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

  const attemptEvents = recorder
    .getEvents()
    .filter((e) => e.kind === "RetryAttempt");
  expect(attemptEvents.length).toBeGreaterThan(0);
  expect(n).toBeGreaterThan(0);
});

describe("stall detection", () => {
  test("bails early when the same error repeats beyond stallTimeout", async () => {
    const recorder = new Recorder();

    let thrown: unknown;
    try {
      await retryUntil(
        () => {
          throw new Error("controller not found");
        },
        {
          recorder,
          timeout: "10s",
          interval: "1ms",
          stallTimeout: "50ms",
        }
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("Stall detected");
    expect((thrown as Error).message).toContain("controller not found");

    const end = recorder.getEvents().at(-1);
    expect(end?.kind).toBe("RetryEnd");
    if (end?.kind === "RetryEnd") {
      expect(end.data.success).toBe(false);
      expect(end.data.reason).toBe("stall");
    }
  });

  test("resets stall timer when error message changes (progress)", async () => {
    let callCount = 0;

    const result = await retryUntil(
      () => {
        callCount += 1;
        if (callCount < 5) {
          // Different errors each time = progress
          throw new Error(`phase ${callCount}`);
        }
        return Promise.resolve("done");
      },
      {
        timeout: "5s",
        interval: "1ms",
        stallTimeout: "30ms",
      }
    );

    expect(result).toBe("done");
  });

  test("stall detection is disabled when stallTimeout is 0", async () => {
    let callCount = 0;

    let thrown: unknown;
    try {
      await retryUntil(
        () => {
          callCount += 1;
          throw new Error("same error");
        },
        {
          timeout: "80ms",
          interval: "1ms",
          stallTimeout: "0s",
        }
      );
    } catch (err) {
      thrown = err;
    }

    // Should timeout normally, not stall-bail
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("same error");
    expect((thrown as Error).message).not.toContain("Stall detected");
    expect(callCount).toBeGreaterThan(5);
  });

  test("stall detection works with Duration object", async () => {
    let thrown: unknown;
    try {
      await retryUntil(
        () => {
          throw new Error("stuck");
        },
        {
          timeout: "10s",
          interval: "1ms",
          stallTimeout: new Duration(50),
        }
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("Stall detected");
  });

  test("fingerprint only uses first 200 chars", async () => {
    let callCount = 0;

    let thrown: unknown;
    try {
      await retryUntil(
        () => {
          callCount += 1;
          // Same prefix, different suffix after 200 chars
          const base = "x".repeat(200);
          throw new Error(`${base}-attempt-${callCount}`);
        },
        {
          timeout: "10s",
          interval: "1ms",
          stallTimeout: "50ms",
        }
      );
    } catch (err) {
      thrown = err;
    }

    // Should detect stall because first 200 chars are identical
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("Stall detected");
  });
});
