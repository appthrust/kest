# Kest

![Kest – Kubernetes E2E testing designed for humans and AI alike](social-preview.svg)

> **Preview Release** -- Kest is currently in `0.x` preview. The API may change based on feedback. Breaking changes can occur in any `0.x` release. A stable `1.0.0` will be released once the API solidifies. Feel free to [open an issue](https://github.com/appthrust/kest/issues/new) if you have any feedback.

**Kubernetes E2E testing designed for humans and AI alike**

Kest makes it easy to write reliable end-to-end tests for Kubernetes controllers, operators, and admission webhooks. You write test scenarios in TypeScript with full type safety, autocompletion, and the familiar `expect()` API. When a test fails, Kest generates structured Markdown reports that are easy for humans to scan and for AI assistants to parse -- making troubleshooting straightforward regardless of who (or what) is debugging.

```ts
import { expect } from "bun:test";
import { test } from "@appthrust/kest";

test("Deployment creates expected ReplicaSet", async (s) => {
  s.given("a namespace exists");
  const ns = await s.newNamespace();

  s.when("I apply a Deployment");
  await ns.apply({
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: "my-app" },
    spec: {
      replicas: 2,
      selector: { matchLabels: { app: "my-app" } },
      template: {
        metadata: { labels: { app: "my-app" } },
        spec: { containers: [{ name: "app", image: "nginx" }] },
      },
    },
  });

  s.then("the Deployment should be available");
  await ns.assert({
    apiVersion: "apps/v1",
    kind: "Deployment",
    name: "my-app",
    test() {
      expect(this.status?.availableReplicas).toBe(2);
    },
  });
  // Cleanup is automatic: resources are deleted in reverse order,
  // then the namespace is removed.
});
```

## Why TypeScript?

YAML and Go are the norm in the Kubernetes ecosystem, so why TypeScript?

**Why not YAML?** E2E tests are inherently procedural -- apply resources, wait for reconciliation, assert state, clean up. YAML is a data format, not a programming language, and becomes clunky when you try to express these sequential workflows directly.

**Why not Go?** Go has an excellent Kubernetes client ecosystem, but TypeScript object literals are far more concise than Go structs for expressing Kubernetes manifests inline. Tests read closer to the YAML you already know, without the boilerplate of typed struct initialization and pointer helpers.

**What TypeScript brings:**

- **Editor support** -- autocompletion, inline type checking, go-to-definition
- **Readability** -- object literals map naturally to Kubernetes manifests
- **Flexibility** -- loops, conditionals, helper functions, and shared fixtures are just code
- **Ecosystem** -- use any npm package for setup, assertions, or data generation

## Features

### Ephemeral Namespaces

Each test gets an isolated, auto-generated namespace (e.g. `kest-a1b2c`). Resources are confined to this namespace, eliminating interference between tests and enabling safe parallel execution. The namespace is deleted when the test ends.

```ts
const ns = await s.newNamespace();
// All resources applied through `ns` are scoped to this namespace.
```

You can also specify a custom prefix for the generated namespace name using `generateName`:

```ts
const ns = await s.newNamespace({ generateName: "foo-" });
// Namespace name will be like "foo-d7kpn"
```

### Automatic Cleanup (Reverse-Order, Blocking)

Resources are deleted in the reverse order they were created (LIFO). Kest waits until each resource is fully removed before proceeding, preventing flaky failures caused by lingering resources or `Terminating` namespaces.

```
Created:   Namespace → ConfigMap → Deployment → Service
Cleaned:   Service → Deployment → ConfigMap → Namespace
```

### Retry-Based Assertions

Kubernetes is eventually consistent. Kest retries assertions automatically until they pass or a timeout expires, so you don't need fragile `sleep()` calls.

```ts
await ns.assert({
  apiVersion: "v1",
  kind: "ConfigMap",
  name: "my-config",
  test() {
    // Retried until this passes (default: 5s timeout, 200ms interval)
    expect(this.data?.mode).toBe("production");
  },
});
```

Custom timeouts are supported per action:

```ts
await ns.assert(
  {
    apiVersion: "apps/v1",
    kind: "Deployment",
    name: "my-app",
    test() {
      expect(this.status?.availableReplicas).toBe(3);
    },
  },
  { timeout: "30s", interval: "1s" },
);
```

### Multiple Manifest Formats

Apply resources using whichever format is most convenient:

```ts
// Inline YAML string
await ns.apply(`
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: my-config
  data:
    mode: demo
`);

// TypeScript object literal (with type checking)
await ns.apply<ConfigMap>({
  apiVersion: "v1",
  kind: "ConfigMap",
  metadata: { name: "my-config" },
  data: { mode: "demo" },
});

// Imported YAML file
await ns.apply(import("./manifests/config-map.yaml"));
```

### Multi-Cluster Support

Test scenarios that span multiple clusters:

```ts
test("resources sync across clusters", async (s) => {
  const primary = await s.useCluster({ context: "kind-primary" });
  const secondary = await s.useCluster({
    context: "kind-secondary",
    kubeconfig: ".kubeconfig.yaml",
  });

  const ns1 = await primary.newNamespace();
  const ns2 = await secondary.newNamespace();

  await ns1.apply(/* ... */);
  await ns2.assert(/* ... */);
});
```

### Status Subresource Support

Simulate controller behavior by applying status subresources via server-side apply:

```ts
await ns.applyStatus({
  apiVersion: "example.com/v1",
  kind: "MyResource",
  metadata: { name: "my-resource" },
  status: {
    conditions: [
      {
        type: "Ready",
        status: "True",
        lastTransitionTime: "2026-01-01T00:00:00Z",
        reason: "Reconciled",
        message: "Resource is ready.",
      },
    ],
  },
});
```

### List Assertions

Assert against a collection of resources:

```ts
await ns.assertList<ConfigMap>({
  apiVersion: "v1",
  kind: "ConfigMap",
  test() {
    expect(this.some((c) => c.metadata.name === "my-config")).toBe(true);
    expect(this.some((c) => c.metadata.name === "deleted-config")).toBe(false);
  },
});
```

### Absence Assertions

Assert that a resource does not exist (e.g. after deletion or to verify a controller hasn't created something):

```ts
await ns.assertAbsence({
  apiVersion: "v1",
  kind: "ConfigMap",
  name: "deleted-config",
});
```

With retry-based polling to wait for a resource to disappear:

```ts
await ns.assertAbsence(
  {
    apiVersion: "apps/v1",
    kind: "Deployment",
    name: "my-app",
  },
  { timeout: "30s", interval: "1s" },
);
```

### Label Resources

Add, update, or remove labels on Kubernetes resources using `kubectl label`:

```ts
await ns.label({
  apiVersion: "v1",
  kind: "ConfigMap",
  name: "my-config",
  labels: {
    env: "production",   // add a label
    deprecated: null,    // remove a label
  },
});
```

To overwrite an existing label, set `overwrite: true`:

```ts
await ns.label({
  apiVersion: "apps/v1",
  kind: "Deployment",
  name: "my-app",
  labels: {
    version: "v2",
  },
  overwrite: true,
});
```

### Shell Command Execution

Run arbitrary shell commands with optional revert handlers for cleanup:

```ts
const name = await s.exec({
  do: async ({ $ }) => {
    const name = "my-secret";
    await $`kubectl create secret generic ${name} --from-literal=password=s3cr3t`.quiet();
    return name;
  },
  revert: async ({ $ }) => {
    await $`kubectl delete secret my-secret`.quiet();
  },
});
```

### BDD-Style Reporting

Structure tests with Given/When/Then annotations for readable output:

```ts
test("ConfigMap lifecycle", async (s) => {
  s.given("a namespace exists");
  const ns = await s.newNamespace();

  s.when("I apply a ConfigMap");
  await ns.apply(/* ... */);

  s.then("the ConfigMap should have the expected data");
  await ns.assert(/* ... */);
});
```

### Markdown Test Reports

When a test fails (or when `KEST_SHOW_REPORT=1` is set), Kest generates a detailed Markdown report showing every action, the exact `kubectl` commands executed, stdout/stderr output, and cleanup results. This provides full transparency into what happened during the test, making troubleshooting straightforward -- for both humans and AI assistants.

```markdown
# ConfigMap lifecycle

## Scenario Overview

| #   | Action           | Resource            | Status |
| --- | ---------------- | ------------------- | ------ |
| 1   | Create namespace | kest-9hdhj          | ✅     |
| 2   | Apply            | ConfigMap/my-config | ✅     |
| 3   | Assert           | ConfigMap/my-config | ✅     |

## Scenario Details

### Given: a namespace exists

✅ Create Namespace "kest-9hdhj"
...

### Cleanup

| #   | Action           | Resource            | Status |
| --- | ---------------- | ------------------- | ------ |
| 1   | Delete           | ConfigMap/my-config | ✅     |
| 2   | Delete namespace | kest-9hdhj          | ✅     |
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.3.8 or later
- `kubectl` configured with access to a Kubernetes cluster
- A running Kubernetes cluster (e.g. [kind](https://kind.sigs.k8s.io/), [minikube](https://minikube.sigs.k8s.io/), or a remote cluster)

### Installation

```sh
bun add -d @appthrust/kest
```

### Write Your First Test

Create a test file, e.g. `my-operator.test.ts`:

```ts
import { expect } from "bun:test";
import { test } from "@appthrust/kest";

test("ConfigMap is created with correct data", async (s) => {
  s.given("a new namespace exists");
  const ns = await s.newNamespace();

  s.when("I apply a ConfigMap");
  await ns.apply({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: "app-config" },
    data: { environment: "test" },
  });

  s.then("the ConfigMap should contain the expected data");
  await ns.assert({
    apiVersion: "v1",
    kind: "ConfigMap",
    name: "app-config",
    test() {
      expect(this.data?.environment).toBe("test");
    },
  });
});
```

### Run Tests

```sh
bun test
```

To always show the Markdown test report (not just on failure):

```sh
KEST_SHOW_REPORT=1 bun test
```

## API Reference

### `test(label, callback, options?)`

Entry point for defining a test scenario. The callback receives a `Scenario` object.

| Option    | Type     | Default | Description                          |
| --------- | -------- | ------- | ------------------------------------ |
| `timeout` | `string` | `"60s"` | Maximum duration for the entire test |

### Scenario

The top-level API surface available in every test callback.

| Method                                                                  | Description                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------- |
| `apply(manifest, options?)`                                             | Apply a Kubernetes manifest and register cleanup  |
| `applyStatus(manifest, options?)`                                       | Apply a status subresource (server-side apply)    |
| `delete(resource, options?)`                                            | Delete a resource by API version, kind, and name  |
| `label(input, options?)`                                                | Add, update, or remove labels on a resource       |
| `get(resource, options?)`                                               | Fetch a resource by API version, kind, and name   |
| `assert(resource, options?)`                                            | Fetch a resource and run assertions with retries  |
| `assertAbsence(resource, options?)`                                     | Assert that a resource does not exist             |
| `assertList(resource, options?)`                                        | Fetch a list of resources and run assertions      |
| `newNamespace(name?, options?)`                                         | Create an ephemeral namespace (supports `{ generateName }`) |
| `exec(input, options?)`                                                 | Execute shell commands with optional revert       |
| `useCluster(ref)`                                                       | Create a cluster-bound API surface                |
| `given(desc)` / `when(desc)` / `then(desc)` / `and(desc)` / `but(desc)` | BDD annotations for reporting                     |

### Namespace / Cluster

Returned by `newNamespace()` and `useCluster()` respectively. They expose the same core methods (`apply`, `applyStatus`, `delete`, `label`, `get`, `assert`, `assertAbsence`, `assertList`) scoped to their namespace or cluster context. `Cluster` additionally supports `newNamespace`.

### Action Options

All actions accept an optional options object for retry configuration.

| Option     | Type     | Default   | Description                  |
| ---------- | -------- | --------- | ---------------------------- |
| `timeout`  | `string` | `"5s"`    | Maximum retry duration       |
| `interval` | `string` | `"200ms"` | Delay between retry attempts |

Duration strings support units like `"200ms"`, `"5s"`, `"1m"`.

## Type Safety

Define TypeScript interfaces for your Kubernetes resources to get full type checking in manifests and assertions:

```ts
import type { K8sResource } from "@appthrust/kest";

interface MyCustomResource extends K8sResource {
  apiVersion: "example.com/v1";
  kind: "MyResource";
  metadata: { name: string };
  spec: {
    replicas: number;
    image: string;
  };
  status?: {
    conditions: Array<{
      type: string;
      status: "True" | "False" | "Unknown";
    }>;
  };
}

// Full autocompletion and type checking:
await ns.apply<MyCustomResource>({
  apiVersion: "example.com/v1",
  kind: "MyResource",
  metadata: { name: "my-instance" },
  spec: { replicas: 3, image: "my-app:latest" },
});

await ns.assert<MyCustomResource>({
  apiVersion: "example.com/v1",
  kind: "MyResource",
  name: "my-instance",
  test() {
    // `this` is typed as MyCustomResource
    expect(this.spec.replicas).toBe(3);
  },
});
```

## Environment Variables

| Variable           | Description                                                             |
| ------------------ | ----------------------------------------------------------------------- |
| `KEST_SHOW_REPORT` | Set to `"1"` to show Markdown reports for all tests (not just failures) |
| `KEST_SHOW_EVENTS` | Set to `"1"` to dump raw recorder events for debugging                  |

## License

[MIT](LICENSE)
