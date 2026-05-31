import { ImageResponse } from "next/og";

/** Next.js auto-generates /favicon → ใช้ Edge runtime + SVG */
export const runtime  = "edge";
export const size     = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
          borderRadius: 7,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", width: 22, height: 22, gap: 2 }}>
          <div style={{ width: 10, height: 10, background: "rgba(255,255,255,0.95)", borderRadius: 1 }} />
          <div style={{ width: 10, height: 10, background: "rgba(255,255,255,0.7)",  borderRadius: 1 }} />
          <div style={{ width: 10, height: 10, background: "rgba(255,255,255,0.7)",  borderRadius: 1 }} />
          <div style={{ width: 10, height: 10, background: "rgba(255,255,255,0.95)", borderRadius: 1 }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
