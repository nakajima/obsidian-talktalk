import { Text } from "@codemirror/state";
import { Editor, Notice, Plugin } from "obsidian";
import { TalkCodeBlock } from "./talkCodeBlock";
import { findTalkCodeBlockAt } from "./talkCodeBlocks";
import { tlkHighlighter } from "./tlkHighlighter";
import { talkLanguageSupport } from "./talkLanguage";
import { TalkLanguageService } from "./talkLanguageService";
import { TalkRunner } from "./talkRunner";
import { TalkRuntime } from "./talkRuntime";

export default class TalkTalkPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerEditorExtension(tlkHighlighter);

    let runtime: TalkRuntime;
    try {
      runtime = await TalkRuntime.load();
    } catch (error) {
      console.error("Failed to load TalkTalk WASM", error);
      return;
    }

    const runner = new TalkRunner(runtime);
    this.register(() => runner.dispose());
    this.registerMarkdownCodeBlockProcessor("tlk", (source, el, ctx) => {
      ctx.addChild(new TalkCodeBlock(el, source, runtime, runner));
    });
    this.registerFormatCommand(runtime);

    try {
      const languageService = new TalkLanguageService(runtime);
      this.register(() => languageService.dispose());
      await languageService.initialize();
      this.registerEditorExtension(talkLanguageSupport(languageService));
    } catch (error) {
      console.error("Failed to initialize TalkTalk language service", error);
    }
  }

  private registerFormatCommand(runtime: TalkRuntime): void {
    this.addCommand({
      id: "format-talktalk-code-block",
      name: "Format TalkTalk code block",
      editorCheckCallback: (checking, editor) => {
        const block = this.codeBlockAtCursor(editor);
        if (!block) return false;
        if (!checking) {
          try {
            const formatted = runtime.format(block.source);
            if (formatted !== block.source) {
              const cursorOffset = editor.posToOffset(editor.getCursor());
              const localCursor = cursorOffset - block.contentFrom;
              editor.replaceRange(
                formatted,
                editor.offsetToPos(block.contentFrom),
                editor.offsetToPos(block.contentTo),
              );
              editor.setCursor(
                editor.offsetToPos(
                  block.contentFrom + Math.min(localCursor, formatted.length),
                ),
              );
            }
          } catch (error) {
            new Notice(
              error instanceof Error
                ? error.message
                : "TalkTalk formatting failed.",
            );
          }
        }
        return true;
      },
    });
  }

  private codeBlockAtCursor(editor: Editor) {
    const doc = Text.of(editor.getValue().split("\n"));
    return findTalkCodeBlockAt(doc, editor.posToOffset(editor.getCursor()));
  }
}
