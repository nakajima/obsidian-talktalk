import {
  format as formatWithWasm,
  highlight as highlightWithWasm,
  initSync as initTalkWasm,
  version as wasmVersion,
} from "../vendor/talk-wasm/talk_wasm.js";
import wasmBase64 from "../vendor/talk-wasm/talk_wasm_bg.wasm";

export type TalkRuntimeSource = "bundled" | "override";

export class TalkRuntime {
  private constructor(
    readonly module: WebAssembly.Module,
    readonly bytes: Uint8Array,
    readonly version: string,
    readonly source: TalkRuntimeSource,
  ) {}

  static async load(
    overrideBytes?: Uint8Array<ArrayBuffer>,
  ): Promise<TalkRuntime> {
    if (overrideBytes) {
      try {
        return await TalkRuntime.fromBytes(overrideBytes, "override");
      } catch (error) {
        console.warn(
          "TalkTalk WASM override failed to load, falling back to bundled bundle",
          error,
        );
      }
    }
    return TalkRuntime.fromBytes(TalkRuntime.bundledBytes(), "bundled");
  }

  private static async fromBytes(
    bytes: Uint8Array<ArrayBuffer>,
    source: TalkRuntimeSource,
  ): Promise<TalkRuntime> {
    const module = await WebAssembly.compile(bytes);
    initTalkWasm({ module });
    return new TalkRuntime(module, bytes, wasmVersion(), source);
  }

  private static bundledBytes(): Uint8Array<ArrayBuffer> {
    let binary = atob(wasmBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    binary = "";
    return bytes;
  }

  highlight(source: string): string {
    return highlightWithWasm(source);
  }

  format(source: string): string {
    return formatWithWasm(source);
  }
}
