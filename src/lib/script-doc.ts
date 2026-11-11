/**
 * Scripts are stored as rich-text documents in the editor's JSON format.
 * These helpers read them without the editor: plain text (copy, compare,
 * search) and safe HTML (copy into Word / Google Docs). Plain text can also be
 * turned into a document (used by the seed and for old plain-text scripts).
 */

type Mark = { type: string };
type JsonNode = { type: string; attrs?: Record<string, unknown>; content?: JsonNode[]; marks?: Mark[]; text?: string };
export type ScriptDoc = { type: "doc"; content: JsonNode[] };

const MAX_LENGTH = 100_000;

export const EMPTY_SCRIPT: ScriptDoc = { type: "doc", content: [{ type: "paragraph" }] };

export function isScriptDoc(value: unknown): value is ScriptDoc {
  return Boolean(value && typeof value === "object" && (value as { type?: unknown }).type === "doc");
}

/** Plain text → document: one paragraph per line, blank lines kept as empty paragraphs. */
export function textToDoc(text: string): ScriptDoc {
  const lines = normalizeScriptText(text).split("\n");
  return {
    type: "doc",
    content: lines.map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" })),
  };
}

function inlineText(node: JsonNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineText).join("");
}

function blockLines(nodes: JsonNode[], out: string[]) {
  for (const node of nodes) {
    if (node.type === "bulletList" || node.type === "orderedList") {
      const start = Number(node.attrs?.start ?? 1) || 1;
      (node.content ?? []).forEach((item, i) => {
        const marker = node.type === "bulletList" ? "• " : `${start + i}. `;
        const inner: string[] = [];
        blockLines(item.content ?? [], inner);
        inner.forEach((line, j) => out.push((j === 0 ? marker : " ".repeat(marker.length)) + line));
      });
    } else if (node.content && node.type !== "paragraph" && node.type !== "heading") {
      blockLines(node.content, out);
    } else {
      out.push(...inlineText(node).split("\n"));
    }
  }
}

/** Document → plain text, one line per block; lists get "•" or "1." markers. */
export function docToText(doc: unknown): string {
  if (!isScriptDoc(doc)) return "";
  const lines: string[] = [];
  blockLines(doc.content ?? [], lines);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const MARK_TAGS: Record<string, string> = { bold: "strong", italic: "em", underline: "u" };
const BLOCK_TAGS: Record<string, string> = { paragraph: "p", bulletList: "ul", orderedList: "ol", listItem: "li" };

function nodeHtml(node: JsonNode): string {
  if (node.type === "text") {
    let html = escapeHtml(node.text ?? "");
    for (const mark of node.marks ?? []) {
      const tag = MARK_TAGS[mark.type];
      if (tag) html = `<${tag}>${html}</${tag}>`;
    }
    return html;
  }
  if (node.type === "hardBreak") return "<br>";
  const inner = (node.content ?? []).map(nodeHtml).join("");
  if (node.type === "heading") {
    const level = node.attrs?.level === 3 ? 3 : 2;
    return `<h${level}>${inner}</h${level}>`;
  }
  const tag = BLOCK_TAGS[node.type];
  return tag ? `<${tag}>${inner}</${tag}>` : inner;
}

/** Document → HTML built only from known tags with escaped text (safe to put on the clipboard). */
export function docToHtml(doc: unknown): string {
  if (!isScriptDoc(doc)) return "";
  return (doc.content ?? []).map(nodeHtml).join("");
}

/** Consistent line endings and no trailing spaces, so "no change" is detected reliably. */
export function normalizeScriptText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/^\n+|\n+$/g, "")
    .slice(0, MAX_LENGTH);
}

export const SCRIPT_MAX_LENGTH = MAX_LENGTH;

/** Key-order-independent JSON, for "has anything changed?" checks (Postgres reorders jsonb keys). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
