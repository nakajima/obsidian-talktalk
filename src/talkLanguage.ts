import {
  autocompletion,
  Completion,
  CompletionContext,
  CompletionSource,
} from "@codemirror/autocomplete";
import { EditorState, Extension } from "@codemirror/state";
import { Diagnostic, linter } from "@codemirror/lint";
import { EditorView, hoverTooltip } from "@codemirror/view";
import {
  findTalkCodeBlockAt,
  findTalkCodeBlocks,
  TalkCodeBlock,
  utf16Offset,
  utf8ByteOffset,
} from "./talkCodeBlocks";
import {
  TalkCompletion,
  TalkDiagnostic,
  TalkLanguageService,
} from "./talkLanguageService";

function diagnosticForBlock(
  block: TalkCodeBlock,
  diagnostic: TalkDiagnostic,
): Diagnostic {
  const from = Math.min(
    block.contentTo,
    block.contentFrom + utf16Offset(block.source, diagnostic.range.start),
  );
  const to = Math.min(
    block.contentTo,
    block.contentFrom + utf16Offset(block.source, diagnostic.range.end),
  );
  return {
    from,
    to: Math.max(from, to),
    severity: diagnostic.severity,
    source: "TalkTalk",
    message: diagnostic.message,
  };
}

function completionForItem(item: TalkCompletion): Completion {
  const display = item.display.trim();
  const detail = display.startsWith(item.replacement)
    ? display.slice(item.replacement.length).trim()
    : display;
  return {
    label: item.replacement,
    apply: item.replacement,
    detail: detail.length > 0 ? detail : undefined,
  };
}

export function talkLanguageSupport(service: TalkLanguageService): Extension {
  const completionSource: CompletionSource = async (
    context: CompletionContext,
  ) => {
    const block = findTalkCodeBlockAt(context.state.doc, context.pos);
    if (!block) return null;

    const previous = context.state.sliceDoc(
      Math.max(block.contentFrom, context.pos - 1),
      context.pos,
    );
    if (!context.explicit && !/[A-Za-z0-9_.]/.test(previous)) return null;

    const localPosition = context.pos - block.contentFrom;
    const result = await service.complete(
      block.source,
      utf8ByteOffset(block.source, localPosition),
    );
    if (context.aborted) return null;

    const from = block.contentFrom + utf16Offset(block.source, result.start);
    if (from < block.contentFrom || from > context.pos) return null;
    return {
      from,
      options: result.items.map(completionForItem),
      validFor: /^[A-Za-z_]\w*$/,
    };
  };

  return [
    linter(
      async (view: EditorView) => {
        const results: Diagnostic[] = [];
        for (const block of findTalkCodeBlocks(view.state.doc)) {
          try {
            const diagnostics = await service.check(block.source);
            results.push(
              ...diagnostics.map((diagnostic) =>
                diagnosticForBlock(block, diagnostic),
              ),
            );
          } catch (error) {
            console.error("TalkTalk diagnostics failed", error);
          }
        }
        return results;
      },
      { delay: 600 },
    ),
    hoverTooltip(
      async (view, position) => {
        const doc = view.state.doc;
        const block = findTalkCodeBlockAt(doc, position);
        if (!block) return null;

        const hover = await service.hover(
          block.source,
          utf8ByteOffset(block.source, position - block.contentFrom),
        );
        if (!hover || view.state.doc !== doc) return null;

        const from = Math.min(
          block.contentTo,
          block.contentFrom + utf16Offset(block.source, hover.range.start.byte),
        );
        const to = Math.min(
          block.contentTo,
          block.contentFrom + utf16Offset(block.source, hover.range.end.byte),
        );
        return {
          pos: from,
          end: Math.max(from, to),
          above: true,
          create: () => {
            const dom = document.createElement("div");
            dom.className = "talktalk-hover";
            const code = document.createElement("code");
            code.textContent = hover.contents;
            dom.appendChild(code);
            return { dom };
          },
        };
      },
      { hideOnChange: true, hoverTime: 300 },
    ),
    EditorState.languageData.of((state, position) =>
      findTalkCodeBlockAt(state.doc, position)
        ? [{ autocomplete: completionSource }]
        : [],
    ),
    autocompletion(),
  ];
}
