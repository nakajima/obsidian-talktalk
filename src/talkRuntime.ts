import {
  highlight as highlightWithWasm,
  initSync as initTalkWasm,
} from "../vendor/talk-wasm/talk_wasm.js";
import wasmBase64 from "../vendor/talk-wasm/talk_wasm_bg.wasm";

export class TalkRuntime {
  private constructor(
    readonly module: WebAssembly.Module,
    readonly bytes: Uint8Array,
  ) {}

  static async load(): Promise<TalkRuntime> {
    let binary = atob(wasmBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    binary = "";

    const module = await WebAssembly.compile(bytes);
    initTalkWasm({ module });
    return new TalkRuntime(module, bytes);
  }

  highlight(source: string): string {
    return highlightWithWasm(source);
  }
}
