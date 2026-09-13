import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 88,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "#3f3f46",
        }}
      >
        Everything is&nbsp;<span style={{ color: "#09090b" }}>Tuberculosis</span>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontSize: 34,
          color: "#71717a",
        }}
      >
        Race Wikipedia&apos;s links from anywhere to Tuberculosis
      </div>
    </div>,
    { ...size },
  );
}
