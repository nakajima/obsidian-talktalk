import { Text } from "@codemirror/state";

export interface TalkCodeBlock {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  source: string;
}

const blocksByDocument = new WeakMap<Text, readonly TalkCodeBlock[]>();

export function matchOpeningFence(
  text: string,
): { char: string; len: number } | null {
  const match = /^\s*(`{3,}|~{3,})[ \t]*tlk(?:[ \t]+.*)?$/.exec(text);
  if (!match) return null;
  return { char: match[1][0], len: match[1].length };
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
    | { from: number; contentFrom: number; char: string; len: number }
    | null = null;

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
    const line = doc.line(lineNumber);
    if (open) {
      if (isClosingFence(line.text, open.char, open.len)) {
        const contentTo = Math.max(open.contentFrom, line.from - 1);
        blocks.push({
          from: open.from,
          to: line.to,
          contentFrom: open.contentFrom,
          contentTo,
          source: doc.sliceString(open.contentFrom, contentTo),
        });
        open = null;
      }
      continue;
    }

    const fence = matchOpeningFence(line.text);
    if (fence) {
      open = {
        from: line.from,
        contentFrom: Math.min(line.to + 1, doc.length),
        ...fence,
      };
    }
  }

  if (open) {
    blocks.push({
      from: open.from,
      to: doc.length,
      contentFrom: open.contentFrom,
      contentTo: doc.length,
      source: doc.sliceString(open.contentFrom),
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

export function utf8ByteOffset(source: string, utf16Offset: number): number {
  return new TextEncoder().encode(source.slice(0, utf16Offset)).length;
}

export function utf16Offset(source: string, utf8Offset: number): number {
  const bytes = new TextEncoder().encode(source);
  const end = Math.max(0, Math.min(utf8Offset, bytes.length));
  return new TextDecoder().decode(bytes.slice(0, end)).length;
}
