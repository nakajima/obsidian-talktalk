import {
  MarkdownRenderChild,
  sanitizeHTMLToDom,
  setIcon,
} from "obsidian";
import { TalkRunner } from "./talkRunner";
import { TalkRuntime } from "./talkRuntime";

export interface TalkCodeBlockOptions {
  noRun: boolean;
  sourceForRun(): string | Promise<string>;
}

export class TalkCodeBlock extends MarkdownRenderChild {
  private abortController: AbortController | null = null;
  private outputEl!: HTMLElement;
  private runButton!: HTMLButtonElement;
  private runButtonSurface!: HTMLSpanElement;

  constructor(
    containerEl: HTMLElement,
    private readonly source: string,
    private readonly runtime: TalkRuntime,
    private readonly runner: TalkRunner,
    private readonly options: TalkCodeBlockOptions,
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.containerEl.addClass("talktalk-block");

    if (!this.options.noRun) {
      this.containerEl.addClass("has-run-button");
      this.runButton = this.containerEl.createEl("button", {
        cls: "talktalk-run-button",
        attr: { type: "button", "aria-label": "Run TalkTalk code" },
      });
      this.runButtonSurface = this.runButton.createSpan({
        cls: "talktalk-run-button-surface",
      });
      this.setRunning(false);
      this.registerDomEvent(this.runButton, "click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleRun();
      });
    }

    const pre = this.containerEl.createEl("pre", { cls: "talktalk-code" });
    const code = pre.createEl("code");
    code.appendChild(sanitizeHTMLToDom(this.runtime.highlight(this.source)));

    this.outputEl = this.containerEl.createDiv({ cls: "talktalk-output" });
    this.registerDomEvent(code, "click", (event) => {
      const editButton = this.containerEl
        .closest(".cm-preview-code-block")
        ?.querySelector<HTMLElement>(".edit-block-button");
      if (editButton) {
        event.preventDefault();
        event.stopPropagation();
        editButton.click();
      }
    });
  }

  onunload(): void {
    this.abortController?.abort();
  }

  private toggleRun(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.outputEl.empty();
      this.outputEl.createDiv({
        cls: "talktalk-output-status",
        text: "Execution cancelled.",
      });
      return;
    }
    void this.run();
  }

  private async run(): Promise<void> {
    const controller = new AbortController();
    this.abortController = controller;
    this.setRunning(true);
    this.outputEl.empty();
    this.outputEl.removeClass("is-error");
    this.outputEl.addClass("is-visible");
    this.outputEl.createDiv({ cls: "talktalk-output-status", text: "Running..." });

    try {
      const source = await this.options.sourceForRun();
      if (controller.signal.aborted) return;
      const result = await this.runner.run(source, controller.signal);
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
      if (controller.signal.aborted) return;
      this.outputEl.empty();
      this.outputEl.addClass("is-error");
      this.outputEl.createDiv({
        cls: "talktalk-output-status",
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (this.abortController === controller) this.abortController = null;
      this.setRunning(false);
    }
  }

  private setRunning(running: boolean): void {
    setIcon(this.runButtonSurface, running ? "square" : "play");
    this.runButton.classList.toggle("is-running", running);
    const label = running ? "Stop TalkTalk code" : "Run TalkTalk code";
    this.runButton.setAttribute("aria-label", label);
    this.runButton.setAttribute("title", label);
  }

  private renderOutputSection(label: string, value: string): void {
    const section = this.outputEl.createDiv({ cls: "talktalk-output-section" });
    section.createDiv({ cls: "talktalk-output-label", text: label });
    section.createEl("pre").createEl("code").setText(value);
  }
}
