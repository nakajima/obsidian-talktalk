import { Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  Editor,
  MarkdownPostProcessorContext,
  Notice,
  Plugin,
  TFile,
} from "obsidian";
import { TalkCodeBlock } from "./talkCodeBlock";
import {
  accumulatedTalkSource,
  findTalkCodeBlockAt,
  findTalkCodeBlocks,
  matchOpeningFence,
  TalkCodeBlock as IndexedTalkCodeBlock,
} from "./talkCodeBlocks";
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
      ctx.addChild(
        new TalkCodeBlock(el, source, runtime, runner, {
          noRun: this.noRunForContext(ctx, el, source),
          sourceForRun: () =>
            this.accumulatedSourceForContext(ctx, el, source),
        }),
      );
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

  private noRunForContext(
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
    source: string,
  ): boolean {
    const editorView = this.editorViewFor(el);
    const indexed = editorView
      ? this.indexedBlockForContext(editorView.state.doc, ctx, el, source)
      : null;
    if (indexed) return indexed.noRun;

    const firstLine = ctx.getSectionInfo(el)?.text.split("\n", 1)[0] ?? "";
    return matchOpeningFence(firstLine.replace(/\r$/, ""))?.noRun ?? false;
  }

  private async accumulatedSourceForContext(
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
    source: string,
  ): Promise<string> {
    const editorView = this.editorViewFor(el);
    if (editorView) {
      return this.accumulatedSourceFromDocument(
        editorView.state.doc,
        ctx,
        el,
        source,
      );
    }

    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return source;
    const markdown = (await this.app.vault.cachedRead(file)).replace(/\r\n/g, "\n");
    return this.accumulatedSourceFromDocument(
      Text.of(markdown.split("\n")),
      ctx,
      el,
      source,
    );
  }

  private editorViewFor(el: HTMLElement): EditorView | null {
    const editor = el.closest<HTMLElement>(".cm-editor");
    return editor ? EditorView.findFromDOM(editor) : null;
  }

  private accumulatedSourceFromDocument(
    doc: Text,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
    source: string,
  ): string {
    const blocks = findTalkCodeBlocks(doc);
    const current = this.indexedBlockForContext(doc, ctx, el, source);
    return current ? accumulatedTalkSource(blocks, current).source : source;
  }

  private indexedBlockForContext(
    doc: Text,
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
    source: string,
  ): IndexedTalkCodeBlock | null {
    const blocks = findTalkCodeBlocks(doc);
    const section = ctx.getSectionInfo(el);
    if (section && section.lineStart < doc.lines) {
      const sectionStart = doc.line(section.lineStart + 1).from;
      const exact = blocks.find((block) => block.from === sectionStart);
      if (exact) return exact;
      const containing = blocks.find(
        (block) => sectionStart >= block.from && sectionStart <= block.to,
      );
      if (containing) return containing;
    }

    const matches = blocks.filter((block) => block.source === source);
    return matches.length === 1 ? matches[0] : null;
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
