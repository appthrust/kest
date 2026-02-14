import type { $ as BunDollar } from "bun";

/**
 * Kest public APIs.
 *
 * This module defines the TypeScript types for Kest's scenario DSL.
 *
 * A {@link Scenario} represents a single run (usually a single test) and exposes
 * high-level actions for interacting with Kubernetes. Most actions are executed
 * with built-in retries: when an action throws, Kest retries it until it
 * succeeds or {@link ActionOptions.timeout} elapses.
 *
 * Some actions also register cleanup ("revert") handlers which run during
 * scenario cleanup. For example, {@link Scenario.apply} registers a revert that
 * deletes the applied resource. One-way mutations such as
 * {@link Scenario.applyStatus} and {@link Scenario.delete} do not register a
 * revert.
 */

/**
 * Scenario-level DSL.
 *
 * A scenario is the top-level entrypoint for interacting with Kubernetes during
 * a test run.
 */
export interface Scenario {
  // Basic actions

  /**
   * Applies a Kubernetes manifest with `kubectl apply`.
   *
   * The manifest is validated and then applied. When the action succeeds, Kest
   * registers a cleanup handler that deletes the resource using
   * `kubectl delete <kind>/<metadata.name>` during scenario cleanup.
   *
   * This action is retried when it throws.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param manifest - YAML string, resource object, or imported YAML module.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await s.apply({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   metadata: { name: "my-config" },
   *   data: { mode: "demo" },
   * });
   * ```
   */
  apply<T extends K8sResource>(
    manifest: ApplyingManifest<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Creates a Kubernetes resource with `kubectl create`.
   *
   * The manifest is validated and then created. When the action succeeds, Kest
   * registers a cleanup handler that deletes the resource using
   * `kubectl delete <kind>/<metadata.name>` during scenario cleanup.
   *
   * Unlike {@link Scenario.apply}, this action uses `kubectl create` which
   * fails if the resource already exists. Use this when you need to ensure the
   * resource is freshly created (e.g. for resources that use `generateName` or
   * when you want to guarantee no prior state).
   *
   * This action is retried when it throws.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param manifest - YAML string, resource object, or imported YAML module.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await s.create({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   metadata: { name: "my-config" },
   *   data: { mode: "demo" },
   * });
   * ```
   */
  create<T extends K8sResource>(
    manifest: ApplyingManifest<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Asserts that `kubectl apply` produces an error.
   *
   * The manifest is applied, and the action succeeds when the API server
   * returns an error (e.g. an admission webhook rejects the request). The
   * `test` callback must also pass for the action to succeed.
   *
   * If the apply unexpectedly succeeds, the created resource is immediately
   * reverted and the action is retried until the expected error occurs or the
   * timeout expires.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param input - Manifest to apply and error assertion callback.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await s.assertApplyError({
   *   apply: {
   *     apiVersion: "example.com/v1",
   *     kind: "MyResource",
   *     metadata: { name: "my-resource" },
   *     spec: { immutableField: "changed" },
   *   },
   *   test() {
   *     expect(this.message).toContain("field is immutable");
   *   },
   * });
   * ```
   */
  assertApplyError<T extends K8sResource>(
    input: AssertApplyErrorInput<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Asserts that `kubectl create` produces an error.
   *
   * The manifest is created, and the action succeeds when the API server
   * returns an error. The `test` callback must also pass for the action to
   * succeed.
   *
   * If the create unexpectedly succeeds, the created resource is immediately
   * reverted and the action is retried until the expected error occurs or the
   * timeout expires.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param input - Manifest to create and error assertion callback.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await s.assertCreateError({
   *   create: {
   *     apiVersion: "v1",
   *     kind: "ConfigMap",
   *     metadata: { name: "already-exists" },
   *   },
   *   test(error) {
   *     expect(error.message).toContain("already exists");
   *   },
   * });
   * ```
   */
  assertCreateError<T extends K8sResource>(
    input: AssertCreateErrorInput<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Applies the `status` subresource using server-side apply.
   *
   * Internally, this uses:
   * `kubectl apply --server-side --subresource=status ...`
   *
   * The provided manifest must include `status`. This is useful for tests that
   * need to simulate controllers by manually setting conditions/fields in
   * `status`.
   *
   * This action is retried when it throws.
   *
   * Note: this is a one-way mutation and does not register a cleanup handler.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param manifest - Resource object that includes a `status` field.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await s.applyStatus({
   *   apiVersion: "example.com/v1",
   *   kind: "HelloWorld",
   *   metadata: { name: "my-hello-world" },
   *   status: {
   *     conditions: [{ type: "Ready", status: "True" }],
   *   },
   * });
   * ```
   */
  applyStatus<T extends K8sResource>(
    manifest: ApplyingManifest<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Deletes a Kubernetes resource using `kubectl delete`.
   *
   * This action is retried when it throws.
   *
   * Note: this is a one-way mutation and does not register a cleanup handler.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind and name of the resource to delete.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await s.delete({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   name: "my-config",
   * });
   * ```
   */
  delete<T extends K8sResource>(
    resource: K8sResourceReference<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Adds, updates, or removes labels on a Kubernetes resource using
   * `kubectl label`.
   *
   * Set a label value to a string to add/update it, or to `null` to remove it.
   *
   * This action is retried when it throws.
   *
   * Note: this is a one-way mutation and does not register a cleanup handler.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param input - Resource reference and label changes.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await s.label({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   name: "my-config",
   *   labels: {
   *     env: "production",  // add or update
   *     deprecated: null,   // remove
   *   },
   * });
   * ```
   */
  label<T extends K8sResource>(
    input: LabelInput<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Fetches a Kubernetes resource and returns it as a typed object.
   *
   * This is a convenience wrapper over {@link Scenario.assert} that verifies the
   * fetched resource has the expected `apiVersion`, `kind`, and `metadata.name`.
   *
   * This action is retried when it throws.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind and name of the resource to fetch.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * type ConfigMap = {
   *   apiVersion: "v1";
   *   kind: "ConfigMap";
   *   metadata: { name: string };
   *   data?: Record<string, string>;
   * };
   *
   * const cm = await s.get<ConfigMap>({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   name: "my-config",
   * });
   * ```
   */
  get<T extends K8sResource>(
    resource: K8sResourceReference<T>,
    options?: undefined | ActionOptions
  ): Promise<T>;

  /**
   * Fetches a Kubernetes resource and runs a test function against it.
   *
   * The `test` callback is invoked with `this` bound to the fetched resource.
   * If the callback throws (or rejects), the assertion fails and the whole
   * action is retried until it succeeds or times out.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Resource selector and test callback.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await s.assert({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   name: "my-config",
   *   test() {
   *     // `this` is the fetched ConfigMap
   *     expect(this.data?.mode).toBe("demo");
   *   },
   * });
   * ```
   */
  assert<T extends K8sResource>(
    resource: ResourceTest<T>,
    options?: undefined | ActionOptions
  ): Promise<T>;

  /**
   * Asserts that a Kubernetes resource does not exist.
   *
   * Internally, this uses `kubectl get` and expects it to fail with a
   * "not found" error. If the resource exists, the assertion fails.
   *
   * This action is retried until the resource is absent or a timeout expires.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind and name of the resource.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await s.assertAbsence({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   name: "deleted-config",
   * });
   * ```
   */
  assertAbsence<T extends K8sResource>(
    resource: K8sResourceReference<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Lists Kubernetes resources of a given type and runs a test function.
   *
   * The `test` callback is invoked with `this` bound to the fetched list.
   * If the callback throws (or rejects), the assertion fails and the whole
   * action is retried until it succeeds or times out.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind selector and list test callback.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await s.assertList({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   test() {
   *     // `this` is the fetched ConfigMap[]
   *     const names = this.map((r) => r.metadata.name);
   *     expect(names.includes("my-config")).toBe(true);
   *   },
   * });
   * ```
   */
  assertList<T extends K8sResource>(
    resource: ResourceListTest<T>,
    options?: undefined | ActionOptions
  ): Promise<Array<T>>;

  /**
   * Fetches a list of Kubernetes resources, asserts that exactly one matches
   * the optional `where` predicate, and runs a test function on it.
   *
   * When `where` is omitted, all resources of the given kind are candidates;
   * the method then asserts that exactly one resource of that kind exists.
   *
   * The `test` callback is invoked with `this` bound to the matching resource.
   * If the callback throws (or rejects), the assertion fails and the whole
   * action is retried until it succeeds or times out.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind selector, optional `where` predicate,
   *   and test callback.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * // Assert exactly one ConfigMap exists and check its data
   * await s.assertOne({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   test() {
   *     expect(this.data?.mode).toBe("demo");
   *   },
   * });
   * ```
   *
   * @example
   * ```ts
   * // Find the one ConfigMap whose name starts with "generated-"
   * await s.assertOne({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   where: (cm) => cm.metadata.name.startsWith("generated-"),
   *   test() {
   *     expect(this.data?.mode).toBe("auto");
   *   },
   * });
   * ```
   */
  assertOne<T extends K8sResource>(
    resource: ResourceOneTest<T>,
    options?: undefined | ActionOptions
  ): Promise<T>;

  /**
   * Creates a new namespace and returns a namespaced API surface.
   *
   * When `name` is omitted, a unique namespace name is generated (e.g.
   * `kest-abc12`). The namespace creation is a mutating action that registers a
   * cleanup handler; the namespace is deleted during scenario cleanup.
   *
   * You can also pass `{ generateName: "prefix-" }` to generate a name with a
   * custom prefix (e.g. `"prefix-d7kpn"`).
   *
   * @param name - Optional namespace name, or `{ generateName }` for prefixed
   *   generation.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * const ns = await s.newNamespace();
   * await ns.apply({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   metadata: { name: "my-config" },
   *   data: { mode: "namespaced" },
   * });
   * ```
   *
   * @example
   * ```ts
   * // Generate a namespace with a custom prefix (e.g. "foo-d7kpn")
   * const ns = await s.newNamespace({ generateName: "foo-" });
   * ```
   */
  newNamespace(
    name?: undefined | string | { readonly generateName: string },
    options?: undefined | ActionOptions
  ): Promise<Namespace>;

  /**
   * Generates a random, Kubernetes-friendly name with the given prefix.
   *
   * This is a pure helper (no kubectl calls). Useful when you need multiple
   * unique names within a single scenario, especially when you need custom
   * metadata (e.g. labels) and can't use {@link Scenario.newNamespace}.
   *
   * @example
   * ```ts
   * // Useful for cluster-scoped resources (names must be unique cluster-wide)
   * const roleName = s.generateName("kest-e2e-role-");
   *
   * await s.create({
   *   apiVersion: "rbac.authorization.k8s.io/v1",
   *   kind: "ClusterRole",
   *   metadata: { name: roleName },
   *   rules: [
   *     {
   *       apiGroups: [""],
   *       resources: ["configmaps"],
   *       verbs: ["get", "list"],
   *     },
   *   ],
   * });
   * ```
   */
  generateName(prefix: string): string;

  // Shell command actions

  /**
   * Executes an arbitrary async function within the scenario.
   *
   * This is useful for glue code that doesn't fit into other actions (e.g.
   * preparing fixtures, calling external tools, or making HTTP requests).
   *
   * If `input.revert` is provided, it will be called during scenario cleanup.
   * The `do` function may be retried when it throws, so it should be written to
   * be safe to re-run (idempotent) whenever possible.
   *
   * The execution context provides Bun Shell `$` for running commands.
   *
   * @see https://bun.com/docs/runtime/shell
   *
   * @template T - Value produced by the `do` function.
   * @param input - Execution function and optional cleanup handler.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * const out = await s.exec({
   *   do: async ({ $ }) => {
   *     const result = await $`echo hello`;
   *     return result.text();
   *   },
   *   revert: async ({ $ }) => {
   *     await $`echo cleanup`;
   *   },
   * });
   * ```
   */
  exec<T>(input: ExecInput<T>, options?: undefined | ActionOptions): Promise<T>;

  // Multi-cluster actions

  /**
   * Creates a cluster-bound API surface.
   *
   * The returned {@link Cluster} uses the provided kubeconfig/context for all
   * actions. It does not create any resources by itself.
   *
   * @param cluster - Target kubeconfig and/or context.
   *
   * @example
   * ```ts
   * const c = await s.useCluster({ context: "kind-kind" });
   * const ns = await c.newNamespace("my-ns");
   * await ns.apply({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   metadata: { name: "my-config" },
   *   data: { mode: "cluster" },
   * });
   * ```
   */
  useCluster(cluster: ClusterReference): Promise<Cluster>;

  // BDD(behavior-driven development) actions

  /**
   * Records a "Given" step for reporting.
   *
   * This does not affect execution; it is used by reporters to render readable
   * test output.
   *
   * @example
   * ```ts
   * s.given("a namespace exists");
   * ```
   */
  given(description: string): void;

  /**
   * Records a "When" step for reporting.
   *
   * @example
   * ```ts
   * s.when("apply a ConfigMap");
   * ```
   */
  when(description: string): void;

  /**
   * Records a "Then" step for reporting.
   *
   * @example
   * ```ts
   * s.then("the ConfigMap is present");
   * ```
   */
  then(description: string): void;

  /**
   * Records an "And" step for reporting.
   *
   * @example
   * ```ts
   * s.and("it has expected data");
   * ```
   */
  and(description: string): void;

  /**
   * Records a "But" step for reporting.
   *
   * @example
   * ```ts
   * s.but("it is not modified by other tests");
   * ```
   */
  but(description: string): void;
}

/**
 * Cluster-bound API surface.
 *
 * This is equivalent to {@link Scenario} basic actions, but with kubectl context
 * bound to a specific Kubernetes cluster.
 */
export interface Cluster {
  /**
   * Applies a Kubernetes manifest with `kubectl apply` and registers cleanup.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param manifest - YAML string, resource object, or imported YAML module.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await cluster.apply({
   *   apiVersion: "v1",
   *   kind: "Namespace",
   *   metadata: { name: "my-team" },
   * });
   * ```
   */
  apply<T extends K8sResource>(
    manifest: ApplyingManifest<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Creates a Kubernetes resource with `kubectl create` and registers cleanup.
   *
   * Unlike {@link Cluster.apply}, this uses `kubectl create` which fails if the
   * resource already exists.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param manifest - YAML string, resource object, or imported YAML module.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await cluster.create({
   *   apiVersion: "v1",
   *   kind: "Namespace",
   *   metadata: { name: "my-team" },
   * });
   * ```
   */
  create<T extends K8sResource>(
    manifest: ApplyingManifest<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Asserts that `kubectl apply` produces an error.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param input - Manifest to apply and error assertion callback.
   * @param options - Retry options such as timeout and polling interval.
   */
  assertApplyError<T extends K8sResource>(
    input: AssertApplyErrorInput<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Asserts that `kubectl create` produces an error.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param input - Manifest to create and error assertion callback.
   * @param options - Retry options such as timeout and polling interval.
   */
  assertCreateError<T extends K8sResource>(
    input: AssertCreateErrorInput<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Applies the `status` subresource using server-side apply.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param manifest - Resource object that includes a `status` field.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await cluster.applyStatus({
   *   apiVersion: "example.com/v1",
   *   kind: "HelloWorld",
   *   metadata: { name: "my-hello-world" },
   *   status: { conditions: [{ type: "Ready", status: "True" }] },
   * });
   * ```
   */
  applyStatus<T extends K8sResource>(
    manifest: ApplyingManifest<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Deletes a Kubernetes resource in this cluster using `kubectl delete`.
   *
   * This action is retried when it throws.
   *
   * Note: this is a one-way mutation and does not register a cleanup handler.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind and name of the resource to delete.
   * @param options - Retry options such as timeout and polling interval.
   */
  delete<T extends K8sResource>(
    resource: K8sResourceReference<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Adds, updates, or removes labels on a Kubernetes resource in this cluster
   * using `kubectl label`.
   *
   * Set a label value to a string to add/update it, or to `null` to remove it.
   *
   * This action is retried when it throws.
   *
   * Note: this is a one-way mutation and does not register a cleanup handler.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param input - Resource reference and label changes.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await cluster.label({
   *   apiVersion: "v1",
   *   kind: "Namespace",
   *   name: "my-team",
   *   labels: {
   *     team: "backend",
   *     deprecated: null,
   *   },
   * });
   * ```
   */
  label<T extends K8sResource>(
    input: LabelInput<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Fetches a Kubernetes resource by GVK and name.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind and name of the resource to fetch.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * const ns = await cluster.get({
   *   apiVersion: "v1",
   *   kind: "Namespace",
   *   name: "default",
   * });
   * ```
   */
  get<T extends K8sResource>(
    resource: K8sResourceReference<T>,
    options?: undefined | ActionOptions
  ): Promise<T>;

  /**
   * Fetches a Kubernetes resource and runs a test function against it.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Resource selector and test callback.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await cluster.assert({
   *   apiVersion: "v1",
   *   kind: "Namespace",
   *   name: "kube-system",
   *   test() {
   *     expect(this.metadata.name).toBe("kube-system");
   *   },
   * });
   * ```
   */
  assert<T extends K8sResource>(
    resource: ResourceTest<T>,
    options?: undefined | ActionOptions
  ): Promise<T>;

  /**
   * Asserts that a Kubernetes resource does not exist in this cluster.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind and name of the resource.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await cluster.assertAbsence({
   *   apiVersion: "v1",
   *   kind: "Namespace",
   *   name: "deleted-ns",
   * });
   * ```
   */
  assertAbsence<T extends K8sResource>(
    resource: K8sResourceReference<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Lists Kubernetes resources of a given type and runs a test function.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind selector and list test callback.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await cluster.assertList({
   *   apiVersion: "v1",
   *   kind: "Namespace",
   *   test() {
   *     expect(this.length > 0).toBe(true);
   *   },
   * });
   * ```
   */
  assertList<T extends K8sResource>(
    resource: ResourceListTest<T>,
    options?: undefined | ActionOptions
  ): Promise<Array<T>>;

  /**
   * Fetches a list of Kubernetes resources, asserts that exactly one matches
   * the optional `where` predicate, and runs a test function on it.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind selector, optional `where` predicate,
   *   and test callback.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await cluster.assertOne({
   *   apiVersion: "v1",
   *   kind: "Namespace",
   *   where: (ns) => ns.metadata.name === "my-namespace",
   *   test() {
   *     expect(this.metadata.labels?.env).toBe("production");
   *   },
   * });
   * ```
   */
  assertOne<T extends K8sResource>(
    resource: ResourceOneTest<T>,
    options?: undefined | ActionOptions
  ): Promise<T>;

  /**
   * Creates a new namespace in this cluster and returns a namespaced API.
   *
   * @param name - Optional namespace name, or `{ generateName }` for prefixed
   *   generation.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * const ns = await cluster.newNamespace("my-ns");
   * await ns.apply({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   metadata: { name: "my-config" },
   *   data: { mode: "from-cluster" },
   * });
   * ```
   *
   * @example
   * ```ts
   * // Generate a namespace with a custom prefix
   * const ns = await cluster.newNamespace({ generateName: "foo-" });
   * ```
   */
  newNamespace(
    name?: undefined | string | { readonly generateName: string },
    options?: undefined | ActionOptions
  ): Promise<Namespace>;
}

/**
 * Namespace-bound API surface.
 *
 * A {@link Namespace} is typically obtained via {@link Scenario.newNamespace} or
 * {@link Cluster.newNamespace}.
 *
 * Operations are scoped by setting the kubectl namespace context (equivalent to
 * passing `kubectl -n <namespace>`).
 *
 * Kest does not rewrite your manifests. For write operations
 * ({@link Namespace.apply} and {@link Namespace.applyStatus}), treat this API as
 * the source of truth for the target namespace:
 *
 * - Prefer omitting `metadata.namespace` in manifests; kubectl will apply the
 *   resource into this namespace.
 * - If `metadata.namespace` is set, it must match this namespace. A mismatch
 *   causes `kubectl` to fail.
 */
export interface Namespace {
  /**
   * The name of this namespace (e.g. `"kest-abc12"`).
   */
  readonly name: string;

  /**
   * Applies a Kubernetes manifest in this namespace and registers cleanup.
   *
   * The target namespace is controlled by this {@link Namespace} instance.
   * Prefer omitting `manifest.metadata.namespace`; if it is set, it must match
   * this namespace (otherwise `kubectl` fails).
   *
   * @template T - The expected Kubernetes resource shape.
   * @param manifest - YAML string, resource object, or imported YAML module.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * const ns = await s.newNamespace("my-ns");
   * await ns.apply({
   *   apiVersion: "v1",
   *   kind: "Secret",
   *   metadata: { name: "my-secret" },
   *   type: "Opaque",
   *   stringData: { password: "s3cr3t" },
   * });
   * ```
   */
  apply<T extends K8sResource>(
    manifest: ApplyingManifest<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Creates a Kubernetes resource in this namespace with `kubectl create` and
   * registers cleanup.
   *
   * The target namespace is controlled by this {@link Namespace} instance.
   * Prefer omitting `manifest.metadata.namespace`; if it is set, it must match
   * this namespace (otherwise `kubectl` fails).
   *
   * Unlike {@link Namespace.apply}, this uses `kubectl create` which fails if
   * the resource already exists.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param manifest - YAML string, resource object, or imported YAML module.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * const ns = await s.newNamespace("my-ns");
   * await ns.create({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   metadata: { name: "my-config" },
   *   data: { mode: "demo" },
   * });
   * ```
   */
  create<T extends K8sResource>(
    manifest: ApplyingManifest<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Asserts that `kubectl apply` produces an error in this namespace.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param input - Manifest to apply and error assertion callback.
   * @param options - Retry options such as timeout and polling interval.
   */
  assertApplyError<T extends K8sResource>(
    input: AssertApplyErrorInput<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Asserts that `kubectl create` produces an error in this namespace.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param input - Manifest to create and error assertion callback.
   * @param options - Retry options such as timeout and polling interval.
   */
  assertCreateError<T extends K8sResource>(
    input: AssertCreateErrorInput<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Applies the `status` subresource in this namespace using server-side apply.
   *
   * The target namespace is controlled by this {@link Namespace} instance.
   * Prefer omitting `manifest.metadata.namespace`; if it is set, it must match
   * this namespace (otherwise `kubectl` fails).
   *
   * @template T - The expected Kubernetes resource shape.
   * @param manifest - Resource object that includes a `status` field.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await ns.applyStatus({
   *   apiVersion: "example.com/v1",
   *   kind: "HelloWorld",
   *   metadata: { name: "my-hello-world" },
   *   status: { conditions: [{ type: "Ready", status: "True" }] },
   * });
   * ```
   */
  applyStatus<T extends K8sResource>(
    manifest: ApplyingManifest<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Deletes a Kubernetes resource in this namespace using `kubectl delete`.
   *
   * This action is retried when it throws.
   *
   * Note: this is a one-way mutation and does not register a cleanup handler.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind and name of the resource to delete.
   * @param options - Retry options such as timeout and polling interval.
   */
  delete<T extends K8sResource>(
    resource: K8sResourceReference<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Adds, updates, or removes labels on a namespaced Kubernetes resource using
   * `kubectl label`.
   *
   * The target namespace is controlled by this {@link Namespace} instance.
   *
   * Set a label value to a string to add/update it, or to `null` to remove it.
   *
   * This action is retried when it throws.
   *
   * Note: this is a one-way mutation and does not register a cleanup handler.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param input - Resource reference and label changes.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await ns.label({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   name: "my-config",
   *   labels: {
   *     env: "production",
   *     deprecated: null,
   *   },
   * });
   * ```
   */
  label<T extends K8sResource>(
    input: LabelInput<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Fetches a namespaced Kubernetes resource by GVK and name.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind and name of the resource to fetch.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * const cm = await ns.get({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   name: "my-config",
   * });
   * ```
   */
  get<T extends K8sResource>(
    resource: K8sResourceReference<T>,
    options?: undefined | ActionOptions
  ): Promise<T>;

  /**
   * Fetches a namespaced Kubernetes resource and runs a test function.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Resource selector and test callback.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await ns.assert({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   name: "my-config",
   *   test() {
   *     expect(this.data !== undefined).toBe(true);
   *   },
   * });
   * ```
   */
  assert<T extends K8sResource>(
    resource: ResourceTest<T>,
    options?: undefined | ActionOptions
  ): Promise<T>;

  /**
   * Asserts that a namespaced Kubernetes resource does not exist.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind and name of the resource.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await ns.assertAbsence({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   name: "deleted-config",
   * });
   * ```
   */
  assertAbsence<T extends K8sResource>(
    resource: K8sResourceReference<T>,
    options?: undefined | ActionOptions
  ): Promise<void>;

  /**
   * Lists namespaced Kubernetes resources of a given type and runs a test.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind selector and list test callback.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await ns.assertList({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   test() {
   *     expect(this.some((c) => c.metadata.name === "my-config")).toBe(true);
   *   },
   * });
   * ```
   */
  assertList<T extends K8sResource>(
    resource: ResourceListTest<T>,
    options?: undefined | ActionOptions
  ): Promise<Array<T>>;

  /**
   * Fetches a list of namespaced Kubernetes resources, asserts that exactly one
   * matches the optional `where` predicate, and runs a test function on it.
   *
   * @template T - The expected Kubernetes resource shape.
   * @param resource - Group/version/kind selector, optional `where` predicate,
   *   and test callback.
   * @param options - Retry options such as timeout and polling interval.
   *
   * @example
   * ```ts
   * await ns.assertOne({
   *   apiVersion: "v1",
   *   kind: "ConfigMap",
   *   where: (cm) => cm.metadata.name.startsWith("generated-"),
   *   test() {
   *     expect(this.data?.mode).toBe("auto");
   *   },
   * });
   * ```
   */
  assertOne<T extends K8sResource>(
    resource: ResourceOneTest<T>,
    options?: undefined | ActionOptions
  ): Promise<T>;
}

/**
 * Retry configuration for scenario actions.
 *
 * These options are forwarded to Kest's retry mechanism.
 *
 * - `timeout` defaults to `"5s"`
 * - `interval` defaults to `"200ms"`
 *
 * Durations are expressed as strings such as `"30s"`, `"200ms"`, or `"1m"`.
 */
export interface ActionOptions {
  /**
   * Maximum duration to keep retrying an action.
   */
  readonly timeout?: undefined | string;

  /**
   * Delay between retry attempts.
   */
  readonly interval?: undefined | string;
}

/**
 * Input to {@link Scenario.exec}.
 */
export interface ExecInput<T = unknown> {
  /**
   * Execute arbitrary processing and return its value.
   *
   * Note: this function may be retried when it throws and `options.timeout`
   * allows it (same as other actions), so prefer idempotent operations.
   */
  readonly do: (context: ExecContext) => Promise<T>;

  /**
   * Optional cleanup invoked during scenario cleanup (revert phase).
   *
   * When omitted, no cleanup is performed.
   */
  readonly revert?: undefined | ((context: ExecContext) => Promise<void>);
}

/**
 * Context object passed to {@link ExecInput.do} and {@link ExecInput.revert}.
 */
export interface ExecContext {
  /**
   * Bun shell helper from `import { $ } from "bun"`.
   *
   * @see https://bun.com/docs/runtime/shell
   */
  readonly $: BunDollar;
}

/**
 * Identifies a Kubernetes resource by group/version/kind and name.
 *
 * Used by {@link Scenario.get}.
 */
export interface K8sResourceReference<T extends K8sResource = K8sResource> {
  /**
   * Kubernetes API version (e.g. `"v1"`, `"apps/v1"`).
   */
  readonly apiVersion: T["apiVersion"];

  /**
   * Kubernetes kind (e.g. `"ConfigMap"`, `"Deployment"`).
   */
  readonly kind: T["kind"];

  /**
   * `metadata.name` of the target resource.
   */
  readonly name: string;
}

/**
 * Input for {@link Scenario.label}, {@link Cluster.label}, and
 * {@link Namespace.label}.
 *
 * Identifies a Kubernetes resource and the label changes to apply.
 *
 * - A label value of `string` adds or updates the label.
 * - A label value of `null` removes the label.
 */
export interface LabelInput<T extends K8sResource = K8sResource> {
  /**
   * Kubernetes API version (e.g. `"v1"`, `"apps/v1"`).
   */
  readonly apiVersion: T["apiVersion"];

  /**
   * Kubernetes kind (e.g. `"ConfigMap"`, `"Deployment"`).
   */
  readonly kind: T["kind"];

  /**
   * `metadata.name` of the target resource.
   */
  readonly name: string;

  /**
   * Optional namespace override.
   *
   * When used on a {@link Namespace}-scoped API surface the namespace is
   * already set; this field is mainly useful at the {@link Scenario} or
   * {@link Cluster} level for namespaced resources.
   */
  readonly namespace?: undefined | string;

  /**
   * Label mutations to apply.
   *
   * - `"value"` -- add or update the label to the given value.
   * - `null` -- remove the label.
   */
  readonly labels: Readonly<Record<string, string | null>>;

  /**
   * When `true`, passes `--overwrite` to allow updating labels that already
   * exist on the resource.
   *
   * @default false
   */
  readonly overwrite?: undefined | boolean;
}

/**
 * A test definition for {@link Scenario.assert}.
 */
export interface ResourceTest<T extends K8sResource = K8sResource> {
  /**
   * Kubernetes API version (e.g. `"v1"`, `"apps/v1"`).
   */
  readonly apiVersion: T["apiVersion"];

  /**
   * Kubernetes kind (e.g. `"ConfigMap"`, `"Deployment"`).
   */
  readonly kind: T["kind"];

  /**
   * `metadata.name` of the target resource.
   */
  readonly name: string;

  /**
   * Assertion callback.
   *
   * The callback is invoked with `this` bound to the fetched resource.
   * Throwing (or rejecting) signals a failed assertion.
   */
  readonly test: (this: T, resource: T) => unknown | Promise<unknown>;
}

/**
 * A test definition for {@link Scenario.assertList}.
 */
export interface ResourceListTest<T extends K8sResource = K8sResource> {
  /**
   * Kubernetes API version (e.g. `"v1"`, `"apps/v1"`).
   */
  readonly apiVersion: T["apiVersion"];

  /**
   * Kubernetes kind (e.g. `"ConfigMap"`, `"Deployment"`).
   */
  readonly kind: T["kind"];

  /**
   * Assertion callback.
   *
   * The callback is invoked with `this` bound to the fetched resource list.
   * Throwing (or rejecting) signals a failed assertion.
   */
  readonly test: (
    this: Array<T>,
    resources: Array<T>
  ) => unknown | Promise<unknown>;
}

/**
 * A test definition for {@link Scenario.assertOne}.
 *
 * Fetches a list of resources, filters by an optional `where` predicate, asserts
 * that exactly one resource matches, then runs the `test` callback on it.
 */
export interface ResourceOneTest<T extends K8sResource = K8sResource> {
  /**
   * Kubernetes API version (e.g. `"v1"`, `"apps/v1"`).
   */
  readonly apiVersion: T["apiVersion"];

  /**
   * Kubernetes kind (e.g. `"ConfigMap"`, `"Deployment"`).
   */
  readonly kind: T["kind"];

  /**
   * Optional predicate to narrow which resources are candidates.
   *
   * When omitted, all resources of the given kind are candidates.
   * Combined with the strict uniqueness check this means "assert there is
   * exactly one resource of this kind."
   */
  readonly where?: undefined | ((resource: T) => boolean);

  /**
   * Assertion callback.
   *
   * The callback is invoked with `this` bound to the single matching resource.
   * Throwing (or rejecting) signals a failed assertion.
   */
  readonly test: (this: T, resource: T) => unknown | Promise<unknown>;
}

/**
 * A test definition for {@link Scenario.assertApplyError},
 * {@link Cluster.assertApplyError}, and {@link Namespace.assertApplyError}.
 *
 * Attempts `kubectl apply` and asserts that the API server returns an error.
 * When the operation errors as expected, the `test` callback is invoked with
 * `this` bound to the {@link Error}.
 */
export interface AssertApplyErrorInput<T extends K8sResource = K8sResource> {
  /**
   * The manifest to apply. Accepts the same formats as {@link Scenario.apply}:
   * an object literal, a YAML string, or an imported YAML module.
   */
  readonly apply: ApplyingManifest<T>;

  /**
   * Assertion callback invoked when the apply errors as expected.
   *
   * `this` is bound to the {@link Error} returned by the API server.
   * Throwing (or rejecting) signals that the error did not match expectations
   * and triggers a retry (if timeout allows).
   */
  readonly test: (this: Error, error: Error) => unknown | Promise<unknown>;
}

/**
 * A test definition for {@link Scenario.assertCreateError},
 * {@link Cluster.assertCreateError}, and {@link Namespace.assertCreateError}.
 *
 * Attempts `kubectl create` and asserts that the API server returns an error.
 * When the operation errors as expected, the `test` callback is invoked with
 * `this` bound to the {@link Error}.
 */
export interface AssertCreateErrorInput<T extends K8sResource = K8sResource> {
  /**
   * The manifest to create. Accepts the same formats as {@link Scenario.create}:
   * an object literal, a YAML string, or an imported YAML module.
   */
  readonly create: ApplyingManifest<T>;

  /**
   * Assertion callback invoked when the create errors as expected.
   *
   * `this` is bound to the {@link Error} returned by the API server.
   * Throwing (or rejecting) signals that the error did not match expectations
   * and triggers a retry (if timeout allows).
   */
  readonly test: (this: Error, error: Error) => unknown | Promise<unknown>;
}

/**
 * Kubernetes cluster selector for {@link Scenario.useCluster}.
 */
export interface ClusterReference {
  /**
   * Path to a kubeconfig file to use for this cluster.
   */
  readonly kubeconfig?: undefined | string;

  /**
   * kubeconfig context name to use for this cluster.
   */
  readonly context?: undefined | string;
}

/**
 * A Kubernetes manifest accepted by Kest actions.
 *
 * This flexibility is intended to make tests ergonomic:
 *
 * - pass YAML as a string
 * - pass an object literal
 * - `import manifest from "./resource.yaml"` and pass the module
 */
export type ApplyingManifest<T extends K8sResource = K8sResource> =
  | string // YAML string
  | T
  | ImportedYaml
  | Promise<ImportedYaml>;

/**
 * Minimal shape of a Kubernetes resource.
 *
 * Kest treats resources as plain objects and only relies on a few common fields
 * (`apiVersion`, `kind`, and `metadata.name`).
 */
export interface K8sResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string | undefined;
    labels?: Record<string, string> | undefined;
    annotations?: Record<string, string> | undefined;
    resourceVersion?: string | undefined;
    uid?: string | undefined;
    creationTimestamp?: string | undefined;
    generation?: number | undefined;
    finalizers?: ReadonlyArray<string> | undefined;
    ownerReferences?:
      | ReadonlyArray<{
          apiVersion: string;
          kind: string;
          name: string;
          uid: string;
          controller?: boolean | undefined;
          blockOwnerDeletion?: boolean | undefined;
        }>
      | undefined;
    deletionTimestamp?: string | undefined;
    deletionGracePeriodSeconds?: number | undefined;
    generateName?: string | undefined;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Shape of `import manifest from "./resource.yaml"`.
 */
export interface ImportedYaml {
  readonly default: unknown;
}
