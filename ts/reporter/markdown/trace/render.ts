import { codeToANSIForcedColors } from "../../shiki";
import { findUserFrame } from "./find-user-frame";
import type { StackFrame } from "./parse-stack";
import { parseStack } from "./parse-stack";
import type { Snippet } from "./read-snippet";
import { readSnippet } from "./read-snippet";

export interface RenderTraceOptions {
  workspaceRoot?: undefined | string;
  enableANSI?: undefined | boolean;
}

// Catppuccin Mocha palette
const overlay0 = "#6c7086";
const subtext0 = "#a6adc8";
const textColor = "#cdd6f4";
const peach = "#fab387";
const flamingo = "#f2cdcd";
const red = "#f38ba8";
const maroon = "#eba0ac";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function fg(hex: string, s: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
}

function fgBold(hex: string, s: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[1;38;2;${r};${g};${b}m${s}\x1b[0m`;
}

function formatSnippetPlain(
  snippet: Snippet,
  gutterWidth: number
): Array<string> {
  const parts: Array<string> = [];
  for (const { lineNumber, code } of snippet.lines) {
    const num = String(lineNumber).padStart(gutterWidth);
    parts.push(`${num} | ${code}`);
  }
  const caretOffset = gutterWidth + " | ".length + snippet.caretCol - 1;
  parts.push(`${" ".repeat(caretOffset)}^`);
  return parts;
}

async function formatSnippetANSI(
  snippet: Snippet,
  gutterWidth: number
): Promise<Array<string>> {
  // Build the snippet text with line numbers for Shiki highlighting
  const snippetText = snippet.lines
    .map(({ lineNumber, code }) => {
      const num = String(lineNumber).padStart(gutterWidth);
      return `${num} | ${code}`;
    })
    .join("\n");

  const highlighted = await codeToANSIForcedColors(
    snippetText,
    "typescript",
    "catppuccin-mocha"
  );

  const lines = highlighted.replace(/\n$/, "").split("\n");

  // Add bold Maroon caret line
  const caretOffset = gutterWidth + " | ".length + snippet.caretCol - 1;
  lines.push(fgBold(maroon, `${" ".repeat(caretOffset)}^`));

  return lines;
}

function formatFramePlain(frame: StackFrame): string {
  if (frame.funcName) {
    return `at ${frame.funcName} (${frame.filePath}:${frame.line}:${frame.col})`;
  }
  return `at ${frame.filePath}:${frame.line}:${frame.col}`;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rendering is intentionally linear and explicit
function formatFrameANSI(
  frame: StackFrame,
  workspaceRoot: string | undefined,
  snippetFrame: StackFrame | undefined
): string {
  let root: string | undefined;
  if (workspaceRoot) {
    root = workspaceRoot.endsWith("/") ? workspaceRoot : `${workspaceRoot}/`;
  }

  // Determine if this frame matches the snippet source (both file AND line)
  let isSnippetSource = false;
  if (snippetFrame && root) {
    const frameRel = frame.filePath.startsWith(root)
      ? frame.filePath.slice(root.length)
      : frame.filePath;
    const snippetRel = snippetFrame.filePath.startsWith(root)
      ? snippetFrame.filePath.slice(root.length)
      : snippetFrame.filePath;
    isSnippetSource =
      frameRel === snippetRel && frame.line === snippetFrame.line;
  }

  const parts: Array<string> = [];

  // "at"
  parts.push(fg(overlay0, "at"));

  // function name (if present)
  if (frame.funcName) {
    parts.push(" ");
    parts.push(fg(textColor, frame.funcName));
    parts.push(" ");
    parts.push(fg(overlay0, "("));
  } else {
    parts.push(" ");
  }

  // Split workspace root vs relative path
  let wsRoot = "";
  let relPath = frame.filePath;
  if (root && frame.filePath.startsWith(root)) {
    wsRoot = root;
    relPath = frame.filePath.slice(root.length);
  }

  // workspace root part
  if (wsRoot) {
    parts.push(fg(subtext0, wsRoot));
  }

  // file name part
  if (isSnippetSource) {
    parts.push(fgBold(red, relPath));
  } else {
    parts.push(fg(peach, relPath));
  }

  // colon
  parts.push(fg(overlay0, ":"));

  // line number
  if (isSnippetSource) {
    parts.push(fgBold(maroon, String(frame.line)));
  } else {
    parts.push(fg(flamingo, String(frame.line)));
  }

  // colon
  parts.push(fg(overlay0, ":"));

  // column number
  parts.push(fg(overlay0, String(frame.col)));

  if (frame.funcName) {
    parts.push(fg(overlay0, ")"));
  }

  return parts.join("");
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rendering is intentionally linear and explicit
export async function renderTrace(
  rawStack: string,
  options: RenderTraceOptions
): Promise<string | undefined> {
  const frames = parseStack(rawStack);
  if (frames.length === 0) {
    return undefined;
  }

  const enableANSI = options.enableANSI ?? false;
  const parts: Array<string> = [];
  let snippetFrame: StackFrame | undefined;

  // Try to get snippet if workspaceRoot is provided
  if (options.workspaceRoot) {
    const userFrame = findUserFrame(frames, options.workspaceRoot);
    if (userFrame) {
      const snippet = await readSnippet(
        userFrame.filePath,
        userFrame.line,
        userFrame.col
      );
      if (snippet) {
        snippetFrame = userFrame;
        const maxLineNum = Math.max(...snippet.lines.map((l) => l.lineNumber));
        const gutterWidth = String(maxLineNum).length;

        if (enableANSI) {
          parts.push(...(await formatSnippetANSI(snippet, gutterWidth)));
        } else {
          parts.push(...formatSnippetPlain(snippet, gutterWidth));
        }

        // Blank line separator between snippet and frames
        parts.push("");
      }
    }
  }

  // Format stack frames
  if (enableANSI) {
    for (const frame of frames) {
      parts.push(formatFrameANSI(frame, options.workspaceRoot, snippetFrame));
    }
  } else {
    for (const frame of frames) {
      parts.push(formatFramePlain(frame));
    }
  }

  return parts.join("\n");
}
