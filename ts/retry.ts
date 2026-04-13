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
function resolveStallTimeoutMs(
  value: undefined | string | Duration
): number {
  if (value === undefined) {
    return DEFAULT_STALL_TIMEOUT_MS;
  }
  if (typeof value === "number" && value === 0) {
    return 0;
  }
  const dur = value instanceof Duration ? value : parseDuration(value as string);
  return dur.toMilliseconds();
}

/**
 * Retries `fn` until it resolves, or times out.
 *
 * Useful for eventually-consistent systems (e.g. Kubernetes).
 */
export async function retryUntil<T>(
  fn: () => Promise<T>,
  options?: undefined | RetryOptions
): Promise<T> {
  const timeout = toDuration(options?.timeout, new Duration(5000));
  const interval = toDuration(options?.interval, new Duration(200));
  const stallTimeoutMs = resolveStallTimeoutMs(options?.stallTimeout);

  const timeoutMs = timeout.toMilliseconds();
  const intervalMs = interval.toMilliseconds();

  const startedAtMs = Date.now();
  const deadline = startedAtMs + timeoutMs;

  // Stall detection state
  let lastFingerprint = "";
  let stallStartMs = 0;

  let lastError: unknown;
  // The first call is not a "retry". Retry events start from the second call.
  try {
    return await fn();
  } catch (err) {
    lastError = err;
    // Initialize stall tracking from the very first error
    lastFingerprint = errorFingerprint(err);
    stallStartMs = Date.now();
  }

  let retries = 0;
  const { recorder } = options ?? {};
  recorder?.record("RetryStart", {});

  while (Date.now() < deadline) {
    const nowMs = Date.now();
    const remainingMs = Math.max(0, deadline - nowMs);
    const sleepMs = Math.min(intervalMs, Math.max(0, remainingMs));
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

      // Stall detection: check if error fingerprint changed
      if (stallTimeoutMs > 0) {
        const fp = errorFingerprint(err);
        if (fp !== lastFingerprint) {
          // Progress detected — error changed, reset stall timer
          lastFingerprint = fp;
          stallStartMs = Date.now();
        } else if (Date.now() - stallStartMs >= stallTimeoutMs) {
          // Same error for too long — bail out early
          const stallError = new Error(
            `Stall detected: same error repeated for ${new Duration(stallTimeoutMs).toString()} (no progress). Last error: ${fp}`
          );
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
