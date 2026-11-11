"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { canonicalJson, type ScriptDoc } from "@/lib/script-doc";
import { scriptExtensions } from "@/lib/script-extensions";
import { CopyScriptButton } from "./copy-script-button";
import { ScriptDocView } from "./script-doc-view";

// ── Unsaved edits kept on this device ──────────────────────────────────

type Draft = { baseVersion: number; doc: ScriptDoc; savedAt: number };
const draftKey = (itemId: string) => `script-draft:${itemId}`;
const DRAFT_EVENT = "script-draft-change";

function readDraftRaw(itemId: string): string | null {
  try {
    return localStorage.getItem(draftKey(itemId));
  } catch {
    return null;
  }
}

function writeDraft(itemId: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(itemId), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(itemId));
  } catch {
    // Storage full or blocked: the editor still works, there's just no backup.
  }
  window.dispatchEvent(new Event(DRAFT_EVENT));
}

export function clearScriptDraft(itemId: string) {
  writeDraft(itemId, null);
}

function useStoredDraft(itemId: string): Draft | null {
  const raw = useSyncExternalStore(
    (onChange) => {
      window.addEventListener(DRAFT_EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(DRAFT_EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => readDraftRaw(itemId),
    () => null,
  );
  return useMemo(() => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Draft;
      return parsed && parsed.doc?.type === "doc" ? parsed : null;
    } catch {
      return null;
    }
  }, [raw]);
}

// ── Toolbar ─────────────────────────────────────────────────────────────

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active === undefined ? undefined : active}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "inline-flex min-h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-semibold text-muted",
        "hover:bg-surface hover:text-foreground disabled:opacity-40 aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-sm",
      )}
    >
      {children}
    </button>
  );
}

const icon = (d: ReactNode) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 p-1">
      <ToolButton label="Heading" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolButton>
      <ToolButton label="Subheading" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolButton>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border-strong" />
      <ToolButton label="Bold" shortcut={`${mod}+B`} active={s.bold} onClick={() => chain().toggleBold().run()}>
        <span className="font-bold">B</span>
      </ToolButton>
      <ToolButton label="Italic" shortcut={`${mod}+I`} active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <span className="font-serif italic">I</span>
      </ToolButton>
      <ToolButton label="Underline" shortcut={`${mod}+U`} active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <span className="underline">U</span>
      </ToolButton>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border-strong" />
      <ToolButton label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        {icon(
          <>
            <path d="M9 6h11M9 12h11M9 18h11" />
            <circle cx="4.5" cy="6" r="1" fill="currentColor" />
            <circle cx="4.5" cy="12" r="1" fill="currentColor" />
            <circle cx="4.5" cy="18" r="1" fill="currentColor" />
          </>,
        )}
      </ToolButton>
      <ToolButton label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        {icon(<path d="M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M4 9h3M4 15.5c.5-.7 2.5-1 2.5.5 0 1.2-2.5 1.8-2.5 3.5h3" />)}
      </ToolButton>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border-strong" />
      <ToolButton label="Undo" shortcut={`${mod}+Z`} disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        {icon(<path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />)}
      </ToolButton>
      <ToolButton label="Redo" shortcut={`${mod}+Shift+Z`} disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        {icon(<path d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />)}
      </ToolButton>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────

/**
 * Rich-text script editor. Puts the document (JSON) in a hidden input named
 * `content` for the surrounding form. Unsaved edits are backed up on this
 * device and offered back if the page is reopened.
 */
export function ScriptEditor({
  itemId,
  baseVersion,
  initial,
  onDirtyChange,
}: {
  itemId: string;
  baseVersion: number;
  initial: ScriptDoc;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [json, setJson] = useState(() => JSON.stringify(initial));
  const [draftHandled, setDraftHandled] = useState(false);
  const storedDraft = useStoredDraft(itemId);
  const backupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: scriptExtensions,
    content: initial,
    immediatelyRender: false, // server-rendered pages hydrate first; the view below fills the gap
    editorProps: {
      attributes: {
        class: "script-doc min-h-72 px-4 py-3 focus:outline-none",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Script",
      },
      handleKeyDown(view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          view.dom.closest("form")?.requestSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor: e }) {
      const doc = e.getJSON() as ScriptDoc;
      setJson(JSON.stringify(doc));
      onDirtyChange(true);
      setDraftHandled(true); // typing means they've moved on from any old backup
      if (backupTimer.current) clearTimeout(backupTimer.current);
      backupTimer.current = setTimeout(() => writeDraft(itemId, { baseVersion, doc, savedAt: Date.now() }), 400);
    },
  });

  const draft =
    !draftHandled && storedDraft && canonicalJson(storedDraft.doc) !== canonicalJson(initial) ? storedDraft : null;

  function restore() {
    if (!editor || !draft) return;
    editor.commands.setContent(draft.doc);
    setJson(JSON.stringify(draft.doc));
    onDirtyChange(true);
    setDraftHandled(true);
  }

  function discard() {
    clearScriptDraft(itemId);
    setDraftHandled(true);
  }

  return (
    <div className="space-y-3">
      {draft && (
        <div role="status" className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning-surface p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            You have unsaved changes from {formatRelative(new Date(draft.savedAt))} on this device.
            {draft.baseVersion !== baseVersion && " The script has been saved by someone since, so check before saving over it."}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={restore} disabled={!editor}>
              Restore them
            </Button>
            <Button size="sm" variant="ghost" onClick={discard}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <input type="hidden" name="content" value={json} />
      <div className="overflow-hidden rounded-lg border border-border-strong bg-surface focus-within:outline-2 focus-within:outline-focus">
        {editor ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-1 border-b border-border bg-surface-muted">
              <Toolbar editor={editor} />
              <div className="p-1">
                <CopyScriptButton getDoc={() => editor.getJSON() as ScriptDoc} />
              </div>
            </div>
            <EditorContent editor={editor} />
          </>
        ) : (
          <>
            <div aria-hidden="true" className="h-11 border-b border-border bg-surface-muted" />
            <ScriptDocView doc={initial} className="min-h-72 px-4 py-3 opacity-70" />
          </>
        )}
      </div>
    </div>
  );
}
