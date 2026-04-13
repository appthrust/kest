import { Duration, parseDuration } from "./duration";
import type { Recorder } from "./recording";

export interface RetryOptions {
  /**
   * Timeout duration (e.g. "5s", "200ms").
   *
   * @default "5s"
   */
  timeout?: undefined | string | Duration;
  /**
   * Polling interval duration (e.g. "200ms").
   *
   * @default "200ms"
   */
  interval?: undefined | string | Duration;

  /**
   * Maximum time the same error can repeat before bailing out early.
   *
   * When a retry loop keeps hitting the same error (e.g. a broken controller
   * returning "not found" 1,500 times), stall detection short-circuits the
   * loop instead of waiting for the full timeout.
   *
   * Set to `0` or `"0s"` to disable stall detection.
   *
   * @default "30s"
   */
  stallTimeout?: undefined | string | Duration;

  /**
   * Optional recorder for retry events.
   */
  recorder?: undefined | Recorder;
}

function toDuration(
  value: undefined | string | Duration,
  fallback: Duration
): Duration {
  if (value === undefined) {
    return fallback;
  }
  if (value instanceof Duration) {
    return value;
  }
  return parseDuration(value);
}

/**
 * Extracts a fingerprint from an error for stall detection.
 *
 * Only the first 200 characters of the message are compared so that long
 * or dynamic suffixes (stack traces, request IDs) do not defeat detection.
 */
function errorFingerprint(err: unknown): string {
  if (err instanceof Error) {
    return err.message.slice(0, 200);
  }
  return String(err).slice(0, 200);
}

const DEFAULT_STALL_TIMEOUT_MS = 30_000;

/**
 * Resolves the stall-timeout option.
 *
 * Returns `0` when stall detection is disabled (value is `0` / `"0s"` / `"0"`).
 */
function resolveStallTimeoutMs(value: undefined | string | Duration): number {
  if (value === undefined) {
    return DEFAULT_STALL_TIMEOUT_MS;
  }
  if (typeof value === "number" && value === 0) {
    return 0;
  }
  const dur =
    value instanceof Duration ? value : parseDuration(value as string);
  return dur.toMilliseconds();
}

/**
 * Retries `fn` until it resolves, or times out.
 *
 * Useful for eventually-consistent systems (e.g. Kubernetes).
 */
interface StallState {
  lastFingerprint: string;
  stallStartMs: number;
  readonly stallTimeoutMs: number;
}

/**
 * Updates stall state with a new error. Returns a stall Error if the same
 * error has been repeating past the stall timeout; returns null otherwise.
 */
function checkStall(state: StallState, err: unknown): Error | null {
  if (state.stallTimeoutMs <= 0) {
    return null;
  }
  const fp = errorFingerprint(err);
  if (fp !== state.lastFingerprint) {
    state.lastFingerprint = fp;
    state.stallStartMs = Date.now();
    return null;
  }
  if (Date.now() - state.stallStartMs < state.stallTimeoutMs) {
    return null;
  }
  return new Error(
    `Stall detected: same error repeated for ${new Duration(state.stallTimeoutMs).toString()} (no progress). Last error: ${fp}`
  );
}

export async function retryUntil<T>(
  fn: () => Promise<T>,
  options?: undefined | RetryOptions
): Promise<T> {
  const timeout = toDuration(options?.timeout, new Duration(5000));
  const interval = toDuration(options?.interval, new Duration(200));
  const stallTimeoutMs = resolveStallTimeoutMs(options?.stallTimeout);

  const timeoutMs = timeout.toMilliseconds();
  const intervalMs = interval.toMilliseconds();
  const deadline = Date.now() + timeoutMs;

  const stall: StallState = {
    lastFingerprint: "",
    stallStartMs: 0,
    stallTimeoutMs,
  };

  let lastError: unknown;
  // The first call is not a "retry". Retry events start from the second call.
  try {
    return await fn();
  } catch (err) {
    lastError = err;
    stall.lastFingerprint = errorFingerprint(err);
    stall.stallStartMs = Date.now();
  }

  let retries = 0;
  const { recorder } = options ?? {};
  recorder?.record("RetryStart", {});

  while (Date.now() < deadline) {
    const sleepMs = Math.min(intervalMs, Math.max(0, deadline - Date.now()));
    if (sleepMs > 0) {
      await Bun.sleep(sleepMs);
    }
    if (Date.now() >= deadline) {
      break;
    }

    retries += 1;
    recorder?.record("RetryAttempt", { attempt: retries });

    try {
      const value = await fn();
      recorder?.record("RetryEnd", {
        attempts: retries,
        success: true,
        reason: "success",
      });
      return value;
    } catch (err) {
      lastError = err;
      const stallError = checkStall(stall, err);
      if (stallError) {
        recorder?.record("RetryEnd", {
          attempts: retries,
          error: stallError,
          success: false,
          reason: "stall",
        });
        throw stallError;
      }
    }
  }

  lastError = lastError ?? new Error(`Timed out after ${timeout.toString()}`);

  if (retries > 0) {
    recorder?.record("RetryEnd", {
      attempts: retries,
      error: lastError as Error,
      success: false,
      reason: "timeout",
    });
  }

  throw lastError;
}
