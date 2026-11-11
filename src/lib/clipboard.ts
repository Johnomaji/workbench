/**
 * Copies formatted text (for Word / Google Docs) and plain text (for WhatsApp,
 * email) in one go. Falls back to plain text, then to the old copy command,
 * so it works on older phones and non-HTTPS development servers.
 */
export async function copyRich({ html, text }: { html: string; text: string }): Promise<boolean> {
  const fullHtml = `<meta charset="utf-8">${html}`;
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([fullHtml], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    // Some browsers refuse rich clipboard writes; try plain text next.
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const onCopy = (event: ClipboardEvent) => {
      event.clipboardData?.setData("text/html", fullHtml);
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    const ok = document.execCommand("copy");
    document.removeEventListener("copy", onCopy);
    return ok;
  } catch {
    return false;
  }
}
