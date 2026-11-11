/*
 * The mark for generated images (icons, link previews), which can't use the
 * page's CSS variables. Keep in step with components/logo.tsx and the
 * --primary token in globals.css.
 */
export const BRAND_PRIMARY = "#3b4fd8";

export function BrandMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="6" fill={BRAND_PRIMARY} />
      <path d="M6.5 8H11a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2.5" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="6.5" cy="8" r="1.75" fill="#ffffff" />
      <circle cx="17.5" cy="16" r="1.75" fill="#ffffff" />
    </svg>
  );
}
