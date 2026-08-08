import {
  highlight,
  initSync,
  run_program as runProgram,
} from "../vendor/talk-wasm/talk_wasm.js";
import wasmBase64 from "../vendor/talk-wasm/talk_wasm_bg.wasm";

let failures = 0;
function check(name: string, condition: boolean): void {
  if (!condition) {
    failures++;
    console.error("FAIL:", name);
  } else {
    console.log("ok:", name);
  }
}

const binary = atob(wasmBase64);
const bytes = new Uint8Array(binary.length);
for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
initSync({ module: bytes });

const effect = highlight("effect 'fizz(fn: () 'buzz -> ())");
check("WASM highlights effect names", effect.includes('class="effect"'));
check("effect label is not a string", !effect.includes('class="string"'));

const escaped = highlight('let value = "<script>"');
check("highlighted source escapes HTML", !escaped.includes("<script>"));

const result = runProgram("1 + 2 + 3") as Record<string, unknown>;
check("WASM runs a program", result.value === "6");

if (failures > 0) process.exit(1);
console.log("all WASM tests passed");
