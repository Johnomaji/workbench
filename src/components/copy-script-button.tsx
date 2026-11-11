"use client";

import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { copyRich } from "@/lib/clipboard";
import { docToHtml, docToText, type ScriptDoc } from "@/lib/script-doc";

/**
 * One-click copy of the script, formatted and as plain text.
 * Pass `doc` for a fixed script, or `getDoc` to copy what's in the editor now.
 */
export function CopyScriptButton({ doc, getDoc, size = "sm" }: { doc?: ScriptDoc; getDoc?: () => ScriptDoc | null; size?: "sm" | "md" }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    const current = getDoc?.() ?? doc;
    if (!current) return;
    const ok = await copyRich({ html: docToHtml(current), text: docToText(current) });
    setStatus(ok ? "copied" : "failed");
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={copy} className={buttonClasses("secondary", size)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {status === "copied" ? (
            <path d="M5 12l5 5L20 7" />
          ) : (
            <>
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </>
          )}
        </svg>
        {status === "copied" ? "Copied" : "Copy script"}
      </button>
      <span role="status" className="text-sm text-muted">
        {status === "copied" ? <span className="sr-only">Script copied</span> : status === "failed" ? "Couldn't copy. Select the text and copy it instead." : ""}
      </span>
    </span>
  );
}
