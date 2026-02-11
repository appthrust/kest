import type { K8sResource } from "../apis";
import { parseYaml } from "../yaml";

export function parseK8sResource(value: unknown): ParseResult<K8sResource> {
  const violations: Array<string> = [];

  // Check if value is an object
  if (value === null || typeof value !== "object") {
    return { ok: false, violations: ["value must be an object"] };
  }

  const obj = value as Record<string, unknown>;

  // Check apiVersion
  if (typeof obj["apiVersion"] !== "string" || obj["apiVersion"] === "") {
    violations.push("apiVersion is required");
  }

  // Check kind
  if (typeof obj["kind"] !== "string" || obj["kind"] === "") {
    violations.push("kind is required");
  }

  // Check metadata
  if (obj["metadata"] === null || typeof obj["metadata"] !== "object") {
    violations.push("metadata is required");
  } else {
    const metadata = obj["metadata"] as Record<string, unknown>;
    if (typeof metadata["name"] !== "string" || metadata["name"] === "") {
      violations.push("metadata.name is required");
    }
  }

  if (violations.length > 0) {
    return { ok: false, violations };
  }

  return {
    ok: true,
    value: obj as K8sResource,
  };
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; violations: Array<string> };

export function parseK8sResourceYaml(yaml: string): ParseResult<K8sResource> {
  const parsed = parseYaml(yaml);
  return parseK8sResource(parsed);
}

export function parseK8sResourceList(
  value: unknown
): ParseResult<Array<K8sResource>> {
  if (value === null || typeof value !== "object") {
    return { ok: false, violations: ["value must be an object"] };
  }

  const obj = value as Record<string, unknown>;
  const items = obj["items"];
  if (!Array.isArray(items)) {
    return { ok: false, violations: ["items must be an array"] };
  }

  const violations: Array<string> = [];
  const parsedItems: Array<K8sResource> = [];
  for (const [i, item] of items.entries()) {
    const result = parseK8sResource(item);
    if (!result.ok) {
      violations.push(
        ...result.violations.map((v) => `items[${i}]: ${v}` satisfies string)
      );
      continue;
    }
    parsedItems.push(result.value);
  }

  if (violations.length > 0) {
    return { ok: false, violations };
  }

  return { ok: true, value: parsedItems };
}

export function parseK8sResourceListYaml(
  yaml: string
): ParseResult<Array<K8sResource>> {
  const parsed = parseYaml(yaml);
  return parseK8sResourceList(parsed);
}

function parseK8sResourceFromESM(esm: ESM): ParseResult<K8sResource> {
  const result = parseK8sResource(esm.default);
  if (!result.ok) {
    return { ok: false, violations: result.violations };
  }
  return { ok: true, value: result.value };
}

export async function parseK8sResourceAny(
  value: unknown
): Promise<ParseResult<K8sResource>> {
  if (typeof value === "string") {
    return parseK8sResourceYaml(value);
  }
  const awatedValue = await value;
  if (isESM(awatedValue)) {
    return parseK8sResourceFromESM(awatedValue);
  }
  return parseK8sResource(awatedValue);
}

export interface ESM {
  readonly default: unknown;
}

function isESM(value: unknown): value is ESM {
  return typeof value === "object" && value !== null && "default" in value;
}

export function getResourceMeta(
  value: unknown
): undefined | { kind: string; name: string } {
  if (typeof value === "string") {
    const result = parseK8sResourceYaml(value);
    if (result.ok) {
      return { kind: result.value.kind, name: result.value.metadata.name };
    }
  }
  if (isESM(value)) {
    const result = parseK8sResourceFromESM(value);
    if (result.ok) {
      return { kind: result.value.kind, name: result.value.metadata.name };
    }
  }
  const result = parseK8sResource(value);
  if (result.ok) {
    return { kind: result.value.kind, name: result.value.metadata.name };
  }
  return undefined;
}
