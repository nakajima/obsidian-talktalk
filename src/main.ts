import { Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  Editor,
  MarkdownPostProcessorContext,
  normalizePath,
  Notice,
  Plugin,
  TFile,
} from "obsidian";
import { TalkCodeBlock } from "./talkCodeBlock";
import {
  accumulatedTalkSource,
  AccumulatedTalkSource,
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
import { TalkTalkSettingTab } from "./settings";
import { readOverrideBytes } from "./wasmUpdater";

export default class TalkTalkPlugin extends Plugin {
  get pluginDir(): string {
    return (
      this.manifest.dir ??
      normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}`)
    );
  }

  async onload(): Promise<void> {
    this.registerEditorExtension(tlkHighlighter);

    let runtime: TalkRuntime;
    try {
      const overrideBytes = await readOverrideBytes(this.app, this.pluginDir);
      runtime = await TalkRuntime.load(overrideBytes);
    } catch (error) {
      console.error("Failed to load TalkTalk WASM", error);
      return;
    }

    this.addSettingTab(new TalkTalkSettingTab(this.app, this, runtime));

    const runner = new TalkRunner(runtime);
    this.register(() => runner.dispose());

    let languageService: TalkLanguageService | undefined;
    try {
      const service = new TalkLanguageService(runtime);
      languageService = service;
      this.register(() => service.dispose());
    } catch (error) {
      console.error("Failed to create TalkTalk language service", error);
    }

    this.registerMarkdownCodeBlockProcessor("tlk", (source, el, ctx) => {
      const accumulatedSource = () =>
        this.accumulatedSourceForContext(ctx, el, source);
      ctx.addChild(
        new TalkCodeBlock(el, source, runtime, runner, {
          noRun: this.noRunForContext(ctx, el, source),
          languageService,
          sourceForAnalysis: accumulatedSource,
          sourceForRun: async () => (await accumulatedSource()).source,
        }),
      );
    });
    this.registerFormatCommand(runtime);

    if (languageService) {
      try {
        await languageService.initialize();
        this.registerEditorExtension(talkLanguageSupport(languageService));
      } catch (error) {
        languageService = undefined;
        console.error("Failed to initialize TalkTalk language service", error);
      }
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
  ): Promise<AccumulatedTalkSource> {
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
    if (!(file instanceof TFile)) return this.unaccumulatedSource(source);
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
  ): AccumulatedTalkSource {
    const blocks = findTalkCodeBlocks(doc);
    const current = this.indexedBlockForContext(doc, ctx, el, source);
    return current
      ? accumulatedTalkSource(blocks, current)
      : this.unaccumulatedSource(source);
  }

  private unaccumulatedSource(source: string): AccumulatedTalkSource {
    return {
      source,
      currentSource: source,
      currentUtf16Offset: 0,
      currentByteOffset: 0,
    };
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
