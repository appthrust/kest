import { expect, test } from "bun:test";
import { outdent } from "outdent";
import { stringifyYaml } from ".";

const cases = [
  {
    name: "single document",
    value: { a: 1 },
    expected: outdent`
      a: 1
    `,
  },
  {
    name: "nested object",
    value: { a: { b: [1, 2, 3] } },
    expected: outdent`
      a: 
        b: 
          - 1
          - 2
          - 3
    `,
  },
];

test.each(cases)("stringify $name", ({ value, expected }) => {
  expect(stringifyYaml(value)).toBe(expected);
});
