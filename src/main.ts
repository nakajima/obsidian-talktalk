import { Plugin } from "obsidian";
import { TalkCodeBlock } from "./talkCodeBlock";
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
        ctx.addChild(new TalkCodeBlock(el, source, runtime, runner));
      });
    } catch (error) {
      console.error("Failed to load TalkTalk WASM", error);
    }
  }
}
