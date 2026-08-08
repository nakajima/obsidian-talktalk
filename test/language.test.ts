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
  const fakeService = {
    check: async () => [],
    hover: async () => null,
    complete: async () => ({
      start: 0,
      items: [{ display: "answer                 Int", replacement: "answer" }],
    }),
  } as unknown as TalkLanguageService;

  const source = "before\n```tlk\nans\n```\nafter";
  const contentFrom = source.indexOf("ans");
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
  check("completion maps replacement into Markdown", result?.from === contentFrom);
  check("completion returns WASM item", result?.options[0]?.label === "answer");
  check("completion exposes type detail", result?.options[0]?.detail === "Int");

  if (failures > 0) process.exit(1);
  console.log("all language support tests passed");
}

void main();
