import workerSource from "talktalk:language-worker";
import { TalkRuntime } from "./talkRuntime";

export interface TalkDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  range: { start: number; end: number };
}

export interface TalkHover {
  contents: string;
  range: {
    start: { byte: number };
    end: { byte: number };
  };
}

export interface TalkCompletion {
  display: string;
  replacement: string;
}

export interface TalkCompletionResult {
  start: number;
  items: TalkCompletion[];
}

interface WorkerResponse {
  type?: "ready" | "init-error";
  id?: number;
  ok?: boolean;
  result?: unknown;
  error?: string;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export class TalkLanguageService {
  private readonly pending = new Map<number, PendingRequest>();
  private readonly worker: Worker;
  private readonly workerUrl: string;
  private nextId = 1;
  private disposed = false;
  private failure: Error | null = null;
  private ready: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;

  constructor(runtime: TalkRuntime) {
    this.workerUrl = URL.createObjectURL(
      new Blob([workerSource], { type: "text/javascript" }),
    );
    this.worker = new Worker(this.workerUrl);
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    this.worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === "ready") {
        this.resolveReady();
        return;
      }
      if (data.type === "init-error") {
        this.failure = new Error(data.error || "TalkTalk analysis failed to load.");
        this.rejectReady(this.failure);
        return;
      }
      if (data.id === undefined) return;

      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.ok) {
        pending.resolve(data.result);
      } else {
        pending.reject(new Error(data.error || "TalkTalk analysis failed."));
      }
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "TalkTalk analysis worker failed.");
      this.failure = error;
      this.rejectReady(error);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };

    try {
      this.worker.postMessage({ type: "init", module: runtime.module });
    } catch {
      this.worker.postMessage({ type: "init", module: runtime.bytes });
    }
  }

  initialize(): Promise<void> {
    return this.ready;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const error = new Error("TalkTalk analysis service was disposed.");
    this.failure = error;
    this.rejectReady(error);
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.worker.terminate();
    URL.revokeObjectURL(this.workerUrl);
  }

  async check(source: string): Promise<TalkDiagnostic[]> {
    const result = await this.request<{ diagnostics?: TalkDiagnostic[] }>(
      "check",
      source,
    );
    return result.diagnostics ?? [];
  }

  async hover(source: string, byteOffset: number): Promise<TalkHover | null> {
    const result = await this.request<{ hover?: TalkHover | null }>(
      "hover",
      source,
      byteOffset,
    );
    return result.hover ?? null;
  }

  complete(source: string, byteOffset: number): Promise<TalkCompletionResult> {
    return this.request<TalkCompletionResult>("complete", source, byteOffset);
  }

  private async request<T>(
    type: "check" | "hover" | "complete",
    source: string,
    byteOffset?: number,
  ): Promise<T> {
    await this.ready;
    if (this.failure) throw this.failure;

    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      try {
        this.worker.postMessage({ id, type, source, byteOffset });
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}
