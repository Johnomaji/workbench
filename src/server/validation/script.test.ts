import { describe, expect, it } from "vitest";
import { docToHtml, docToText, textToDoc } from "@/lib/script-doc";
import { canonicalJson, parseScriptContent, SCRIPT_JSON_MAX } from "./script";

const doc = (...content: unknown[]) => JSON.stringify({ type: "doc", content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string, marks?: string[]) => ({ type: "text", text, ...(marks ? { marks: marks.map((type) => ({ type })) } : {}) });

describe("parseScriptContent", () => {
  it("accepts what the editor produces", () => {
    const result = parseScriptContent(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [t("Scene 1")] },
        p(t("Visual: ", ["bold"]), t("rooftop", ["italic", "underline"])),
        { type: "bulletList", content: [{ type: "listItem", content: [p(t("Wide shot"))] }] },
        { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [p(t("Cut"))] }] },
        p(t("Line one"), { type: "hardBreak" }, t("line two")),
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe("Scene 1\nVisual: rooftop\n• Wide shot\n1. Cut\nLine one\nline two");
  });

  it("accepts an empty script", () => {
    expect(parseScriptContent(doc({ type: "paragraph" })).ok).toBe(true);
  });

  it("refuses node types that are turned off or don't exist", () => {
    for (const node of [
      { type: "codeBlock", content: [t("x")] },
      { type: "blockquote", content: [p(t("x"))] },
      { type: "image", attrs: { src: "https://evil.example/x.png" } },
      { type: "iframe" },
    ]) {
      expect(parseScriptContent(doc(node)).ok).toBe(false);
    }
  });

  it("refuses links and other marks that are turned off", () => {
    expect(parseScriptContent(doc(p({ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }))).ok).toBe(false);
    expect(parseScriptContent(doc(p(t("x", ["strike"])))).ok).toBe(false);
  });

  it("refuses malformed structure", () => {
    expect(parseScriptContent(doc(t("text directly in the document"))).ok).toBe(false);
    expect(parseScriptContent(doc(p({ type: "text", text: "" }))).ok).toBe(false);
    expect(parseScriptContent(JSON.stringify({ type: "paragraph" })).ok).toBe(false);
    expect(parseScriptContent("not json").ok).toBe(false);
    expect(parseScriptContent(42).ok).toBe(false);
  });

  it("drops unknown attributes and clamps heading levels", () => {
    const result = parseScriptContent(
      doc({ type: "heading", attrs: { level: 1, onclick: "alert(1)" }, content: [t("Title")] }, { type: "heading", attrs: { level: 7 }, content: [t("Sub")] }),
    );
    expect(result.ok && result.doc.content.map((n) => n.attrs)).toEqual([{ level: 2 }, { level: 2 }]);
  });

  it("refuses oversized scripts", () => {
    expect(parseScriptContent("x".repeat(SCRIPT_JSON_MAX + 1)).ok).toBe(false);
  });
});

describe("docToHtml", () => {
  it("builds clean HTML and escapes text", () => {
    const html = docToHtml({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 3 }, content: [t("Scene <1>")] },
        p(t("<script>alert(1)</script>", ["bold"])),
        { type: "bulletList", content: [{ type: "listItem", content: [p(t("A & B"))] }] },
      ],
    });
    expect(html).toBe(
      "<h3>Scene &lt;1&gt;</h3><p><strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong></p><ul><li><p>A &amp; B</p></li></ul>",
    );
  });

  it("ignores unknown nodes but keeps their text escaped", () => {
    expect(docToHtml({ type: "doc", content: [{ type: "mystery", content: [t("<b>hi</b>")] }] })).toBe("&lt;b&gt;hi&lt;/b&gt;");
  });
});

describe("docToText", () => {
  it("numbers ordered lists from their start and indents continuation lines", () => {
    const text = docToText({
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [{ type: "listItem", content: [p(t("Third")), p(t("more"))] }, { type: "listItem", content: [p(t("Fourth"))] }],
        },
      ],
    });
    expect(text).toBe("3. Third\n   more\n4. Fourth");
  });

  it("round-trips plain text through a document", () => {
    const text = "Scene 1\n\nVisual: sunrise";
    expect(docToText(textToDoc(text))).toBe(text);
  });
});

describe("canonicalJson", () => {
  it("ignores key order", () => {
    expect(canonicalJson({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(canonicalJson({ a: [{ x: 1, y: 2 }], b: 1 }));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
});
