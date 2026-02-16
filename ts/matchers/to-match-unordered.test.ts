import { expect, test } from "bun:test";
import { deepPartialMatch } from "./to-match-unordered";
import "./index";

// ---------------------------------------------------------------------------
// deepPartialMatch unit tests
// ---------------------------------------------------------------------------

test("deepPartialMatch: identical primitives", () => {
  expect(deepPartialMatch(1, 1)).toBe(true);
  expect(deepPartialMatch("a", "a")).toBe(true);
  expect(deepPartialMatch(true, true)).toBe(true);
  expect(deepPartialMatch(null, null)).toBe(true);
});

test("deepPartialMatch: different primitives", () => {
  expect(deepPartialMatch(1, 2)).toBe(false);
  expect(deepPartialMatch("a", "b")).toBe(false);
  expect(deepPartialMatch(null, 1)).toBe(false);
  expect(deepPartialMatch(1, null)).toBe(false);
});

test("deepPartialMatch: partial object match", () => {
  expect(deepPartialMatch({ a: 1, b: 2, c: 3 }, { a: 1 })).toBe(true);
  expect(deepPartialMatch({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  expect(deepPartialMatch({ a: 1 }, { a: 1, b: 2 })).toBe(false);
});

test("deepPartialMatch: deeply nested partial match", () => {
  const actual = {
    metadata: { name: "foo", labels: { app: "bar", env: "prod" } },
  };
  expect(
    deepPartialMatch(actual, { metadata: { labels: { app: "bar" } } })
  ).toBe(true);
  expect(
    deepPartialMatch(actual, { metadata: { labels: { app: "wrong" } } })
  ).toBe(false);
});

test("deepPartialMatch: arrays require same length and order", () => {
  expect(deepPartialMatch([1, 2, 3], [1, 2, 3])).toBe(true);
  expect(deepPartialMatch([1, 2, 3], [1, 2])).toBe(false);
  expect(deepPartialMatch([1, 2], [2, 1])).toBe(false);
});

test("deepPartialMatch: object vs array mismatch", () => {
  expect(deepPartialMatch({ "0": "a" }, ["a"])).toBe(false);
  expect(deepPartialMatch(["a"], { "0": "a" })).toBe(false);
});

// ---------------------------------------------------------------------------
// toMatchUnordered integration tests (via expect)
// ---------------------------------------------------------------------------

test("matches identical arrays in same order", () => {
  expect([{ a: 1 }, { a: 2 }]).toMatchUnordered([{ a: 1 }, { a: 2 }]);
});

test("matches arrays in different order", () => {
  expect([{ a: 1 }, { a: 2 }]).toMatchUnordered([{ a: 2 }, { a: 1 }]);
});

test("deep partial matching on items", () => {
  const actual = [
    { metadata: { name: "b" }, spec: { replicas: 3 } },
    { metadata: { name: "a" }, spec: { replicas: 1 } },
  ];
  expect(actual).toMatchUnordered([
    { metadata: { name: "a" } },
    { metadata: { name: "b" } },
  ]);
});

test("empty arrays match", () => {
  expect([]).toMatchUnordered([]);
});

test("does not check length: actual can have more items than expected", () => {
  expect([{ a: 1 }, { a: 2 }, { a: 3 }]).toMatchUnordered([{ a: 2 }, { a: 1 }]);
});

test("fails when an expected item has no match", () => {
  expect(() => {
    expect([{ a: 1 }, { a: 2 }]).toMatchUnordered([{ a: 1 }, { a: 3 }]);
  }).toThrow();
});

test("one-to-one matching: each actual used at most once", () => {
  expect(() => {
    expect([{ a: 1 }]).toMatchUnordered([{ a: 1 }, { a: 1 }]);
  }).toThrow();
});

test("supports .not for negation", () => {
  expect([{ a: 1 }, { a: 2 }]).not.toMatchUnordered([{ a: 3 }, { a: 4 }]);
});

test(".not fails when arrays actually match", () => {
  expect(() => {
    expect([{ a: 1 }, { a: 2 }]).not.toMatchUnordered([{ a: 2 }, { a: 1 }]);
  }).toThrow();
});

test("deeply nested objects with partial matching", () => {
  const actual = [
    {
      metadata: { name: "cluster-2", labels: { env: "prod", region: "us" } },
      spec: { version: "1.28", nodes: 5 },
    },
    {
      metadata: { name: "cluster-1", labels: { env: "dev", region: "eu" } },
      spec: { version: "1.27", nodes: 3 },
    },
  ];

  expect(actual).toMatchUnordered([
    { metadata: { name: "cluster-1", labels: { env: "dev" } } },
    { metadata: { name: "cluster-2" }, spec: { version: "1.28" } },
  ]);
});

// ---------------------------------------------------------------------------
// Asymmetric matcher support
// ---------------------------------------------------------------------------

test("supports expect.stringMatching in expected values", () => {
  const actual = [
    { metadata: { name: "my-cd-abc123" } },
    { metadata: { name: "initial-cs" } },
  ];
  expect(actual).toMatchUnordered([
    { metadata: { name: "initial-cs" } },
    { metadata: { name: expect.stringMatching(/^my-cd-/) } },
  ]);
});

test("supports expect.any in expected values", () => {
  expect([{ count: 42 }, { count: 7 }]).toMatchUnordered([
    { count: expect.any(Number) },
    { count: expect.any(Number) },
  ]);
});

test("supports expect.objectContaining in expected values", () => {
  const actual = [
    { metadata: { name: "a", labels: { app: "web", env: "prod" } } },
    { metadata: { name: "b", labels: { app: "api", env: "dev" } } },
  ];
  expect(actual).toMatchUnordered([
    { metadata: expect.objectContaining({ name: "b" }) },
    { metadata: expect.objectContaining({ name: "a" }) },
  ]);
});

test("supports expect.arrayContaining in expected values", () => {
  const actual = [{ tags: ["web", "prod", "v2"] }, { tags: ["api", "dev"] }];
  expect(actual).toMatchUnordered([
    { tags: expect.arrayContaining(["dev", "api"]) },
    { tags: expect.arrayContaining(["prod"]) },
  ]);
});

test("fails when asymmetric matcher does not match", () => {
  expect(() => {
    expect([{ name: "hello" }]).toMatchUnordered([
      { name: expect.stringMatching(/^goodbye/) },
    ]);
  }).toThrow();
});

// ---------------------------------------------------------------------------
// Nested array ordering
// ---------------------------------------------------------------------------

test("unordered only at top level: nested arrays are order-sensitive", () => {
  const actual = [
    { name: "b", ports: [80, 443] },
    { name: "a", ports: [8080] },
  ];

  // Top-level items can be in any order
  expect(actual).toMatchUnordered([
    { name: "a", ports: [8080] },
    { name: "b", ports: [80, 443] },
  ]);

  // But nested arrays must match in order
  expect(() => {
    expect(actual).toMatchUnordered([
      { name: "a", ports: [8080] },
      { name: "b", ports: [443, 80] },
    ]);
  }).toThrow();
});

// ---------------------------------------------------------------------------
// Failure message diff format
// ---------------------------------------------------------------------------

function getFailureMessage(fn: () => void): string {
  try {
    fn();
    throw new Error("expected function to throw");
  } catch (e: unknown) {
    return Bun.stripANSI((e as Error).message).trim();
  }
}

test("failure message shows unified toMatchObject-style diff", () => {
  const msg = getFailureMessage(() => {
    expect([
      { metadata: { name: "app-secret" }, data: { token: "abc" } },
      { metadata: { name: "db-secret" }, data: { token: "xyz" } },
    ]).toMatchUnordered([
      { metadata: { name: "app-secret" } },
      { metadata: { name: "cache-secret" } },
    ]);
  });

  expect(msg).toBe(
    `expect(received).toMatchUnordered(expected)

  [
    {
+     "data": {
+       "token": "abc",
+     },
      "metadata": {
        "name": "app-secret",
      },
    },
    {
+     "data": {
+       "token": "xyz",
+     },
      "metadata": {
-       "name": "cache-secret",
+       "name": "db-secret",
      },
    },
  ]

- Expected  - 1
+ Received  + 7`
  );
});

test("failure message picks closest actual for diff", () => {
  const msg = getFailureMessage(() => {
    expect([
      { name: "alpha", score: 100 },
      { name: "beta", score: 200 },
    ]).toMatchUnordered([
      { name: "alpha", score: 100 },
      { name: "beta", score: 999 },
    ]);
  });

  expect(msg).toBe(
    `expect(received).toMatchUnordered(expected)

  [
    {
      "name": "alpha",
      "score": 100,
    },
    {
      "name": "beta",
-     "score": 999,
+     "score": 200,
    },
  ]

- Expected  - 1
+ Received  + 1`
  );
});
