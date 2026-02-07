import type { K8sResource } from "../apis";
import type { Recorder } from "../recording";
import { stringifyYaml } from "../yaml";

export interface KubectlContext {
  readonly namespace?: undefined | string;
  readonly context?: undefined | string;
  readonly kubeconfig?: undefined | string;
  /**
   * Field manager name used for server-side apply operations.
   *
   * Ref: `kubectl apply --server-side --field-manager=<name>`
   */
  readonly fieldManagerName?: undefined | string;
}

export type KubectlPatch =
  | Record<string, unknown>
  | ReadonlyArray<unknown>
  | string;

export type KubectlPatchType = "json" | "merge" | "strategic";

export interface KubectlPatchOptions {
  readonly type?: undefined | KubectlPatchType;
  readonly context?: undefined | KubectlContext;
}

export interface KubectlDeps {
  readonly recorder: Recorder;
  /**
   * Working directory for kubectl command execution.
   * Typically scenario/workspace root.
   */
  readonly cwd?: undefined | string;
}

/**
 * Kubernetes CLI (kubectl) wrapper for executing kubectl commands.
 */
export interface Kubectl {
  /**
   * Returns a new Kubectl instance with merged context settings.
   * The returned instance inherits the current default context,
   * with the provided overrides applied on top.
   *
   * @param overrideContext - Context settings to merge (namespace, context, kubeconfig)
   * @returns A new Kubectl instance with the merged context
   */
  extends(overrideContext: KubectlContext): Kubectl;

  /**
   * Applies a Kubernetes resource using `kubectl apply -f -`.
   * The resource is serialized to YAML and passed via stdin.
   *
   * @param resource - The K8s resource object to apply
   * @param context - Optional context overrides for this call
   * @returns The trimmed stdout from kubectl (e.g., "configmap/my-config created")
   * @throws Error if kubectl exits with non-zero code
   */
  apply(resource: K8sResource, context?: KubectlContext): Promise<string>;

  /**
   * Applies the `status` subresource using server-side apply:
   *
   * `kubectl apply --server-side --field-manager=<name> --subresource=status -f -`
   *
   * @param resource - The K8s resource object (must include `status`)
   * @param context - Optional context overrides for this call
   * @returns The trimmed stdout from kubectl
   * @throws Error if fieldManagerName is missing or kubectl exits with non-zero code
   */
  applyStatus(resource: K8sResource, context?: KubectlContext): Promise<string>;

  /**
   * Creates a Kubernetes resource using `kubectl create -f -`.
   * The resource is serialized to YAML and passed via stdin.
   *
   * @param resource - The K8s resource object to create
   * @param context - Optional context overrides for this call
   * @returns The trimmed stdout from kubectl (e.g., "configmap/my-config created")
   * @throws Error if kubectl exits with non-zero code
   */
  create(resource: K8sResource, context?: KubectlContext): Promise<string>;

  /**
   * Retrieves a Kubernetes resource using `kubectl get <resource>/<name> -o yaml`.
   *
   * @param type - The resource type (e.g., "Pod", "Pod.v1", "Some.v1.custom-resource-group.example.com")
   * @param name - The name of the resource to get
   * @param context - Optional context overrides for this call
   * @returns The resource as YAML string
   * @throws Error if kubectl exits with non-zero code
   */
  get(type: string, name: string, context?: KubectlContext): Promise<string>;

  /**
   * Lists Kubernetes resources using `kubectl get <resource> -o yaml`.
   *
   * @param type - The resource type (e.g., "pods", "deployments.v1.apps")
   * @param context - Optional context overrides for this call
   * @returns The resource list as YAML string
   * @throws Error if kubectl exits with non-zero code
   */
  list(type: string, context?: KubectlContext): Promise<string>;

  /**
   * Patches a Kubernetes resource using `kubectl patch <resource>/<name>`.
   *
   * @param resource - The resource type (e.g., "configmap", "deployment.v1.apps")
   * @param name - The name of the resource to patch
   * @param patch - Patch body (object/array will be JSON-encoded)
   * @param options - Optional patch options (type, context)
   * @returns The trimmed stdout from kubectl (e.g., "configmap/my-config patched")
   * @throws Error if kubectl exits with non-zero code
   */
  patch(
    resource: string,
    name: string,
    patch: KubectlPatch,
    options?: KubectlPatchOptions
  ): Promise<string>;

  /**
   * Deletes a Kubernetes resource using `kubectl delete <resource>/<name>`.
   *
   * @param resource - The resource type (e.g., "configmap", "namespace")
   * @param name - The name of the resource to delete
   * @param options - Optional delete options (ignoreNotFound, context)
   * @returns The trimmed stdout from kubectl (e.g., "configmap \"my-config\" deleted")
   * @throws Error if kubectl exits with non-zero code
   */
  delete(
    resource: string,
    name: string,
    options?: KubectlDeleteOptions
  ): Promise<string>;

  /**
   * Adds, updates, or removes labels on a Kubernetes resource using
   * `kubectl label <resource>/<name> key=value ... [--overwrite]`.
   *
   * Labels with a `null` value are removed (emitted as `key-`).
   *
   * @param resource - The resource type (e.g., "configmap", "deployment.v1.apps")
   * @param name - The name of the resource to label
   * @param labels - Label mutations (string to set, null to remove)
   * @param options - Optional label options (overwrite, context)
   * @returns The trimmed stdout from kubectl
   * @throws Error if kubectl exits with non-zero code
   */
  label(
    resource: string,
    name: string,
    labels: Readonly<Record<string, string | null>>,
    options?: KubectlLabelOptions
  ): Promise<string>;
}

export interface KubectlDeleteOptions {
  /**
   * If true, adds `--ignore-not-found` so that deleting a resource
   * that does not exist succeeds silently instead of failing.
   */
  readonly ignoreNotFound?: undefined | boolean;
  readonly context?: undefined | KubectlContext;
}

export interface KubectlLabelOptions {
  /**
   * If true, adds `--overwrite` to allow updating labels that already
   * exist on the resource.
   */
  readonly overwrite?: undefined | boolean;
  readonly context?: undefined | KubectlContext;
}

export class RealKubectl implements Kubectl {
  private readonly recorder: Recorder;
  private readonly cwd: undefined | string;
  private readonly defaultContext: KubectlContext;

  constructor(deps: KubectlDeps, defaultContext: KubectlContext = {}) {
    this.recorder = deps.recorder;
    this.cwd = deps.cwd;
    this.defaultContext = { fieldManagerName: "kest", ...defaultContext };
  }

  extends(overrideContext: KubectlContext): Kubectl {
    return new RealKubectl(
      { recorder: this.recorder, cwd: this.cwd },
      {
        ...this.defaultContext,
        ...overrideContext,
      }
    );
  }

  async apply(
    resource: K8sResource,
    context?: KubectlContext
  ): Promise<string> {
    const yaml = stringifyYaml(resource);
    return await this.runKubectl({
      args: ["apply", "-f", "-"],
      stdin: { content: yaml, language: "yaml" },
      stdoutLanguage: "text",
      stderrLanguage: "text",
      overrideContext: context,
    });
  }

  async applyStatus(
    resource: K8sResource,
    context?: KubectlContext
  ): Promise<string> {
    const yaml = stringifyYaml(resource);
    const ctx = { ...this.defaultContext, ...context };
    const fieldManagerName = ctx.fieldManagerName;
    if (!fieldManagerName) {
      throw new Error(
        "kubectl applyStatus requires `fieldManagerName` to be set"
      );
    }
    return await this.runKubectl({
      args: [
        "apply",
        "--server-side",
        "--field-manager",
        fieldManagerName,
        "--subresource=status",
        "-f",
        "-",
      ],
      stdin: { content: yaml, language: "yaml" },
      stdoutLanguage: "text",
      stderrLanguage: "text",
      overrideContext: context,
    });
  }

  async create(
    resource: K8sResource,
    context?: KubectlContext
  ): Promise<string> {
    const yaml = stringifyYaml(resource);
    return await this.runKubectl({
      args: ["create", "-f", "-"],
      stdin: { content: yaml, language: "yaml" },
      stdoutLanguage: "text",
      stderrLanguage: "text",
      overrideContext: context,
    });
  }

  async get(
    type: string,
    name: string,
    context?: KubectlContext
  ): Promise<string> {
    return await this.runKubectl({
      args: ["get", type, name, "-o", "yaml"],
      stdoutLanguage: "yaml",
      stderrLanguage: "text",
      overrideContext: context,
    });
  }

  async list(type: string, context?: KubectlContext): Promise<string> {
    return await this.runKubectl({
      args: ["get", type, "-o", "yaml"],
      stdoutLanguage: "yaml",
      stderrLanguage: "text",
      overrideContext: context,
    });
  }

  async patch(
    resource: string,
    name: string,
    patch: KubectlPatch,
    options?: KubectlPatchOptions
  ): Promise<string> {
    const patchContent = stringifyPatch(patch);
    const args = ["patch", `${resource}/${name}`] as [string, ...Array<string>];
    if (options?.type) {
      args.push("--type", options.type);
    }
    args.push("-p", patchContent);
    return await this.runKubectl({
      args,
      stdoutLanguage: "text",
      stderrLanguage: "text",
      overrideContext: options?.context,
    });
  }

  async delete(
    resource: string,
    name: string,
    options?: KubectlDeleteOptions
  ): Promise<string> {
    const args: [string, ...Array<string>] = ["delete", `${resource}/${name}`];
    if (options?.ignoreNotFound) {
      args.push("--ignore-not-found");
    }
    return await this.runKubectl({
      args,
      stdoutLanguage: "text",
      stderrLanguage: "text",
      overrideContext: options?.context,
    });
  }

  async label(
    resource: string,
    name: string,
    labels: Readonly<Record<string, string | null>>,
    options?: KubectlLabelOptions
  ): Promise<string> {
    const args: [string, ...Array<string>] = ["label", `${resource}/${name}`];
    for (const [key, value] of Object.entries(labels)) {
      if (value === null) {
        args.push(`${key}-`);
      } else {
        args.push(`${key}=${value}`);
      }
    }
    if (options?.overwrite) {
      args.push("--overwrite");
    }
    return await this.runKubectl({
      args,
      stdoutLanguage: "text",
      stderrLanguage: "text",
      overrideContext: options?.context,
    });
  }

  private async runKubectl(params: ExecParams): Promise<string> {
    const cmd = "kubectl";
    const ctx = { ...this.defaultContext, ...params.overrideContext };
    const ctxArgs: Array<string> = [];
    if (ctx.namespace) {
      ctxArgs.push("-n", ctx.namespace);
    }
    if (ctx.context) {
      ctxArgs.push("--context", ctx.context);
    }
    if (ctx.kubeconfig) {
      ctxArgs.push("--kubeconfig", ctx.kubeconfig);
    }
    const args = [...params.args, ...ctxArgs];
    const stdin = params.stdin?.content;
    this.recorder.record("CommandRun", {
      cmd,
      args,
      stdin,
      stdinLanguage: params.stdin?.language,
    });
    const proc = Bun.spawn([cmd, ...args], {
      ...(this.cwd && { cwd: this.cwd }),
      stdin: stdin ? new TextEncoder().encode(stdin) : undefined,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    const { exitCode, stdout, stderr } = {
      exitCode: proc.exitCode ?? 0,
      stdout: (await proc.stdout?.text())?.trim() ?? "",
      stderr: (await proc.stderr?.text())?.trim() ?? "",
    };
    this.recorder.record("CommandResult", {
      exitCode,
      stdout,
      stderr,
      stdoutLanguage: params.stdoutLanguage,
      stderrLanguage: params.stderrLanguage,
    });
    if (exitCode !== 0) {
      const details = stderr || stdout;
      const [subcommand] = params.args;
      throw new Error(
        `kubectl ${subcommand} failed (exit code ${exitCode})${
          details ? `: ${details}` : ""
        }`
      );
    }
    return stdout;
  }
}

interface ExecParams {
  readonly args: readonly [subcommand: string, ...args: ReadonlyArray<string>];
  readonly stdin?:
    | undefined
    | {
        readonly language?: undefined | string;
        readonly content: string;
      };
  readonly stdoutLanguage?: undefined | string;
  readonly stderrLanguage?: undefined | string;
  readonly overrideContext?: undefined | KubectlContext;
}

function stringifyPatch(patch: KubectlPatch): string {
  if (typeof patch === "string") {
    return patch;
  }
  return JSON.stringify(patch);
}

export function createKubectl(
  deps: KubectlDeps,
  context: KubectlContext = {}
): Kubectl {
  return new RealKubectl(deps, context);
}
