import { expect, type MatcherResult } from "bun:test";
import { stripAnsi } from "../reporter/markdown/strip-ansi";

type EqualsFunction = (a: unknown, b: unknown) => boolean;

/**
 * Deep partial match: checks that every key in `expected` exists in `actual`
 * with a matching value. For nested objects, recurses. For nested arrays,
 * checks index-by-index with ordered semantics.
 *
 * When an `equals` function is provided (from the matcher context), it is
 * called first for every comparison. This lets Bun's native equality handle
 * asymmetric matchers (`expect.stringMatching`, `expect.any`, etc.)
 * transparently — no special detection needed.
 */
export function deepPartialMatch(
  actual: unknown,
  expected: unknown,
  equals?: EqualsFunction
): boolean {
  if (Object.is(actual, expected)) {
    return true;
  }

  // Delegate to Bun's equals — handles asymmetric matchers and exact matches
  if (equals?.(actual, expected)) {
    return true;
  }

  if (expected === null || actual === null) {
    return false;
  }

  if (typeof expected !== "object" || typeof actual !== "object") {
    return false;
  }

  if (Array.isArray(expected)) {
    return deepPartialMatchArrays(actual, expected, equals);
  }

  if (Array.isArray(actual)) {
    return false;
  }

  // Only partial-match plain objects; for non-plain objects (Bun asymmetric
  // matchers, Date, RegExp, etc.) the equals() check above is authoritative.
  if (Object.getPrototypeOf(expected) !== Object.prototype) {
    return false;
  }

  return deepPartialMatchObjects(
    actual as Record<string, unknown>,
    expected as Record<string, unknown>,
    equals
  );
}

function deepPartialMatchArrays(
  actual: unknown,
  expected: Array<unknown>,
  equals?: EqualsFunction
): boolean {
  if (!Array.isArray(actual)) {
    return false;
  }
  if (actual.length !== expected.length) {
    return false;
  }
  return expected.every((item, i) => deepPartialMatch(actual[i], item, equals));
}

function deepPartialMatchObjects(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  equals?: EqualsFunction
): boolean {
  for (const key of Object.keys(expected)) {
    if (!(key in actual)) {
      return false;
    }
    if (!deepPartialMatch(actual[key], expected[key], equals)) {
      return false;
    }
  }
  return true;
}

interface MatchResult {
  pass: boolean;
  /** Maps each expected index to its matched actual index (or -1 if unmatched). */
  pairing: Array<number>;
  unmatchedActual: Array<number>;
}

/**
 * Find a one-to-one matching between expected and actual items using
 * deep partial match semantics. Returns a pairing array and unmatched
 * actual indices.
 */
function findMatching(
  actual: ReadonlyArray<unknown>,
  expected: ReadonlyArray<unknown>,
  equals?: EqualsFunction
): MatchResult {
  const usedActual = new Set<number>();
  const pairing: Array<number> = [];

  for (const [, expectedItem] of expected.entries()) {
    let matched = -1;
    for (let ai = 0; ai < actual.length; ai++) {
      if (usedActual.has(ai)) {
        continue;
      }
      if (deepPartialMatch(actual[ai], expectedItem, equals)) {
        usedActual.add(ai);
        matched = ai;
        break;
      }
    }
    pairing.push(matched);
  }

  const unmatchedActual: Array<number> = [];
  for (let ai = 0; ai < actual.length; ai++) {
    if (!usedActual.has(ai)) {
      unmatchedActual.push(ai);
    }
  }

  return {
    pass: pairing.every((ai) => ai !== -1),
    pairing,
    unmatchedActual,
  };
}

/**
 * Score how well an actual item matches an expected item by counting
 * top-level keys in expected that have a matching value in actual.
 */
function matchScore(
  actual: unknown,
  expected: unknown,
  equals?: EqualsFunction
): number {
  if (
    typeof expected !== "object" ||
    expected === null ||
    typeof actual !== "object" ||
    actual === null ||
    Array.isArray(expected) ||
    Array.isArray(actual)
  ) {
    return deepPartialMatch(actual, expected, equals) ? 1 : 0;
  }
  const expectedObj = expected as Record<string, unknown>;
  const actualObj = actual as Record<string, unknown>;
  let score = 0;
  for (const key of Object.keys(expectedObj)) {
    if (
      key in actualObj &&
      deepPartialMatch(actualObj[key], expectedObj[key], equals)
    ) {
      score++;
    }
  }
  return score;
}

/**
 * Find the closest actual item for an expected item by scoring all
 * candidates and returning the one with the highest match score.
 */
function findClosestActual(
  expectedItem: unknown,
  candidates: ReadonlyArray<unknown>,
  equals?: EqualsFunction
): unknown {
  let bestScore = -1;
  let bestCandidate: unknown = candidates[0];
  for (const candidate of candidates) {
    const score = matchScore(candidate, expectedItem, equals);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }
  return bestCandidate;
}

/**
 * Build a reordered actual array aligned with expected. Matched items
 * keep their paired actual; unmatched expected items get their closest
 * candidate from the unmatched actuals.
 */
function buildReorderedActual(
  actual: ReadonlyArray<unknown>,
  expected: ReadonlyArray<unknown>,
  pairing: ReadonlyArray<number>,
  unmatchedActual: ReadonlyArray<number>,
  equals?: EqualsFunction
): Array<unknown> {
  const unmatchedActualItems = unmatchedActual.map((i) => actual[i]);
  const reordered: Array<unknown> = [];

  for (let ei = 0; ei < expected.length; ei++) {
    const paired = pairing[ei] ?? -1;
    if (paired !== -1) {
      reordered.push(actual[paired]);
    } else if (unmatchedActualItems.length > 0) {
      reordered.push(
        findClosestActual(expected[ei], unmatchedActualItems, equals)
      );
    } else {
      reordered.push(undefined);
    }
  }

  return reordered;
}

export function toMatchUnordered(
  this: {
    isNot: boolean;
    equals: EqualsFunction;
    utils: { stringify(v: unknown): string };
  },
  actual: unknown,
  expected: ReadonlyArray<unknown>
): MatcherResult {
  if (!Array.isArray(actual)) {
    return {
      pass: false,
      message: () =>
        `expect(received).toMatchUnordered(expected)\n\nReceived value must be an array, but got ${typeof actual}`,
    };
  }
  const actualArray: ReadonlyArray<unknown> = actual;
  const equals = this.equals.bind(this);
  const { pass, pairing, unmatchedActual } = findMatching(
    actualArray,
    expected,
    equals
  );

  const message = (): string => {
    if (this.isNot) {
      return "expected arrays not to match (in any order), but every expected item had a match";
    }

    const reordered = buildReorderedActual(
      actualArray,
      expected,
      pairing,
      unmatchedActual,
      equals
    );

    try {
      // biome-ignore lint: expect is used to generate diff output, not as a test assertion
      expect(reordered).toMatchObject(expected as Array<unknown>);
      return "expected arrays to match (in any order), but some items did not match";
    } catch (e: unknown) {
      return stripAnsi((e as Error).message).replace(
        "expect(received).toMatchObject(expected)",
        "expect(received).toMatchUnordered(expected)"
      );
    }
  };

  return { pass, message };
}
