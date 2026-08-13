import workerSource from "talktalk:runner-worker";
import { TalkRuntime } from "./talkRuntime";

export interface TalkProgramResult {
  output: string;
  value: string;
}

// A fresh wasm instance type-checks the core library on its first run,
// which can take ~10 seconds. Allow that once per worker, then enforce
// the normal per-run timeout.
const COLD_START_TIMEOUT_MS = 30_000;

interface PendingRun {
  id: number;
  source: string;
  signal: AbortSignal;
  timeoutMs: number;
  resolve(result: TalkProgramResult): void;
  reject(error: Error): void;
}

interface ActiveRun extends PendingRun {
  timer: number;
  onAbort: () => void;
}

interface WorkerResponse {
  type?: "ready" | "init-error" | "run";
  id?: number;
  ok?: boolean;
  result?: unknown;
  error?: string;
}

export class TalkRunner {
  private readonly workerUrl: string;
  private worker: Worker | null = null;
  private startPromise: Promise<void> | null = null;
  private startResolve: (() => void) | null = null;
  private startReject: ((error: Error) => void) | null = null;
  private warm = false;
  private active: ActiveRun | null = null;
  private readonly queue: PendingRun[] = [];
  private nextId = 1;
  private disposed = false;

  constructor(private readonly runtime: TalkRuntime) {
    this.workerUrl = URL.createObjectURL(
      new Blob([workerSource], { type: "text/javascript" }),
    );
    // Absorb the cold-start cost now instead of on the first Run click.
    void this.run("1", new AbortController().signal).catch(() => {});
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.failAll(new Error("TalkTalk runner was disposed."));
    this.worker?.terminate();
    this.worker = null;
    this.startPromise = null;
    URL.revokeObjectURL(this.workerUrl);
  }

  run(
    source: string,
    signal: AbortSignal,
    timeoutMs = 2_000,
  ): Promise<TalkProgramResult> {
    if (this.disposed) {
      return Promise.reject(new Error("TalkTalk runner was disposed."));
    }
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: this.nextId++,
        source,
        signal,
        timeoutMs,
        resolve,
        reject,
      });
      this.pump();
    });
  }

  private pump(): void {
    if (this.disposed || this.active) return;

    while (this.queue.length > 0 && this.queue[0].signal.aborted) {
      this.queue.shift()!.reject(new Error("Execution cancelled."));
    }
    const job = this.queue[0];
    if (!job) return;

    if (!this.worker) {
      this.start().then(
        () => this.pump(),
        (error: unknown) =>
          this.failAll(
            error instanceof Error ? error : new Error(String(error)),
          ),
      );
      return;
    }

    this.queue.shift();

    const timeoutMs = this.warm
      ? job.timeoutMs
      : Math.max(job.timeoutMs, COLD_START_TIMEOUT_MS);

    const onAbort = () =>
      this.killWorker(new Error("Execution cancelled."), job.id);

    const timer = window.setTimeout(() => {
      const seconds = Math.round(timeoutMs / 1000);
      this.killWorker(
        new Error(`Execution stopped after ${seconds} seconds.`),
        job.id,
      );
    }, timeoutMs);

    this.active = { ...job, timer, onAbort };
    job.signal.addEventListener("abort", onAbort, { once: true });

    try {
      this.worker.postMessage({ type: "run", id: job.id, source: job.source });
    } catch (error) {
      this.finishActiveWithError(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private start(): Promise<void> {
    if (this.startPromise) return this.startPromise;

    const worker = new Worker(this.workerUrl);
    this.worker = worker;
    this.warm = false;

    this.startPromise = new Promise<void>((resolve, reject) => {
      this.startResolve = resolve;
      this.startReject = reject;

      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (worker !== this.worker) return;
        if (data.type === "ready") {
          this.startResolve?.();
          this.startResolve = null;
          this.startReject = null;
          return;
        }
        if (data.type === "init-error") {
          const error = new Error(
            data.error || "TalkTalk worker failed to load.",
          );
          this.discardWorker(worker);
          this.failAll(error);
          return;
        }
        if (data.type === "run") this.finishActive(data);
      };

      worker.onerror = (event) => {
        if (worker !== this.worker) return;
        const error = new Error(event.message || "TalkTalk worker failed.");
        this.discardWorker(worker);
        this.failAll(error);
      };

      try {
        worker.postMessage({ type: "init", module: this.runtime.module });
      } catch {
        worker.postMessage({ type: "init", module: this.runtime.bytes });
      }
    });
    // Rejections are delivered to callers via failAll; silence the
    // promise itself to avoid unhandled rejection noise.
    this.startPromise.catch(() => {});
    return this.startPromise;
  }

  private finishActive(data: WorkerResponse): void {
    const active = this.active;
    if (!active || active.id !== data.id) return;
    this.clearActive();

    // Any response means the worker executed wasm, so the core
    // library is now cached in this instance.
    this.warm = true;

    if (!data.ok) {
      active.reject(new Error(data.error || "TalkTalk execution failed."));
    } else {
      const result =
        data.result instanceof Object
          ? (data.result as Record<string, unknown>)
          : {};
      active.resolve({
        output: typeof result.output === "string" ? result.output : "",
        value: typeof result.value === "string" ? result.value : "",
      });
    }
    this.pump();
  }

  private finishActiveWithError(error: Error): void {
    const active = this.active;
    if (!active) return;
    this.clearActive();
    active.reject(error);
    this.pump();
  }

  private clearActive(): void {
    if (!this.active) return;
    window.clearTimeout(this.active.timer);
    this.active.signal.removeEventListener("abort", this.active.onAbort);
    this.active = null;
  }

  // Terminate the current worker (a running job cannot be cancelled
  // otherwise) and reject its active job. Queued jobs stay queued and
  // a fresh worker is started on the next pump.
  private killWorker(reason: Error, jobId: number): void {
    const active = this.active;
    const worker = this.worker;
    if (!active || active.id !== jobId || !worker) return;
    this.clearActive();
    this.discardWorker(worker);
    active.reject(reason);
    this.pump();
  }

  private discardWorker(worker: Worker): void {
    if (this.worker !== worker) return;
    this.worker = null;
    this.startPromise = null;
    this.startResolve = null;
    this.startReject = null;
    this.warm = false;
    worker.terminate();
  }

  private failAll(error: Error): void {
    const startReject = this.startReject;
    this.startReject = null;
    this.startResolve = null;
    startReject?.(error);

    const active = this.active;
    if (active) {
      this.clearActive();
      active.reject(error);
    }
    for (const job of this.queue.splice(0)) job.reject(error);
  }
}
