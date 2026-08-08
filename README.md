# TalkTalk Obsidian plugin

WASM-powered syntax highlighting and execution for TalkTalk code in
` ```tlk ` code blocks.

## How it works

Reading mode: the plugin loads the vendored TalkTalk WebAssembly compiler and
uses its parser-backed highlighter to render each `tlk` block. Every block has
a Run button. Programs execute in a dedicated Web Worker with a two-second
timeout, so an infinite loop cannot block Obsidian's UI thread.

Source mode and Live Preview (while editing inside a fence): Obsidian's
editor is CodeMirror 6. The plugin registers
a small CM6 ViewPlugin (`src/tlkHighlighter.ts`) that scans for ` ```tlk `
fences and decorates tokens with the `cm-*` classes Obsidian themes already
style (`cm-keyword`, `cm-string`, `cm-comment`, `cm-number`, `cm-variable`).

Known parity gap: inside the editor, string escapes (e.g. `\n`) are not
highlighted separately from the surrounding string, unlike in Reading mode.

## Build

```sh
npm install
npm run build   # production bundle -> main.js
npm run dev     # watch mode
npm test        # tokenizer and WASM integration tests
```

## Release

Set the same version in `manifest.json` and `package.json`, commit the change,
then push a tag without a `v` prefix:

```sh
git tag 0.3.3
git push origin 0.3.3
```

The release workflow tests and builds the plugin, then publishes `main.js`,
`manifest.json`, and `styles.css` as individual GitHub release assets for BRAT.

## Install in a vault

Copy (or symlink) `manifest.json`, `main.js`, and `styles.css` into
`<vault>/.obsidian/plugins/talktalk/`, then enable "TalkTalk" under
Settings -> Community plugins (with Restricted Mode off).

For development, symlink the whole directory so `npm run dev` rebuilds are
picked up after an Obsidian reload:

```sh
mkdir -p <vault>/.obsidian/plugins
ln -s "$PWD" <vault>/.obsidian/plugins/talktalk
```

## Test

Open a note with:

    ```tlk
    // line comment
    /* block comment */
    import "std/io"
    let greeting = "hello\n"
    let c = 'x'
    func main() -> Int {
        #"quoted identifier"
        return 42
    }
    ```
