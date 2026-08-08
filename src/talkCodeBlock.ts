import { MarkdownRenderChild, sanitizeHTMLToDom } from "obsidian";
import { TalkRunner } from "./talkRunner";
import { TalkRuntime } from "./talkRuntime";

export class TalkCodeBlock extends MarkdownRenderChild {
  private abortController: AbortController | null = null;
  private outputEl!: HTMLElement;
  private runButton!: HTMLButtonElement;

  constructor(
    containerEl: HTMLElement,
    private readonly source: string,
    private readonly runtime: TalkRuntime,
    private readonly runner: TalkRunner,
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.containerEl.addClass("talktalk-block");

    const toolbar = this.containerEl.createDiv({ cls: "talktalk-toolbar" });
    this.runButton = toolbar.createEl("button", {
      cls: "talktalk-run-button",
      text: "Run",
      attr: { type: "button", "aria-label": "Run TalkTalk code" },
    });

    const pre = this.containerEl.createEl("pre", { cls: "talktalk-code" });
    const code = pre.createEl("code");
    code.appendChild(sanitizeHTMLToDom(this.runtime.highlight(this.source)));

    this.outputEl = this.containerEl.createDiv({ cls: "talktalk-output" });
    this.registerDomEvent(this.runButton, "click", () => void this.run());
  }

  onunload(): void {
    this.abortController?.abort();
  }

  private async run(): Promise<void> {
    this.abortController = new AbortController();
    this.runButton.disabled = true;
    this.runButton.textContent = "Running...";
    this.outputEl.empty();
    this.outputEl.removeClass("is-error");
    this.outputEl.addClass("is-visible");
    this.outputEl.createDiv({ cls: "talktalk-output-status", text: "Running..." });

    try {
      const result = await this.runner.run(
        this.source,
        this.abortController.signal,
      );
      this.outputEl.empty();

      if (result.output.length > 0) {
        this.renderOutputSection("Output", result.output);
      }
      if (result.value.length > 0) {
        this.renderOutputSection("Result", result.value);
      }
      if (result.output.length === 0 && result.value.length === 0) {
        this.outputEl.createDiv({
          cls: "talktalk-output-status",
          text: "Finished with no output.",
        });
      }
    } catch (error) {
      if (this.abortController.signal.aborted) return;
      this.outputEl.empty();
      this.outputEl.addClass("is-error");
      this.outputEl.createDiv({
        cls: "talktalk-output-status",
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.abortController = null;
      this.runButton.disabled = false;
      this.runButton.textContent = "Run";
    }
  }

  private renderOutputSection(label: string, value: string): void {
    const section = this.outputEl.createDiv({ cls: "talktalk-output-section" });
    section.createDiv({ cls: "talktalk-output-label", text: label });
    section.createEl("pre").createEl("code").setText(value);
  }
}
