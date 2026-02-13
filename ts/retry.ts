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

  const timeoutMs = timeout.toMilliseconds();
  const intervalMs = interval.toMilliseconds();

  const startedAtMs = Date.now();
  const deadline = startedAtMs + timeoutMs;

  let lastError: unknown;
  // The first call is not a "retry". Retry events start from the second call.
  try {
    return await fn();
  } catch (err) {
    lastError = err;
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
