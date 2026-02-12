import { expect, test } from "bun:test";
import type { Kubectl } from "../kubectl";
import { Recorder } from "../recording";
import type { Reporter } from "../reporter/interface";
import { createReverting } from "../reverting";
import { createScenario } from "../scenario";

const noopReporter: Reporter = {
  report: () => Promise.resolve(""),
};

function makeKubectl(overrides?: Partial<Kubectl>): Kubectl {
  const kubectl: Kubectl = {
    extends: () => kubectl,
    apply: () => Promise.resolve(""),
    applyStatus: () => Promise.resolve(""),
    create: () => Promise.resolve(""),
    get: () => Promise.resolve(""),
    list: () => Promise.resolve(""),
    patch: () => Promise.resolve(""),
    label: () => Promise.resolve(""),
    delete: () => Promise.resolve(""),
    ...overrides,
  };
  return kubectl;
}

const manifest = {
  apiVersion: "v1",
  kind: "ConfigMap",
  metadata: { name: "my-config" },
  data: { mode: "demo" },
};

function makeScenario(kubectl: Kubectl) {
  const recorder = new Recorder();
  const reverting = createReverting({ recorder });
  return {
    scenario: createScenario({
      name: "test",
      recorder,
      kubectl,
      reverting,
      reporter: noopReporter,
    }),
    reverting,
  };
}

test("assertApplyError succeeds when kubectl.apply throws", async () => {
  const kubectl = makeKubectl({
    apply: () => {
      throw new Error("admission webhook denied the request");
    },
  });
  const { scenario } = makeScenario(kubectl);

  await scenario.assertApplyError({
    apply: manifest,
    test() {
      expect(this.message).toContain("admission webhook denied");
    },
  });
});

test("assertCreateError succeeds when kubectl.create throws", async () => {
  const kubectl = makeKubectl({
    create: () => {
      throw new Error("already exists");
    },
  });
  const { scenario } = makeScenario(kubectl);

  await scenario.assertCreateError({
    create: manifest,
    test(error) {
      expect(error.message).toContain("already exists");
    },
  });
});

test("assertApplyError throws when kubectl.apply succeeds", async () => {
  const kubectl = makeKubectl();
  const { scenario } = makeScenario(kubectl);

  await expect(
    scenario.assertApplyError(
      {
        apply: manifest,
        test() {
          /* any error is acceptable */
        },
      },
      { timeout: "100ms", interval: "50ms" }
    )
  ).rejects.toThrow("to err, but it succeeded");
});

test("assertApplyError passes the error to the test callback with this binding", async () => {
  const rejection = new Error("field is immutable");
  const kubectl = makeKubectl({
    apply: () => {
      throw rejection;
    },
  });
  const { scenario } = makeScenario(kubectl);

  let receivedError: Error | undefined;
  let receivedThis: Error | undefined;

  await scenario.assertApplyError({
    apply: manifest,
    test(error) {
      receivedThis = this;
      receivedError = error;
    },
  });

  expect(receivedError).toBe(rejection);
  expect(receivedThis).toBe(rejection);
});

test("assertApplyError retries when the test callback throws", async () => {
  const rejection = new Error("denied");
  const kubectl = makeKubectl({
    apply: () => {
      throw rejection;
    },
  });
  const { scenario } = makeScenario(kubectl);

  let callCount = 0;

  await scenario.assertApplyError(
    {
      apply: manifest,
      test() {
        callCount++;
        if (callCount < 3) {
          throw new Error("not the right error yet");
        }
      },
    },
    { timeout: "2s", interval: "50ms" }
  );

  expect(callCount).toBeGreaterThanOrEqual(3);
});

test("assertApplyError immediately reverts when apply unexpectedly succeeds", async () => {
  const deleted: Array<{ kind: string; name: string }> = [];
  let applyCallCount = 0;

  const kubectl = makeKubectl({
    apply: () => {
      applyCallCount++;
      if (applyCallCount === 1) {
        return Promise.resolve("");
      }
      throw new Error("now rejected");
    },
    delete: (kind, name) => {
      deleted.push({ kind, name });
      return Promise.resolve("");
    },
  });
  const { scenario } = makeScenario(kubectl);

  await scenario.assertApplyError(
    {
      apply: manifest,
      test() {
        /* any error is acceptable */
      },
    },
    { timeout: "2s", interval: "50ms" }
  );

  // The resource should have been reverted immediately (not deferred to cleanup)
  expect(deleted).toHaveLength(1);
  expect(deleted[0]).toEqual({ kind: "ConfigMap", name: "my-config" });
});
