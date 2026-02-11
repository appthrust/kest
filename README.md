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

### Create Resources

Use `kubectl create` instead of `kubectl apply` when you need to ensure a resource is freshly created (e.g. the resource must not already exist, or you want to use `generateName`):

```ts
await ns.create({
  apiVersion: "v1",
  kind: "ConfigMap",
  metadata: { name: "my-config" },
  data: { mode: "demo" },
});
```

Like `apply`, `create` registers a cleanup handler that deletes the resource when the test ends. The key difference is that `kubectl create` fails if the resource already exists, whereas `kubectl apply` performs an upsert.

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
    env: "production", // add a label
    deprecated: null, // remove a label
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

When a test fails (or when `KEST_SHOW_REPORT=1` is set), Kest generates a detailed Markdown report showing every action, the exact `kubectl` commands executed (including stdin manifests), stdout/stderr output, and cleanup results. This provides full transparency into what happened during the test, making troubleshooting straightforward -- for both humans and AI assistants.

````markdown
# ConfigMap lifecycle

## Scenario Overview

| #   | Action                         | Status |
| --- | ------------------------------ | ------ |
| 1   | Apply Namespace `kest-9hdhj`   | ✅     |
| 2   | Apply `ConfigMap` "my-config"  | ✅     |
| 3   | Assert `ConfigMap` "my-config" | ✅     |

## Scenario Details

### Given: a namespace exists

**✅ Apply Namespace `kest-9hdhj`**

```shell
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: kest-9hdhj
EOF
```

...

### Cleanup

| #   | Action                         | Status |
| --- | ------------------------------ | ------ |
| 1   | Delete `ConfigMap` "my-config" | ✅     |
| 2   | Delete Namespace `kest-9hdhj`  | ✅     |

```shellsession
$ kubectl delete ConfigMap/my-config -n kest-9hdhj
configmap "my-config" deleted

$ kubectl delete namespace/kest-9hdhj
namespace "kest-9hdhj" deleted
```
````

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

| Method                                                                  | Description                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `apply(manifest, options?)`                                             | Apply a Kubernetes manifest and register cleanup            |
| `create(manifest, options?)`                                            | Create a Kubernetes resource and register cleanup           |
| `applyStatus(manifest, options?)`                                       | Apply a status subresource (server-side apply)              |
| `delete(resource, options?)`                                            | Delete a resource by API version, kind, and name            |
| `label(input, options?)`                                                | Add, update, or remove labels on a resource                 |
| `get(resource, options?)`                                               | Fetch a resource by API version, kind, and name             |
| `assert(resource, options?)`                                            | Fetch a resource and run assertions with retries            |
| `assertAbsence(resource, options?)`                                     | Assert that a resource does not exist                       |
| `assertList(resource, options?)`                                        | Fetch a list of resources and run assertions                |
| `newNamespace(name?, options?)`                                         | Create an ephemeral namespace (supports `{ generateName }`) |
| `generateName(prefix)`                                                  | Generate a random-suffix name (statistical uniqueness)      |
| `exec(input, options?)`                                                 | Execute shell commands with optional revert                 |
| `useCluster(ref)`                                                       | Create a cluster-bound API surface                          |
| `given(desc)` / `when(desc)` / `then(desc)` / `and(desc)` / `but(desc)` | BDD annotations for reporting                               |

### Namespace / Cluster

Returned by `newNamespace()` and `useCluster()` respectively. They expose the same core methods (`apply`, `create`, `applyStatus`, `delete`, `label`, `get`, `assert`, `assertAbsence`, `assertList`) scoped to their namespace or cluster context. `Cluster` additionally supports `newNamespace`.

### Action Options

All actions accept an optional options object for retry configuration.

| Option     | Type     | Default   | Description                  |
| ---------- | -------- | --------- | ---------------------------- |
| `timeout`  | `string` | `"5s"`    | Maximum retry duration       |
| `interval` | `string` | `"200ms"` | Delay between retry attempts |

Duration strings support units like `"200ms"`, `"5s"`, `"1m"`.

## Best Practices

### Test API contracts, not controllers

E2E tests should describe **how an API behaves from the user's perspective**, not how a specific controller implements that behavior internally. The subject of every test should be the API resource, not the controller behind it.

Why? Controllers are an implementation detail. They get renamed, split, merged, or rewritten -- but as long as the API contract is unchanged, users are unaffected. If your tests are written in terms of controllers, a harmless refactor can break your entire test suite.

```ts
// ✅ Good — the subject is the API resource
test("Tenant API creates namespaces for each tenant", async (s) => {
  s.given("a Tenant resource is applied");
  const ns = await s.newNamespace();
  await ns.apply({
    apiVersion: "example.com/v1",
    kind: "Tenant",
    metadata: { name: "acme" },
    spec: { namespaces: ["dev", "staging"] },
  });

  s.then("the Tenant reports Ready=True");
  await ns.assert({
    apiVersion: "example.com/v1",
    kind: "Tenant",
    name: "acme",
    test() {
      expect(this.status?.conditions).toContainEqual(
        expect.objectContaining({ type: "Ready", status: "True" }),
      );
    },
  });
});
```

```ts
// ❌ Bad — the subject is the controller (implementation detail)
test("tenant-controller creates namespaces", async (s) => {
  s.given("tenant-controller is running");
  // ...
  s.then("tenant-controller creates child namespaces");
  // ...
});
```

The same principle applies to BDD annotations -- keep `s.given()`, `s.when()`, and `s.then()` free of controller names:

| ❌ Controller-centric | ✅ API-centric |
| --- | --- |
| `s.given("tenant-controller is running")` | `s.given("a Tenant resource exists")` |
| `s.when("tenant-controller reconciles")` | `s.when("the Tenant spec is updated")` |
| `s.then("tenant-controller creates a Namespace")` | `s.then("the expected Namespace exists")` |

### Choosing what to test in E2E

E2E tests are powerful for validating **user-observable behavior** but expensive for verifying internal details. Placing implementation details in E2E tests makes refactoring harder without giving users any extra confidence.

**Good candidates for E2E (API contract):**

- Status transitions -- e.g. a resource reaches `Ready=True` after creation
- Error feedback -- e.g. invalid input produces an explanatory condition like `Ready=False, reason=InvalidSpec`
- User-facing side effects -- e.g. resources that users are expected to observe or interact with

```ts
// ✅ Assert a user-observable status condition
await ns.assert({
  apiVersion: "example.com/v1",
  kind: "Database",
  name: "my-db",
  test() {
    expect(this.status?.conditions).toContainEqual(
      expect.objectContaining({ type: "Ready", status: "True" }),
    );
  },
});
```

**Better left to unit / integration tests (implementation details):**

- Internal label keys, annotation formats, or hash values
- Intermediate resources that users don't directly interact with
- Controller-internal reconciliation logic and branching

```ts
// ❌ Avoid — internal label format is an implementation detail
await ns.assert({
  apiVersion: "example.com/v1",
  kind: "Database",
  name: "my-db",
  test() {
    // This label may change without affecting users
    expect(this.metadata?.labels?.["internal.example.com/config-hash"]).toBe(
      "a1b2c3",
    );
  },
});
```

When you find yourself wanting to E2E-test an intermediate resource, ask: *"Is this part of the public API contract?"* If yes, document it as such and test it. If no, push the assertion down to a cheaper test layer and keep E2E focused on what users actually see.

### Organizing test files

Structure test directories around **API resources**, not controllers. This makes the test suite resilient to internal refactoring and immediately tells readers *which API behavior* is being verified.

```
# ✅ Good — organized by API resource
tests/e2e/
├── tenant-api/
│   ├── creation.test.ts
│   └── deletion.test.ts
├── database-api/
│   └── provisioning.test.ts

# ❌ Bad — organized by controller (implementation detail)
tests/e2e/
├── tenant-controller/
│   ├── creation.test.ts
│   └── deletion.test.ts
├── database-controller/
│   └── provisioning.test.ts
```

**Refactoring-friendliness checklist** -- the more "yes" answers, the better your E2E tests:

- [ ] Is the subject of every test an API resource (not a controller)?
- [ ] Can a reader understand the test from the manifest and assertions alone?
- [ ] Do `then` assertions only check user-observable state (`status`, contracted outputs)?
- [ ] Would splitting, merging, or renaming controllers leave all tests passing?

### Avoiding naming collisions between tests

When tests run in parallel, hard-coded resource names can collide (especially when you create cluster-scoped resources).

Kest offers a few ways to avoid these collisions:

- Use `s.newNamespace()` to isolate namespaced resources per test (recommended default).
- Use `s.newNamespace({ generateName: "prefix-" })` to keep isolation while making the namespace name easier to recognize in logs/reports.
- Use `s.generateName("prefix-")` to generate a random-suffix name when you need additional names outside of `newNamespace` (e.g. cluster-scoped resources).

`s.newNamespace(...)` actually creates the `Namespace` via `kubectl create` and retries on name collisions (regenerating a new name each attempt), so once it succeeds the namespace name is unique in the cluster. `s.generateName(...)` is a pure string helper and provides **statistical uniqueness** only (collisions are extremely unlikely, but not impossible).

```ts
s.given("a cluster-scoped resource name should not collide with other tests");
const roleName = s.generateName("kest-e2e-role-");

await s.create({
  apiVersion: "rbac.authorization.k8s.io/v1",
  kind: "ClusterRole",
  metadata: { name: roleName },
  rules: [
    {
      apiGroups: [""],
      resources: ["configmaps"],
      verbs: ["get", "list"],
    },
  ],
});
```

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
