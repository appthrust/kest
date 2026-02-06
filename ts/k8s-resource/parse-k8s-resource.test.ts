import { describe, expect, test } from "bun:test";
import outdent from "outdent";
import { parseK8sResource, parseK8sResourceYaml } from "./index";

describe("parseK8sResource", () => {
  describe("success cases", () => {
    test.each([
      {
        name: "ConfigMap with namespace",
        input: {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: "my-config",
            namespace: "default",
          },
        },
      },
      {
        name: "Namespace without namespace field",
        input: {
          apiVersion: "v1",
          kind: "Namespace",
          metadata: {
            name: "my-namespace",
          },
        },
      },
      {
        name: "Deployment with apps/v1 apiVersion",
        input: {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: {
            name: "my-deployment",
            namespace: "production",
          },
        },
      },
      {
        name: "Pod with spec",
        input: {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "my-pod",
            namespace: "default",
          },
          spec: {
            containers: [
              {
                name: "nginx",
                image: "nginx:latest",
              },
            ],
          },
        },
      },
      {
        name: "Pod with spec and status",
        input: {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "running-pod",
            namespace: "default",
          },
          spec: {
            containers: [
              {
                name: "nginx",
                image: "nginx:latest",
              },
            ],
          },
          status: {
            phase: "Running",
            conditions: [
              {
                type: "Ready",
                status: "True",
              },
            ],
          },
        },
      },
      {
        name: "Service with spec",
        input: {
          apiVersion: "v1",
          kind: "Service",
          metadata: {
            name: "my-service",
            namespace: "default",
          },
          spec: {
            selector: {
              app: "my-app",
            },
            ports: [
              {
                port: 80,
                targetPort: 8080,
              },
            ],
          },
        },
      },
      {
        name: "Deployment with spec and status",
        input: {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: {
            name: "my-deployment",
            namespace: "default",
          },
          spec: {
            replicas: 3,
            selector: {
              matchLabels: {
                app: "my-app",
              },
            },
            template: {
              metadata: {
                labels: {
                  app: "my-app",
                },
              },
              spec: {
                containers: [
                  {
                    name: "app",
                    image: "my-app:v1",
                  },
                ],
              },
            },
          },
          status: {
            replicas: 3,
            readyReplicas: 3,
            availableReplicas: 3,
          },
        },
      },
    ])("parses $name", ({ input }) => {
      const result = parseK8sResource(input);
      expect(result).toEqual({
        ok: true,
        value: input,
      });
    });
  });

  describe("error cases", () => {
    test.each([
      {
        name: "null value",
        input: null,
        expectedViolations: ["value must be an object"],
      },
      {
        name: "undefined value",
        input: undefined,
        expectedViolations: ["value must be an object"],
      },
      {
        name: "string value",
        input: "not an object",
        expectedViolations: ["value must be an object"],
      },
      {
        name: "missing apiVersion",
        input: {
          kind: "ConfigMap",
          metadata: { name: "my-config" },
        },
        expectedViolations: ["apiVersion is required"],
      },
      {
        name: "missing kind",
        input: {
          apiVersion: "v1",
          metadata: { name: "my-config" },
        },
        expectedViolations: ["kind is required"],
      },
      {
        name: "missing metadata",
        input: {
          apiVersion: "v1",
          kind: "ConfigMap",
        },
        expectedViolations: ["metadata is required"],
      },
      {
        name: "missing metadata.name",
        input: {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {},
        },
        expectedViolations: ["metadata.name is required"],
      },
      {
        name: "multiple missing fields",
        input: {
          metadata: { name: "my-config" },
        },
        expectedViolations: ["apiVersion is required", "kind is required"],
      },
      {
        name: "all required fields missing",
        input: {},
        expectedViolations: [
          "apiVersion is required",
          "kind is required",
          "metadata is required",
        ],
      },
    ])("returns error for $name", ({ input, expectedViolations }) => {
      const result = parseK8sResource(input);
      if (result.ok) {
        throw new Error("Expected error");
      }
      expect(result.violations).toEqual(
        expectedViolations as unknown as Array<string>
      );
    });
  });
});

describe("parseK8sResourceYaml", () => {
  test("parses valid yaml", () => {
    const yaml = outdent`
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: my-config
        namespace: default
      data:
        foo: bar
    `;

    const result = parseK8sResourceYaml(yaml);

    expect(result).toEqual({
      ok: true,
      value: {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: {
          name: "my-config",
          namespace: "default",
        },
        data: {
          foo: "bar",
        },
      },
    });
  });

  test("parses indented yaml without outdent", () => {
    const yaml = `
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: my-config
        namespace: default
      data:
        foo: bar
    `;

    const result = parseK8sResourceYaml(yaml);

    expect(result).toEqual({
      ok: true,
      value: {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: {
          name: "my-config",
          namespace: "default",
        },
        data: {
          foo: "bar",
        },
      },
    });
  });

  test.each([
    {
      name: "missing kind",
      yaml: outdent`
        apiVersion: v1
        metadata:
          name: my-config
      `,
      expectedViolations: ["kind is required"],
    },
    {
      name: "scalar yaml",
      yaml: outdent`
        just-a-string
      `,
      expectedViolations: ["value must be an object"],
    },
  ])("returns violations for $name", ({ yaml, expectedViolations }) => {
    const result = parseK8sResourceYaml(yaml);
    if (result.ok) {
      throw new Error("Expected error");
    }
    expect(result.violations).toEqual(
      expectedViolations as unknown as Array<string>
    );
  });

  test("throws on yaml stream", () => {
    const yaml = outdent`
      apiVersion: v1
      kind: ConfigMap
      ---
      apiVersion: v1
      kind: Namespace
    `;

    expect(() => parseK8sResourceYaml(yaml)).toThrow(
      "YAML stream is not supported"
    );
  });
});
