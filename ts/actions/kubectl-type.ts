/**
 * Converts an `apiVersion` + `kind` pair into the resource type string
 * expected by kubectl subcommands (e.g. `get`, `delete`, `label`).
 *
 * - Core-group resources (`apiVersion: "v1"`) → `"ConfigMap"`
 * - Non-core resources (`apiVersion: "apps/v1"`) → `"Deployment.v1.apps"`
 */
export function toKubectlType(resource: {
  readonly apiVersion: string;
  readonly kind: string;
}): string {
  const { kind, apiVersion } = resource;
  const [group, version] = apiVersion.split("/");
  if (version === undefined) {
    // core group cannot include version in the type
    return kind;
  }
  return [kind, version, group].filter(Boolean).join(".");
}
