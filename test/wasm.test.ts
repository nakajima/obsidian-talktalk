import {
  check as checkSource,
  format,
  highlight,
  hover,
  initSync,
  Repl,
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
const accumulatedResult = runProgram(
  "func add(x, y) { x + y }\n\nadd(1, 2)",
) as Record<string, unknown>;
check("WASM runs accumulated source", accumulatedResult.value === "3");

const diagnostics = checkSource("let x: Missing = 1") as {
  diagnostics?: Array<{ message?: string }>;
};
check(
  "WASM returns diagnostics",
  diagnostics.diagnostics?.[0]?.message === "Undefined name: Missing",
);

const analyzed = "let answer = 42\nanswer";
const hovered = hover(
  analyzed,
  analyzed.lastIndexOf("answer"),
  undefined,
  undefined,
  undefined,
) as { hover?: { contents?: string } | null };
check("WASM returns hover types", hovered.hover?.contents === "answer: Int");

const repl = new Repl();
const completions = repl.complete(analyzed, analyzed.length) as {
  start?: number;
  items?: Array<{ replacement?: string }>;
};
repl.free();
check(
  "WASM returns completions",
  completions.start === 16 && completions.items?.[0]?.replacement === "answer",
);
check("WASM formats source", format("let x=1") === "let x = 1");

if (failures > 0) process.exit(1);
console.log("all WASM tests passed");
