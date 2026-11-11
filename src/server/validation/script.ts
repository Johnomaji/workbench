import { getSchema } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { docToText, type ScriptDoc } from "@/lib/script-doc";
import { SCRIPT_HEADING_LEVELS, scriptExtensions } from "@/lib/script-extensions";

export { canonicalJson } from "@/lib/script-doc";

/** Serialized size limit for one script (roughly 60–80 pages of text). */
export const SCRIPT_JSON_MAX = 500_000;

const schema = getSchema(scriptExtensions);

type JsonNode = { type?: unknown; attrs?: Record<string, unknown>; content?: unknown; marks?: unknown; text?: unknown };

/** Clamp heading levels: the schema itself accepts any number. */
function normalize(node: JsonNode) {
  if (node.type === "heading") {
    const level = Number(node.attrs?.level);
    node.attrs = { level: (SCRIPT_HEADING_LEVELS as readonly number[]).includes(level) ? level : SCRIPT_HEADING_LEVELS[0] };
  }
  if (Array.isArray(node.content)) for (const child of node.content) if (child && typeof child === "object") normalize(child as JsonNode);
}

export type ParsedScript = { ok: true; doc: ScriptDoc; text: string } | { ok: false; reason: string };

/**
 * Checks a script sent by the browser against the editor's schema. Unknown
 * node or mark types, malformed structure and oversized documents are refused;
 * unknown attributes are dropped. Returns the clean document and its plain text.
 */
export function parseScriptContent(raw: unknown): ParsedScript {
  if (typeof raw !== "string") return { ok: false, reason: "The script couldn't be read. Reload the page and try again." };
  if (raw.length > SCRIPT_JSON_MAX) return { ok: false, reason: "The script is too long to save." };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "The script couldn't be read. Reload the page and try again." };
  }
  if (!json || typeof json !== "object" || (json as JsonNode).type !== "doc") {
    return { ok: false, reason: "The script couldn't be read. Reload the page and try again." };
  }

  normalize(json as JsonNode);
  try {
    const node = Node.fromJSON(schema, json);
    node.check();
    const doc = node.toJSON() as ScriptDoc;
    return { ok: true, doc, text: docToText(doc) };
  } catch {
    return { ok: false, reason: "The script contains formatting that can't be saved. Remove anything pasted from elsewhere and try again." };
  }
}

