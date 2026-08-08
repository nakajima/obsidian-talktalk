import esbuild from "esbuild";
import process from "node:process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const runnerWorkerPlugin = {
  name: "runner-worker",
  setup(build) {
    build.onResolve({ filter: /^talktalk:runner-worker$/ }, (args) => ({
      path: args.path,
      namespace: "runner-worker",
    }));

    build.onLoad(
      { filter: /.*/, namespace: "runner-worker" },
      async () => {
        const result = await esbuild.build({
          entryPoints: ["src/runner.worker.ts"],
          bundle: true,
          format: "iife",
          platform: "browser",
          target: "es2018",
          minify: prod,
          write: false,
          logLevel: "silent",
          logOverride: { "empty-import-meta": "silent" },
        });
        const source = result.outputFiles[0].text;
        return {
          contents: `export default ${JSON.stringify(source)};`,
          loader: "js",
          watchFiles: [
            "src/runner.worker.ts",
            "vendor/talk-wasm/talk_wasm.js",
          ],
        };
      },
    );
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  // wasm-bindgen includes an unused URL fallback; we always pass a compiled module.
  logOverride: { "empty-import-meta": "silent" },
  loader: { ".wasm": "base64" },
  plugins: [runnerWorkerPlugin],
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
