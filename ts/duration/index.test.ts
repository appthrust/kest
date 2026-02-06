import { expect, test } from "bun:test";
import { Duration, parseDuration } from ".";

test.each([
  { name: "zero", input: "0", expectedMs: 0 },
  { name: "milliseconds", input: "1ms", expectedMs: 1 },
  { name: "seconds", input: "1s", expectedMs: 1000 },
  { name: "minutes", input: "1m", expectedMs: 60_000 },
  { name: "hours", input: "1h", expectedMs: 3_600_000 },
  { name: "compound", input: "1h30m", expectedMs: 5_400_000 },
  { name: "fractional seconds", input: "1.5s", expectedMs: 1500 },
  { name: "fractional milliseconds (trunc)", input: "1.9ms", expectedMs: 1 },
])("parseDuration: $name", ({ input, expectedMs }) => {
  const d = parseDuration(input);
  expect(d).toBeInstanceOf(Duration);
  expect(d.toMilliseconds()).toBe(expectedMs);
});

test.each([
  { name: "empty", input: "" },
  { name: "whitespace prefix", input: " 1s" },
  { name: "whitespace suffix", input: "1s " },
  { name: "missing unit", input: "1" },
  { name: "unknown unit", input: "1day" },
  { name: "nanoseconds not supported", input: "1ns" },
  { name: "microseconds not supported", input: "1us" },
  { name: "microseconds (µs) not supported", input: "1µs" },
  { name: "negative not supported", input: "-1s" },
  { name: "plus sign not supported", input: "+1s" },
  { name: "garbage", input: "abc" },
  { name: "double dot", input: "1.2.3s" },
  { name: "sign only", input: "-" },
])("parseDuration throws: $name", ({ input }) => {
  expect(() => parseDuration(input)).toThrow("invalid duration");
});

test.each([
  { name: "zero", ms: 0, expected: "0" },
  { name: "ms only", ms: 999, expected: "999ms" },
  { name: "1s", ms: 1000, expected: "1s" },
  { name: "fractional seconds (1.5s)", ms: 1500, expected: "1.5s" },
  { name: "fractional seconds (1.001s)", ms: 1001, expected: "1.001s" },
  { name: "1m", ms: 60_000, expected: "1m" },
  { name: "1m0.5s", ms: 60_500, expected: "1m0.5s" },
  { name: "1h", ms: 3_600_000, expected: "1h" },
  { name: "1h30m", ms: 5_400_000, expected: "1h30m" },
])("Duration.toString: $name", ({ ms, expected }) => {
  const d = new Duration(ms);
  expect(d.toString()).toBe(expected);
});

test.each([
  { name: "roundtrip 999ms", ms: 999 },
  { name: "roundtrip 1001ms", ms: 1001 },
  { name: "roundtrip 1m0.5s", ms: 60_500 },
  { name: "roundtrip 1h30m", ms: 5_400_000 },
])("Duration.toString roundtrip: $name", ({ ms }) => {
  const d = new Duration(ms);
  const parsed = parseDuration(d.toString());
  expect(parsed.toMilliseconds()).toBe(ms);
});

test.each([
  { name: "constructor rejects negative", ms: -1 },
])("Duration throws: $name", ({ ms }) => {
  expect(() => new Duration(ms)).toThrow("invalid duration");
});
