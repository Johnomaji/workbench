import { ImageResponse } from "next/og";
import { BRAND_PRIMARY, BrandMark } from "@/components/brand-image";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name}: ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLUMNS = [
  { name: "Drafting", cards: 2 },
  { name: "Editing", cards: 1 },
  { name: "Design & video", cards: 2 },
  { name: "Final review", cards: 1 },
];

/** The picture shown when someone shares a link to the site. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(180deg, #eef0fd 0%, #f7f7f8 100%)",
          color: "#18181b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <BrandMark size={64} />
          <span style={{ fontSize: 44, fontWeight: 600 }}>{SITE.name}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 68, fontWeight: 600, lineHeight: 1.1, maxWidth: 900 }}>{SITE.tagline}</span>
          <span style={{ fontSize: 30, color: "#5b5b66" }}>Every step, every person, one board.</span>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {COLUMNS.map((column) => (
            <div key={column.name} style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              <span style={{ fontSize: 20, fontWeight: 600 }}>{column.name}</span>
              {Array.from({ length: column.cards }, (_, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    height: 30,
                    borderRadius: 8,
                    background: "#ffffff",
                    border: "1px solid #e2e2e7",
                    borderLeft: `6px solid ${BRAND_PRIMARY}`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
