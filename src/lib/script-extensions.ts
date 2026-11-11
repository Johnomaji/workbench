import StarterKit from "@tiptap/starter-kit";

/**
 * The one definition of what a script may contain, shared by the editor (in
 * the browser) and the server's validation. Anything not listed is turned off,
 * so it can't be typed, pasted or saved.
 *
 * Allowed: paragraphs, headings (2 and 3), bold, italic, underline,
 * bulleted and numbered lists, line breaks.
 */
export const SCRIPT_HEADING_LEVELS = [2, 3] as const;

export const scriptExtensions = [
  StarterKit.configure({
    heading: { levels: [...SCRIPT_HEADING_LEVELS] },
    // Off: links (no URLs in scripts), code, quotes, rules, strikethrough.
    link: false,
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    strike: false,
  }),
];
