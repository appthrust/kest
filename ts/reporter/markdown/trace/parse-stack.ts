export interface StackFrame {
  funcName?: string;
  filePath: string;
  line: number;
  col: number;
}

// Pattern: at funcName (filePath:line:col)
const withFuncAndParens =
  /^\s*at\s+(?:async\s+)?(.+?)\s+\((.+):(\d+):(\d+)\)\s*$/;

// Pattern: at (filePath:line:col)
const withParensNoFunc = /^\s*at\s+(?:async\s+)?\((.+):(\d+):(\d+)\)\s*$/;

// Pattern: at filePath:line:col
const bareLocation = /^\s*at\s+(?:async\s+)?(.+):(\d+):(\d+)\s*$/;

export function parseStack(rawStack: string): Array<StackFrame> {
  if (!rawStack) {
    return [];
  }

  const lines = rawStack.split("\n");
  const frames: Array<StackFrame> = [];

  for (const line of lines) {
    if (!/^\s*at\s/.test(line)) {
      continue;
    }

    let match: RegExpMatchArray | null;

    match = line.match(withParensNoFunc);
    if (match) {
      frames.push({
        filePath: match[1] as string,
        line: Number(match[2]),
        col: Number(match[3]),
      });
      continue;
    }

    match = line.match(withFuncAndParens);
    if (match) {
      frames.push({
        funcName: match[1] as string,
        filePath: match[2] as string,
        line: Number(match[3]),
        col: Number(match[4]),
      });
      continue;
    }

    match = line.match(bareLocation);
    if (match) {
      frames.push({
        filePath: match[1] as string,
        line: Number(match[2]),
        col: Number(match[3]),
      });
    }
  }

  return frames;
}
