import type { MatcherResult } from "bun:test";

/**
 * Deep partial match: checks that every key in `expected` exists in `actual`
 * with a matching value. For nested objects, recurses. For nested arrays,
 * checks index-by-index with ordered semantics.
 */
export function deepPartialMatch(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) {
    return true;
  }

  if (expected === null || actual === null) {
    return actual === expected;
  }

  if (typeof expected !== "object" || typeof actual !== "object") {
    return actual === expected;
  }

  if (Array.isArray(expected)) {
    return deepPartialMatchArrays(actual, expected);
  }

  if (Array.isArray(actual)) {
    return false;
  }

  return deepPartialMatchObjects(
    actual as Record<string, unknown>,
    expected as Record<string, unknown>
  );
}

function deepPartialMatchArrays(
  actual: unknown,
  expected: Array<unknown>
): boolean {
  if (!Array.isArray(actual)) {
    return false;
  }
  if (actual.length !== expected.length) {
    return false;
  }
  return expected.every((item, i) => deepPartialMatch(actual[i], item));
}

function deepPartialMatchObjects(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>
): boolean {
  for (const key of Object.keys(expected)) {
    if (!(key in actual)) {
      return false;
    }
    if (!deepPartialMatch(actual[key], expected[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Find a one-to-one matching between expected and actual items using
 * deep partial match semantics. Returns the indices of unmatched expected
 * and unmatched actual items.
 */
function findUnmatched(
  actual: ReadonlyArray<unknown>,
  expected: ReadonlyArray<unknown>
): { unmatchedExpected: Array<number>; unmatchedActual: Array<number> } {
  const usedActual = new Set<number>();
  const unmatchedExpected: Array<number> = [];

  for (let ei = 0; ei < expected.length; ei++) {
    let found = false;
    for (let ai = 0; ai < actual.length; ai++) {
      if (usedActual.has(ai)) {
        continue;
      }
      if (deepPartialMatch(actual[ai], expected[ei])) {
        usedActual.add(ai);
        found = true;
        break;
      }
    }
    if (!found) {
      unmatchedExpected.push(ei);
    }
  }

  const unmatchedActual: Array<number> = [];
  for (let ai = 0; ai < actual.length; ai++) {
    if (!usedActual.has(ai)) {
      unmatchedActual.push(ai);
    }
  }

  return { unmatchedExpected, unmatchedActual };
}

export function toMatchUnordered(
  this: { isNot: boolean; utils: { stringify(v: unknown): string } },
  actual: unknown,
  expected: unknown
): MatcherResult {
  if (!Array.isArray(actual)) {
    return {
      pass: false,
      message: () => `expected value to be an array, but got ${typeof actual}`,
    };
  }

  if (!Array.isArray(expected)) {
    return {
      pass: false,
      message: () =>
        `expected argument must be an array, but got ${typeof expected}`,
    };
  }

  const { unmatchedExpected } = findUnmatched(actual, expected);
  const pass = unmatchedExpected.length === 0;

  const message = (): string => {
    if (this.isNot) {
      return "expected arrays not to match (in any order), but every expected item had a match";
    }
    const lines: Array<string> = [
      "expected arrays to match (in any order), but some items did not match:",
      "",
      "Expected items without a match:",
    ];
    for (const i of unmatchedExpected) {
      lines.push(`  [${i}]: ${this.utils.stringify(expected[i])}`);
    }
    return lines.join("\n");
  };

  return { pass, message };
}
