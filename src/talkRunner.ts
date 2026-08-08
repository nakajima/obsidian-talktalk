import workerSource from "talktalk:runner-worker";
import { TalkRuntime } from "./talkRuntime";

export interface TalkProgramResult {
  output: string;
  value: string;
}

interface WorkerResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export class TalkRunner {
  private readonly workers = new Map<Worker, () => void>();
  private readonly workerUrl: string;

  constructor(private readonly runtime: TalkRuntime) {
    this.workerUrl = URL.createObjectURL(
      new Blob([workerSource], { type: "text/javascript" }),
    );
  }

  dispose(): void {
    for (const cancel of [...this.workers.values()]) cancel();
    URL.revokeObjectURL(this.workerUrl);
  }

  run(
    source: string,
    signal: AbortSignal,
    timeoutMs = 2_000,
  ): Promise<TalkProgramResult> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerUrl);
      let finished = false;

      const finish = () => {
        if (finished) return false;
        finished = true;
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        worker.terminate();
        this.workers.delete(worker);
        return true;
      };

      const abort = () => {
        if (finish()) reject(new Error("Execution cancelled."));
      };

      const timeout = window.setTimeout(() => {
        if (finish()) reject(new Error("Execution stopped after 2 seconds."));
      }, timeoutMs);

      this.workers.set(worker, abort);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }

      worker.onerror = (event) => {
        if (finish()) reject(new Error(event.message || "TalkTalk worker failed."));
      };
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (!finish()) return;
        if (!data.ok) {
          reject(new Error(data.error || "TalkTalk execution failed."));
          return;
        }

        const result =
          data.result instanceof Object
            ? (data.result as Record<string, unknown>)
            : {};
        resolve({
          output: typeof result.output === "string" ? result.output : "",
          value: typeof result.value === "string" ? result.value : "",
        });
      };

      try {
        worker.postMessage({ module: this.runtime.module, source });
      } catch {
        worker.postMessage({ module: this.runtime.bytes, source });
      }
    });
  }
}
