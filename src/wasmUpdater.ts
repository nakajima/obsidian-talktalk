import { App, normalizePath, requestUrl } from "obsidian";

const WASM_BASE_URL = "https://wip.talktalk.fyi";
const VERSION_URL = `${WASM_BASE_URL}/version.txt`;
const WASM_URL = `${WASM_BASE_URL}/pkg/talk_wasm_bg.wasm`;

const OVERRIDE_WASM_FILE = "talk_wasm_bg.wasm";
const OVERRIDE_VERSION_FILE = "talk_wasm_version.txt";

function overridePath(pluginDir: string, file: string): string {
  return normalizePath(`${pluginDir}/${file}`);
}

export interface WasmOverrideStatus {
  installed: boolean;
  buildSha: string | null;
}

export interface WasmUpdateCheck {
  remoteSha: string;
  updateAvailable: boolean;
}

export function parseBuildSha(versionText: string): string | null {
  const match = versionText.match(/latest build:\s*(\S+)/);
  return match ? match[1] : null;
}

export async function readOverrideBytes(
  app: App,
  pluginDir: string,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const path = overridePath(pluginDir, OVERRIDE_WASM_FILE);
  try {
    if (!(await app.vault.adapter.exists(path))) return undefined;
    return new Uint8Array(await app.vault.adapter.readBinary(path));
  } catch (error) {
    console.warn("Failed to read TalkTalk WASM override", error);
    return undefined;
  }
}

export async function overrideStatus(
  app: App,
  pluginDir: string,
): Promise<WasmOverrideStatus> {
  const wasmPath = overridePath(pluginDir, OVERRIDE_WASM_FILE);
  if (!(await app.vault.adapter.exists(wasmPath))) {
    return { installed: false, buildSha: null };
  }
  let buildSha: string | null = null;
  const versionPath = overridePath(pluginDir, OVERRIDE_VERSION_FILE);
  if (await app.vault.adapter.exists(versionPath)) {
    buildSha = parseBuildSha(await app.vault.adapter.read(versionPath));
  }
  return { installed: true, buildSha };
}

export async function checkForWasmUpdate(
  app: App,
  pluginDir: string,
): Promise<WasmUpdateCheck> {
  const response = await requestUrl({ url: VERSION_URL });
  const remoteSha = parseBuildSha(response.text);
  if (!remoteSha) {
    throw new Error(`Unexpected version.txt contents: ${response.text}`);
  }
  const status = await overrideStatus(app, pluginDir);
  return {
    remoteSha,
    updateAvailable: status.buildSha !== remoteSha,
  };
}

export async function downloadWasmUpdate(
  app: App,
  pluginDir: string,
): Promise<string> {
  const versionResponse = await requestUrl({ url: VERSION_URL });
  const remoteSha = parseBuildSha(versionResponse.text);
  if (!remoteSha) {
    throw new Error(`Unexpected version.txt contents: ${versionResponse.text}`);
  }

  const wasmResponse = await requestUrl({ url: WASM_URL });
  const bytes = new Uint8Array(wasmResponse.arrayBuffer);
  if (bytes.length === 0) {
    throw new Error("Downloaded TalkTalk WASM bundle is empty.");
  }
  // Make sure the bytes actually compile before replacing the override.
  await WebAssembly.compile(bytes);

  await app.vault.adapter.writeBinary(
    overridePath(pluginDir, OVERRIDE_WASM_FILE),
    wasmResponse.arrayBuffer,
  );
  await app.vault.adapter.write(
    overridePath(pluginDir, OVERRIDE_VERSION_FILE),
    versionResponse.text,
  );
  return remoteSha;
}

export async function removeWasmOverride(
  app: App,
  pluginDir: string,
): Promise<void> {
  for (const file of [OVERRIDE_WASM_FILE, OVERRIDE_VERSION_FILE]) {
    const path = overridePath(pluginDir, file);
    if (await app.vault.adapter.exists(path)) {
      await app.vault.adapter.remove(path);
    }
  }
}
