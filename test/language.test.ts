import {
  CompletionContext,
  CompletionSource,
} from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { talkLanguageSupport } from "../src/talkLanguage";
import { TalkLanguageService } from "../src/talkLanguageService";

let failures = 0;
function check(name: string, condition: boolean): void {
  if (!condition) {
    failures++;
    console.error("FAIL:", name);
  } else {
    console.log("ok:", name);
  }
}

async function main(): Promise<void> {
  let completedSource = "";
  let completedOffset = 0;
  const prefix = "let answer = 42\n\n";
  const fakeService = {
    check: async () => [],
    hover: async () => null,
    complete: async (source: string, byteOffset: number) => {
      completedSource = source;
      completedOffset = byteOffset;
      return {
        start: prefix.length,
        items: [{ display: "answer                 Int", replacement: "answer" }],
      };
    },
  } as unknown as TalkLanguageService;

  const source = [
    "before",
    "```tlk accumulate(scope) norun",
    "let answer = 42",
    "```",
    "prose",
    "```tlk accumulate(scope)",
    "ans",
    "```",
    "after",
  ].join("\n");
  const contentFrom = source.lastIndexOf("ans");
  const cursor = contentFrom + 3;
  const state = EditorState.create({
    doc: source,
    extensions: [talkLanguageSupport(fakeService)],
  });
  const sources = state.languageDataAt<CompletionSource>("autocomplete", cursor);
  check("completion source is active inside tlk block", sources.length === 1);
  check(
    "completion source is inactive outside tlk block",
    state.languageDataAt<CompletionSource>("autocomplete", 1).length === 0,
  );

  const result = await sources[0](new CompletionContext(state, cursor, true));
  check(
    "completion analyzes accumulated source",
    completedSource === `${prefix}ans`,
  );
  check(
    "completion maps cursor into accumulated source",
    completedOffset === prefix.length + 3,
  );
  check("completion maps replacement into Markdown", result?.from === contentFrom);
  check("completion returns WASM item", result?.options[0]?.label === "answer");
  check("completion exposes type detail", result?.options[0]?.detail === "Int");

  if (failures > 0) process.exit(1);
  console.log("all language support tests passed");
}

void main();
