import { YAML } from "bun";

export function parseYaml(yaml: string): unknown {
  // Check if the YAML contains stream separators (---)
  // This includes multiple documents or single document with explicit start
  if (/^---\s*$/m.test(yaml)) {
    throw new Error("YAML stream is not supported");
  }
  return YAML.parse(yaml);
}

export function stringifyYaml(value: unknown): string {
  return YAML.stringify(value, null, 2);
}
