import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type TalkTalkPlugin from "./main";
import { TalkRuntime } from "./talkRuntime";
import {
  checkForWasmUpdate,
  downloadWasmUpdate,
  overrideStatus,
  removeWasmOverride,
} from "./wasmUpdater";

export class TalkTalkSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: TalkTalkPlugin,
    private readonly runtime: TalkRuntime,
  ) {
    super(app, plugin);
  }

  private get pluginDir(): string {
    return this.plugin.pluginDir;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("TalkTalk WASM").setHeading();

    const source =
      this.runtime.source === "override" ? "downloaded update" : "bundled";
    new Setting(containerEl)
      .setName("Active version")
      .setDesc(`${this.runtime.version} (${source})`);

    new Setting(containerEl)
      .setName("Update WASM bundle")
      .setDesc(
        "Download the latest TalkTalk WASM build without updating the plugin. Reload Obsidian after updating.",
      )
      .addButton((button) => {
        button.setButtonText("Check for updates").onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("Checking...");
          try {
            const check = await checkForWasmUpdate(this.app, this.pluginDir);
            if (!check.updateAvailable) {
              new Notice("TalkTalk WASM is already up to date.");
              return;
            }
            const sha = await downloadWasmUpdate(this.app, this.pluginDir);
            new Notice(
              `TalkTalk WASM updated to build ${sha}. Reload Obsidian to use it.`,
            );
            this.display();
          } catch (error) {
            console.error("Failed to update TalkTalk WASM", error);
            new Notice(
              error instanceof Error
                ? error.message
                : "Failed to update TalkTalk WASM.",
            );
          } finally {
            button.setDisabled(false);
            button.setButtonText("Check for updates");
          }
        });
      });

    void overrideStatus(this.app, this.pluginDir).then((status) => {
      if (!status.installed) return;
      new Setting(containerEl)
        .setName("Downloaded bundle")
        .setDesc(
          status.buildSha
            ? `Build ${status.buildSha} is installed and will be used on next load.`
            : "A downloaded bundle is installed and will be used on next load.",
        )
        .addButton((button) => {
          button
            .setButtonText("Revert to bundled")
            .setWarning()
            .onClick(async () => {
              try {
                await removeWasmOverride(this.app, this.pluginDir);
                new Notice(
                  "TalkTalk WASM override removed. Reload Obsidian to use the bundled version.",
                );
                this.display();
              } catch (error) {
                console.error("Failed to remove TalkTalk WASM override", error);
                new Notice("Failed to remove TalkTalk WASM override.");
              }
            });
        });
    });
  }
}
