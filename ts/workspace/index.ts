import { dirname } from "node:path";
import { findUp } from "./find-up.ts";

const CONFIG_FILE = "kest.config.ts";
const PACKAGE_JSON = "package.json";

/**
 * Gets the workspace root directory.
 *
 * Uses find-up approach to locate `kest.config.ts`.
 * If found, the directory containing the config file is the workspace root.
 * If not found, tries to find `package.json` instead.
 * If neither found, the current directory is used as the workspace root.
 */
export async function getWorkspaceRoot(): Promise<string> {
  const configPath = await findUp(CONFIG_FILE);
  if (configPath) {
    return dirname(configPath);
  }
  const packageJsonPath = await findUp(PACKAGE_JSON);
  if (packageJsonPath) {
    return dirname(packageJsonPath);
  }
  return process.cwd();
}
