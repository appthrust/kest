import type { StackFrame } from "./parse-stack";

export function findUserFrame(
  frames: Array<StackFrame>,
  workspaceRoot: string
): StackFrame | undefined {
  const root = workspaceRoot.endsWith("/")
    ? workspaceRoot
    : `${workspaceRoot}/`;

  for (const frame of frames) {
    const { filePath } = frame;

    if (filePath.includes("unknown")) {
      continue;
    }
    if (filePath.startsWith("<")) {
      continue;
    }
    if (filePath.includes("/node_modules/")) {
      continue;
    }
    if (filePath.startsWith("native:")) {
      continue;
    }

    if (filePath.startsWith(root)) {
      const relative = filePath.slice(root.length);
      if (relative.startsWith("ts/")) {
        continue;
      }
    }

    return frame;
  }

  return undefined;
}
