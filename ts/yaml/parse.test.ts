import { expect, test } from "bun:test";
import outdent from "outdent";
import { parseYaml } from ".";

const cases = [
  {
    name: "single document",
    yaml: outdent`
      a: 1
    `,
    expected: { a: 1 },
  },
  {
    name: "multiple documents (stream)",
    yaml: outdent`
      a: 1
      ---
      a: 2
    `,
    error: "YAML stream is not supported",
  },
  {
    name: "single document in stream",
    yaml: outdent`
      ---
      a: 1
    `,
    error: "YAML stream is not supported",
  },
  {
    name: "literal block scalar (single line)",
    yaml: outdent`
      "a"
    `,
    expected: "a",
  },
];

test.each(cases)("parse $name", ({ yaml, expected, error }) => {
  if (error) {
    expect(() => parseYaml(yaml)).toThrow(error);
  } else {
    expect(parseYaml(yaml)).toEqual(expected);
  }
});
