const MS_PER_S = 1_000n;
const MS_PER_M = 60n * MS_PER_S;
const MS_PER_H = 60n * MS_PER_M;

function pow10(exp: number): bigint {
  let x = 1n;
  for (let i = 0; i < exp; i++) {
    x *= 10n;
  }
  return x;
}

function parseDecimalToMilliseconds(value: string, unitMs: bigint): bigint {
  // value is like "12" or "12.34"
  const dot = value.indexOf(".");
  if (dot === -1) {
    return BigInt(value) * unitMs;
  }

  const intPartStr = value.slice(0, dot);
  const fracPartStr = value.slice(dot + 1);
  if (fracPartStr.length === 0) {
    throw new Error("invalid duration");
  }

  const intPart = BigInt(intPartStr);
  const fracScale = pow10(fracPartStr.length);
  const frac = BigInt(fracPartStr);

  // Truncate toward zero at millisecond precision.
  return intPart * unitMs + (frac * unitMs) / fracScale;
}

function unitToMilliseconds(unit: string): bigint {
  switch (unit) {
    case "ms":
      return 1n;
    case "s":
      return MS_PER_S;
    case "m":
      return MS_PER_M;
    case "h":
      return MS_PER_H;
    default:
      throw new Error("invalid duration");
  }
}

export class Duration {
  static readonly zero = new Duration(0);

  readonly milliseconds: number;

  constructor(milliseconds: number) {
    if (!Number.isFinite(milliseconds)) {
      throw new Error("invalid duration");
    }
    if (!Number.isInteger(milliseconds)) {
      throw new Error("invalid duration");
    }
    if (milliseconds < 0) {
      throw new Error("invalid duration");
    }
    this.milliseconds = milliseconds;
  }

  toMilliseconds(): number {
    return this.milliseconds;
  }

  toString(): string {
    const ms = this.milliseconds;
    if (ms === 0) {
      return "0";
    }

    let absMs = ms;
    if (absMs < 1000) {
      return `${absMs}ms`;
    }

    const MS_PER_S_NUM = 1000;
    const MS_PER_M_NUM = 60_000;
    const MS_PER_H_NUM = 3_600_000;

    const hours = Math.floor(absMs / MS_PER_H_NUM);
    absMs -= hours * MS_PER_H_NUM;
    const minutes = Math.floor(absMs / MS_PER_M_NUM);
    absMs -= minutes * MS_PER_M_NUM;
    const seconds = Math.floor(absMs / MS_PER_S_NUM);
    const remMs = absMs - seconds * MS_PER_S_NUM;

    let out = "";
    if (hours > 0) {
      out += `${hours}h`;
    }
    if (minutes > 0) {
      out += `${minutes}m`;
    }

    if (seconds > 0 || remMs > 0 || out === "") {
      if (remMs === 0) {
        out += `${seconds}s`;
      } else {
        const frac = String(remMs).padStart(3, "0").replace(/0+$/, "");
        out += `${seconds}.${frac}s`;
      }
    }

    return out;
  }
}

/**
 * Parses a duration string like Go's time.ParseDuration.
 *
 * Examples:
 * - "300ms"
 * - "1.5h"
 * - "-2h45m"
 * - "1h30m"
 */
export function parseDuration(input: string): Duration {
  if (input.length === 0) {
    throw new Error("invalid duration");
  }
  // Keep it strict (Go-like): no leading/trailing whitespace.
  if (input.trim() !== input) {
    throw new Error("invalid duration");
  }

  if (input[0] === "-" || input[0] === "+") {
    throw new Error("invalid duration");
  }

  const s = input;

  if (s === "0") {
    return Duration.zero;
  }

  // token: <number><unit>
  // number: \d+(\.\d+)?
  // NOTE: millisecond precision for Date interop: no ns/us.
  const re = /(\d+(?:\.\d+)?)(ms|s|m|h)/gy;
  let totalMs = 0n;
  let matchedAny = false;
  let consumed = 0;
  while (true) {
    const m = re.exec(s);
    if (!m) {
      break;
    }
    matchedAny = true;
    consumed = re.lastIndex;
    const value = m[1];
    const unit = m[2];
    const unitMs = unitToMilliseconds(unit as string);
    totalMs += parseDecimalToMilliseconds(value as string, unitMs);
  }

  if (!matchedAny || consumed !== s.length) {
    throw new Error("invalid duration");
  }

  const msNumber = Number(totalMs);
  if (!Number.isSafeInteger(msNumber)) {
    throw new Error("invalid duration");
  }
  return new Duration(msNumber);
}
