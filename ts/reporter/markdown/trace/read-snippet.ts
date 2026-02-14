export interface Snippet {
  lines: Array<{ lineNumber: number; code: string }>;
  caretCol: number;
}

export async function readSnippet(
  filePath: string,
  line: number,
  col: number,
  contextLines = 5
): Promise<Snippet | undefined> {
  let content: string;
  try {
    content = await Bun.file(filePath).text();
  } catch {
    return undefined;
  }

  const allLines = content.split("\n");

  if (line < 1 || line > allLines.length) {
    return undefined;
  }

  const start = Math.max(1, line - contextLines);
  const extracted: Array<{ lineNumber: number; code: string }> = [];

  for (let i = start; i <= line; i++) {
    extracted.push({ lineNumber: i, code: allLines[i - 1] as string });
  }

  return { lines: extracted, caretCol: col };
}
