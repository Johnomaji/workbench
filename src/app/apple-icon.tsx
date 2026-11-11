import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/brand-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // iOS rounds the corners itself and puts transparent areas on black: fill the square.
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#3b4fd8" }}>
        <BrandMark size={150} />
      </div>
    ),
    size,
  );
}
