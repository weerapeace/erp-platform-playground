"use client";

/**
 * ภาพย่อของผืนผ้าใบอิสระ (ของกลาง — การ์ดแม่แบบ / ที่อื่นที่อยากเห็นหน้าตาผืนแบบเร็ว ๆ)
 *
 * วาดคร่าว ๆ ในหน้า ERP เอง (ไม่ต้องเปิด iframe เว็บร้าน): รูปจริง · ข้อความ/ปุ่มตามสีธีม · ของตกแต่งลายเดียวกับเว็บร้าน
 * ⚠️ เป็น "ภาพประกอบ" — ฟอนต์/ระยะอาจต่างจากเว็บจริงเล็กน้อย ของจริงดูในพรีวิว
 */
import type { CSSProperties } from "react";
import { CanvasShape } from "@/components/website-canvas-shapes";
import { swatchesOf, softOf, type ThemeColors } from "@/components/website-canvas-inspector";
import { CANVAS_WIDTH } from "@/lib/website-canvas";

const num = (v: unknown, fb: number) => (Number.isFinite(Number(v)) ? Number(v) : fb);

function colorOf(theme: ThemeColors, v: unknown, hex: unknown): string {
  if (v === "custom" && typeof hex === "string" && hex) return hex;
  return swatchesOf(theme).find((s) => s.v === v)?.hex ?? theme.ink;
}

export function CanvasMiniPreview({
  data,
  theme,
  width = 260,
  fontNames = { display: "Kanit", body: "Noto Sans Thai" },
}: {
  data: Record<string, unknown>;
  theme: ThemeColors;
  width?: number;
  fontNames?: { display: string; body: string };
}) {
  const k = width / CANVAS_WIDTH;
  const height = Math.max(40, num(data.height, 560) * k);
  const items = (Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : []).filter((it) => it.enabled !== false);
  const style = (data.style ?? {}) as Record<string, unknown>;
  const bgColor = style.bg === "custom" && typeof style.bgColor === "string" ? style.bgColor : style.bg === "brand" ? theme.brand : style.bg === "ink" ? theme.ink : style.bg === "surface" ? theme.surface : theme.page;
  const bgKey = typeof data.bgImageKey === "string" && data.bgImageKey ? data.bgImageKey : null;

  return (
    <div
      className="relative overflow-hidden rounded-md border border-slate-200"
      style={{
        width,
        height,
        background: bgKey ? `center / cover no-repeat url("/api/r2-image?key=${encodeURIComponent(bgKey)}&w=400")` : bgColor,
      }}
      aria-hidden
    >
      {items.map((it, i) => {
        const kind = String(it.kind ?? "text");
        const bleed = it.bleed === true;
        const box: CSSProperties = {
          position: "absolute",
          left: bleed ? 0 : num(it.x, 0) * k,
          top: num(it.y, 0) * k,
          width: bleed ? "100%" : num(it.w, 100) * k,
          height: kind === "text" ? "auto" : num(it.h, 40) * k,
          transform: num(it.rotate, 0) ? `rotate(${num(it.rotate, 0)}deg)` : undefined,
          opacity: num(it.opacity, 100) / 100,
          zIndex: i + 1,
        };
        if (kind === "image") {
          const frame = String(it.frame ?? "rect");
          const radius = frame === "ellipse" ? "50%" : frame === "arch" ? "9999px 9999px 0 0" : frame === "rounded" ? Math.min(num(it.w, 100), num(it.h, 100)) * 0.08 * k : 0;
          const key = typeof it.imageKey === "string" && it.imageKey ? it.imageKey : null;
          return (
            <div key={String(it.id ?? i)} style={{ ...box, borderRadius: radius, overflow: "hidden", background: key ? undefined : softOf(theme.brand) }}>
              {key && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/r2-image?key=${encodeURIComponent(key)}&w=300`}
                  alt=""
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: it.fit === "contain" ? "contain" : "cover", objectPosition: `${num(it.cropX, 50)}% ${num(it.cropY, 50)}%` }}
                />
              )}
            </div>
          );
        }
        if (kind === "shape") {
          const color = colorOf(theme, it.color, it.colorHex);
          return (
            <div key={String(it.id ?? i)} style={{ ...box, transform: `${box.transform ?? ""} scale(${it.flipH ? -1 : 1}, ${it.flipV ? -1 : 1})`.trim() }}>
              <CanvasShape it={{ shape: String(it.shape ?? "bow"), w: num(it.w, 100), h: num(it.h, 40), outline: it.outline === true, strokeWidth: num(it.strokeWidth, 2) }} color={color} />
            </div>
          );
        }
        const font = String(it.font ?? "display");
        const family = font === "display" ? fontNames.display : font === "body" ? fontNames.body : font;
        const fs = Math.max(3, num(it.size, 16) * k);
        if (kind === "button") {
          const variant = String(it.variant ?? "brand");
          const c = colorOf(theme, it.color, it.colorHex);
          return (
            <div
              key={String(it.id ?? i)}
              style={{
                ...box,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                fontSize: fs,
                fontFamily: `"${family}", sans-serif`,
                whiteSpace: "nowrap",
                overflow: "hidden",
                ...(variant === "brand"
                  ? { background: theme.brand, color: "#fff" }
                  : variant === "soft"
                    ? { background: softOf(theme.brand), color: theme.brandDeep }
                    : variant === "outline"
                      ? { border: `1px solid ${c}`, color: c }
                      : { color: c, textDecoration: "underline" }),
              }}
            >
              {String(it.label ?? "")}
            </div>
          );
        }
        return (
          <div
            key={String(it.id ?? i)}
            style={{
              ...box,
              fontSize: fs,
              lineHeight: num(it.lineHeight, 130) / 100,
              fontFamily: `"${family}", sans-serif`,
              fontWeight: num(it.weight, 500),
              fontStyle: it.italic ? "italic" : undefined,
              textTransform: it.uppercase ? "uppercase" : undefined,
              letterSpacing: num(it.spacing, 0) ? `${num(it.spacing, 0) / Math.max(1, num(it.size, 16))}em` : undefined,
              textAlign: (String(it.align ?? "left") as CSSProperties["textAlign"]) ?? "left",
              color: colorOf(theme, it.color, it.colorHex),
              whiteSpace: "pre-line",
              overflow: "hidden",
            }}
          >
            {String(it.text ?? "")}
          </div>
        );
      })}
    </div>
  );
}
