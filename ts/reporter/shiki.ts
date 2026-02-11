export type CodeToANSI = (
  code: string,
  language: string,
  theme: string
) => Promise<string>;

let codeToANSIPromise: Promise<CodeToANSI> | undefined;

function loadCodeToANSI(): Promise<CodeToANSI> {
  if (codeToANSIPromise) {
    return codeToANSIPromise;
  }

  codeToANSIPromise = (async () => {
    const env = typeof process !== "undefined" ? process.env : undefined;
    const prevNoColor = env?.["NO_COLOR"];
    const prevForceColor = env?.["FORCE_COLOR"];

    // `@shikijs/cli` uses `ansis`, which disables colors when NO_COLOR is set.
    // Force ANSI output when our callers explicitly request ANSI.
    if (env) {
      // biome-ignore lint/performance/noDelete: required to actually unset env vars
      delete env["NO_COLOR"];
      env["FORCE_COLOR"] = "3";
    }

    try {
      const mod = await import("@shikijs/cli");
      return mod.codeToANSI as unknown as CodeToANSI;
    } finally {
      if (env) {
        if (prevNoColor === undefined) {
          // biome-ignore lint/performance/noDelete: required to restore absence
          delete env["NO_COLOR"];
        } else {
          env["NO_COLOR"] = prevNoColor;
        }
        if (prevForceColor === undefined) {
          // biome-ignore lint/performance/noDelete: required to restore absence
          delete env["FORCE_COLOR"];
        } else {
          env["FORCE_COLOR"] = prevForceColor;
        }
      }
    }
  })();

  return codeToANSIPromise;
}

export async function codeToANSIForcedColors(
  code: string,
  language: string,
  theme: string
): Promise<string> {
  const fn = await loadCodeToANSI();
  return await fn(code, language, theme);
}
