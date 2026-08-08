/* tslint:disable */
/* eslint-disable */

export class Repl {
  free(): void;
  [Symbol.dispose](): void;
  needs_more_input(input: string): boolean;
  constructor();
  eval(input: string): object;
  reset(): void;
  type_of(input: string): object;
  complete(input: string, byte_offset: number): object;
}

export function check(source: string): any;

export function format(source: string): string;

export function highlight(source: string): string;

export function hover(source: string, byte_offset?: number | null, line?: number | null, column?: number | null, node_id?: string | null): any;

export function run_program(source: string): object;

export function show_ir(source: string): object;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_repl_free: (a: number, b: number) => void;
  readonly check: (a: number, b: number, c: number) => void;
  readonly format: (a: number, b: number, c: number) => void;
  readonly highlight: (a: number, b: number, c: number) => void;
  readonly hover: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly repl_complete: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly repl_eval: (a: number, b: number, c: number, d: number) => void;
  readonly repl_needs_more_input: (a: number, b: number, c: number) => number;
  readonly repl_new: () => number;
  readonly repl_reset: (a: number) => void;
  readonly repl_type_of: (a: number, b: number, c: number, d: number) => void;
  readonly run_program: (a: number, b: number, c: number) => void;
  readonly show_ir: (a: number, b: number, c: number) => void;
  readonly version: (a: number) => void;
  readonly __wbindgen_export: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export2: (a: number) => void;
  readonly __wbindgen_export3: (a: number, b: number) => number;
  readonly __wbindgen_export4: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
