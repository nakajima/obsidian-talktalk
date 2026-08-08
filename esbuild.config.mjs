import esbuild from "esbuild";
import process from "node:process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const workerEntries = new Map([
  ["talktalk:runner-worker", "src/runner.worker.ts"],
  ["talktalk:language-worker", "src/language.worker.ts"],
]);

const workerSourcePlugin = {
  name: "worker-source",
  setup(build) {
    build.onResolve({ filter: /^talktalk:(runner|language)-worker$/ }, (args) => ({
      path: args.path,
      namespace: "worker-source",
    }));

    build.onLoad(
      { filter: /.*/, namespace: "worker-source" },
      async (args) => {
        const entryPoint = workerEntries.get(args.path);
        if (!entryPoint) throw new Error(`Unknown worker: ${args.path}`);

        const result = await esbuild.build({
          entryPoints: [entryPoint],
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
          watchFiles: [entryPoint, "vendor/talk-wasm/talk_wasm.js"],
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
  plugins: [workerSourcePlugin],
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
