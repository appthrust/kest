import { dirname, join } from "node:path";

/**
 * Finds a file by walking up parent directories.
 * Returns the path to the file if found, or undefined if not found.
 */
export async function findUp(filename: string): Promise<string | undefined> {
  let dir = process.cwd();
  while (true) {
    const filePath = join(dir, filename);
    if (await Bun.file(filePath).exists()) {
      return filePath;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}
