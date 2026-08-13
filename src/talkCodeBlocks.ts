import { Text } from "@codemirror/state";

export interface TalkFence {
  char: string;
  len: number;
  accumulateGroup: string | null;
  noRun: boolean;
}

export interface TalkCodeBlock {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  source: string;
  accumulateGroup: string | null;
  noRun: boolean;
}

export interface AccumulatedTalkSource {
  source: string;
  currentSource: string;
  currentUtf16Offset: number;
  currentByteOffset: number;
}

interface MarkdownFence extends TalkFence {
  isTalk: boolean;
}

const blocksByDocument = new WeakMap<Text, readonly TalkCodeBlock[]>();

function accumulateGroup(info: string): string | null {
  const marker = "accumulate";
  const start = info.indexOf(marker);
  if (start === -1) return null;

  const rest = info.slice(start + marker.length).trimStart();
  if (!rest.startsWith("(")) return "";
  const end = rest.indexOf(")", 1);
  return end === -1 ? null : rest.slice(1, end).trim();
}

function matchMarkdownFence(text: string): MarkdownFence | null {
  const match = /^\s*(`{3,}|~{3,})[ \t]*([^ \t]*)(?:[ \t]+(.*))?$/.exec(text);
  if (!match) return null;

  const info = match[3] ?? "";
  const isTalk = match[2] === "tlk";
  return {
    char: match[1][0],
    len: match[1].length,
    isTalk,
    accumulateGroup: isTalk ? accumulateGroup(info) : null,
    noRun: isTalk && info.includes("norun"),
  };
}

export function matchOpeningFence(text: string): TalkFence | null {
  const fence = matchMarkdownFence(text);
  if (!fence?.isTalk) return null;
  return {
    char: fence.char,
    len: fence.len,
    accumulateGroup: fence.accumulateGroup,
    noRun: fence.noRun,
  };
}

export function isClosingFence(
  text: string,
  char: string,
  len: number,
): boolean {
  const trimmed = text.trim();
  if (trimmed.length < len) return false;
  for (const current of trimmed) {
    if (current !== char) return false;
  }
  return true;
}

export function findTalkCodeBlocks(doc: Text): readonly TalkCodeBlock[] {
  const cached = blocksByDocument.get(doc);
  if (cached) return cached;

  const blocks: TalkCodeBlock[] = [];
  let open:
    | {
        from: number;
        contentFrom: number;
        fence: MarkdownFence;
      }
    | null = null;

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
    const line = doc.line(lineNumber);
    if (open) {
      if (isClosingFence(line.text, open.fence.char, open.fence.len)) {
        if (open.fence.isTalk) {
          const contentTo = Math.max(open.contentFrom, line.from - 1);
          blocks.push({
            from: open.from,
            to: line.to,
            contentFrom: open.contentFrom,
            contentTo,
            source: doc.sliceString(open.contentFrom, contentTo),
            accumulateGroup: open.fence.accumulateGroup,
            noRun: open.fence.noRun,
          });
        }
        open = null;
      }
      continue;
    }

    const fence = matchMarkdownFence(line.text);
    if (!fence) continue;

    open = {
      from: line.from,
      contentFrom: Math.min(line.to + 1, doc.length),
      fence,
    };
  }

  if (open?.fence.isTalk) {
    blocks.push({
      from: open.from,
      to: doc.length,
      contentFrom: open.contentFrom,
      contentTo: doc.length,
      source: doc.sliceString(open.contentFrom),
      accumulateGroup: open.fence.accumulateGroup,
      noRun: open.fence.noRun,
    });
  }

  blocksByDocument.set(doc, blocks);
  return blocks;
}

export function findTalkCodeBlockAt(
  doc: Text,
  position: number,
): TalkCodeBlock | null {
  return (
    findTalkCodeBlocks(doc).find(
      (block) =>
        position >= block.contentFrom && position <= block.contentTo,
    ) ?? null
  );
}

export function accumulatedTalkSource(
  blocks: readonly TalkCodeBlock[],
  current: TalkCodeBlock,
): AccumulatedTalkSource {
  const priorSources: string[] = [];
  if (current.accumulateGroup !== null) {
    const currentIndex = blocks.indexOf(current);
    for (const candidate of blocks.slice(0, currentIndex)) {
      if (
        candidate.accumulateGroup === current.accumulateGroup &&
        candidate.source.trim().length > 0
      ) {
        priorSources.push(candidate.source);
      }
    }
  }

  const prefix = priorSources.join("\n\n");
  const currentPrefix = prefix.length > 0 ? `${prefix}\n\n` : "";
  return {
    source: `${currentPrefix}${current.source}`,
    currentSource: current.source,
    currentUtf16Offset: currentPrefix.length,
    currentByteOffset: utf8ByteOffset(currentPrefix, currentPrefix.length),
  };
}

export function utf8ByteOffset(source: string, utf16Offset: number): number {
  return new TextEncoder().encode(source.slice(0, utf16Offset)).length;
}

export function utf16Offset(source: string, utf8Offset: number): number {
  const bytes = new TextEncoder().encode(source);
  const end = Math.max(0, Math.min(utf8Offset, bytes.length));
  return new TextDecoder().decode(bytes.slice(0, end)).length;
}
