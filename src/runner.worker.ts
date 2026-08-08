import {
  initSync as initTalkWasm,
  run_program as runProgram,
} from "../vendor/talk-wasm/talk_wasm.js";

interface RunRequest {
  module: WebAssembly.Module | Uint8Array;
  source: string;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<RunRequest>) => void) | null;
  postMessage(message: unknown): void;
}

function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (!(error instanceof Object)) return String(error);

  const record = error as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.length > 0) {
    return record.message;
  }

  if (Array.isArray(record.diagnostics)) {
    const diagnostics = record.diagnostics
      .map((diagnostic) => {
        if (!(diagnostic instanceof Object)) return String(diagnostic);
        const entry = diagnostic as Record<string, unknown>;
        const location =
          typeof entry.line === "number" && typeof entry.column === "number"
            ? `${entry.line}:${entry.column}: `
            : "";
        return `${location}${String(entry.message ?? "Unknown diagnostic")}`;
      })
      .join("\n");
    if (diagnostics.length > 0) return diagnostics;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "TalkTalk execution failed.";
  }
}

const worker = globalThis as unknown as WorkerScope;
worker.onmessage = ({ data }) => {
  try {
    initTalkWasm({ module: data.module });
    const result = runProgram(data.source);
    worker.postMessage({ ok: true, result });
  } catch (error) {
    worker.postMessage({ ok: false, error: describeError(error) });
  }
};
