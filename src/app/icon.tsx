import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/brand-image";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <BrandMark size={32} />
      </div>
    ),
    size,
  );
}
