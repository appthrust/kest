import { expect, test } from "bun:test";
import type { Report } from "../../model";
import { run } from "../renderer.test";

const report = {
  scenarios: [
    {
      name: "ansi enabled",
      overview: [{ name: "Check health", status: "failure" }],
      details: [
        {
          type: "Action",
          name: "Check health",
          error: {
            message: {
              text: "\u001b[31mboom\u001b[0m",
              language: "text",
            },
          },
        },
      ],
      cleanup: [],
    },
  ],
} satisfies Report;

const expected = (await import("./ansi-enabled.txt")).default;

test("ansi enabled", async () => {
  const result = await run({
    report,
    options: {
      enableANSI: true,
    },
  });
  expect(result).toBe(expected);
});
