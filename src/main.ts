import {
  MarkdownPostProcessorContext,
  MarkdownView,
  Plugin,
} from "obsidian";
import { TalkCodeBlock, TalkCodePosition } from "./talkCodeBlock";
import { tlkHighlighter } from "./tlkHighlighter";
import { TalkRunner } from "./talkRunner";
import { TalkRuntime } from "./talkRuntime";

export default class TalkTalkPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerEditorExtension(tlkHighlighter);

    try {
      const runtime = await TalkRuntime.load();
      const runner = new TalkRunner(runtime);
      this.register(() => runner.dispose());

      this.registerMarkdownCodeBlockProcessor("tlk", (source, el, ctx) => {
        ctx.addChild(
          new TalkCodeBlock(el, source, runtime, runner, (position) =>
            this.editCodeBlock(ctx, el, source, position),
          ),
        );
      });
    } catch (error) {
      console.error("Failed to load TalkTalk WASM", error);
    }
  }

  private editCodeBlock(
    ctx: MarkdownPostProcessorContext,
    el: HTMLElement,
    source: string,
    position: TalkCodePosition,
  ): boolean {
    const view = this.app.workspace
      .getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find(
        (candidate): candidate is MarkdownView =>
          candidate instanceof MarkdownView && candidate.containerEl.contains(el),
      );
    if (
      !view ||
      view.getMode() !== "source" ||
      view.file?.path !== ctx.sourcePath
    ) {
      return false;
    }

    const section = ctx.getSectionInfo(el);
    if (!section) return false;

    const sourceIndex = source.length > 0 ? section.text.indexOf(source) : -1;
    const sourceLineOffset =
      sourceIndex >= 0
        ? section.text.slice(0, sourceIndex).split("\n").length - 1
        : 1;
    const sourceLines = source.split("\n");
    const sourceLine = Math.min(position.line, sourceLines.length - 1);
    const ch = Math.min(position.ch, sourceLines[sourceLine].length);

    view.editor.focus();
    view.editor.setCursor({
      line: Math.min(
        section.lineStart + sourceLineOffset + sourceLine,
        section.lineEnd,
      ),
      ch,
    });
    return true;
  }
}
