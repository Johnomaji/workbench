import { Fragment, type ReactNode } from "react";
import type { ScriptDoc } from "@/lib/script-doc";

type JsonNode = ScriptDoc["content"][number];

function render(node: JsonNode, key: number): ReactNode {
  if (node.type === "text") {
    let out: ReactNode = node.text ?? "";
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") out = <strong>{out}</strong>;
      else if (mark.type === "italic") out = <em>{out}</em>;
      else if (mark.type === "underline") out = <u>{out}</u>;
    }
    return <Fragment key={key}>{out}</Fragment>;
  }
  if (node.type === "hardBreak") return <br key={key} />;
  const children = (node.content ?? []).map(render);
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading":
      return node.attrs?.level === 3 ? <h3 key={key}>{children}</h3> : <h2 key={key}>{children}</h2>;
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={Number(node.attrs?.start ?? 1) || 1}>
          {children}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children}</li>;
    default:
      return <Fragment key={key}>{children}</Fragment>;
  }
}

/** Read-only script, rendered from the stored document (no HTML injection). */
export function ScriptDocView({ doc, className }: { doc: ScriptDoc; className?: string }) {
  return <div className={`script-doc ${className ?? ""}`}>{(doc.content ?? []).map(render)}</div>;
}
