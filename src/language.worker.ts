import {
  check,
  hover,
  initSync as initTalkWasm,
  Repl,
} from "../vendor/talk-wasm/talk_wasm.js";

interface InitRequest {
  type: "init";
  module: WebAssembly.Module | Uint8Array;
}

interface AnalysisRequest {
  id: number;
  type: "check" | "hover" | "complete";
  source: string;
  byteOffset?: number;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<InitRequest | AnalysisRequest>) => void) | null;
  postMessage(message: unknown): void;
}

function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return "TalkTalk analysis failed.";
  }
}

const worker = globalThis as unknown as WorkerScope;
let initialized = false;

worker.onmessage = ({ data }) => {
  if (data.type === "init") {
    try {
      initTalkWasm({ module: data.module });
      initialized = true;
      worker.postMessage({ type: "ready" });
    } catch (error) {
      worker.postMessage({ type: "init-error", error: describeError(error) });
    }
    return;
  }

  if (!initialized) {
    worker.postMessage({
      id: data.id,
      ok: false,
      error: "TalkTalk analysis worker is not initialized.",
    });
    return;
  }

  try {
    let result: unknown;
    switch (data.type) {
      case "check":
        result = check(data.source);
        break;
      case "hover":
        result = hover(
          data.source,
          data.byteOffset ?? 0,
          undefined,
          undefined,
          undefined,
        );
        break;
      case "complete": {
        const repl = new Repl();
        try {
          result = repl.complete(data.source, data.byteOffset ?? 0);
        } finally {
          repl.free();
        }
        break;
      }
    }
    worker.postMessage({ id: data.id, ok: true, result });
  } catch (error) {
    worker.postMessage({ id: data.id, ok: false, error: describeError(error) });
  }
};
