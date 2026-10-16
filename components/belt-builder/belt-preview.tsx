"use client";

/**
 * BeltPreview — ของกลาง: วาดเข็มขัดจากรูปถ่ายจริงซ้อนเป็นชั้นบนผืนผ้าใบ 1600×600 (ย่อส่วนตามความกว้างที่ให้)
 *
 * ใช้ที่: drawer ชิ้นส่วน (/admin/belt-builder) ตอนปรับจุดยึด · หน้าดูแบบของลูกค้า · (ก้อน 3) หน้าเว็บลูกค้าใช้กฎเดียวกัน
 * ชั้น: strap (ล่างสุด) → keeper → buckle → engraving (ตัวอักษรพิมพ์สด ไม่ใช่รูป)
 * ชิ้นที่ยังไม่มีรูป = วาดกล่องสีแทน (สีจาก attrs.color_hex / metal_hex) เพื่อให้จัดตำแหน่งได้ก่อนอัปโหลดรูปจริง
 */
import { useMemo } from "react";
import { BELT_CANVAS, LAYER_ORDER, DEFAULT_ENGRAVING_BOX, type Anchor, type PartType } from "@/lib/belt-builder";
import { r2ImageUrl } from "@/lib/r2-image";

export type PreviewLayer = {
  type:      PartType;
  anchor:    Anchor;
  imageKey?: string | null;
  imageUrl?: string | null;
  label?:    string;
  /** สีกล่องแทนรูป (ยังไม่มีรูป) */
  colorHex?: string | null;
  /** 0–1 (ชิ้นอ้างอิงที่ไม่ได้แก้ → จาง) */
  opacity?:  number;
  /** ชิ้นที่กำลังแก้ → ขอบเส้นประ */
  highlight?: boolean;
};

export type PreviewEngraving = { text: string; font?: string; box?: Anchor; color?: string } | null;

const FALLBACK_COLOR: Record<PartType, string> = { strap: "#6b4a2b", buckle: "#b8bcc4", keeper: "#5a3d22" };

export function BeltPreview({ layers, engraving, width = 800, className = "", showGrid = false, children }: {
  layers: PreviewLayer[];
  engraving?: PreviewEngraving;
  width?: number;
  className?: string;
  showGrid?: boolean;
  /** overlay เพิ่ม (เช่น handle ลากของ AnchorEditor) — ได้ scale ผ่าน context style */
  children?: React.ReactNode;
}) {
  const scale = width / BELT_CANVAS.w;
  const height = Math.round(BELT_CANVAS.h * scale);
  const ordered = useMemo(() => {
    const rank = (t: PartType) => LAYER_ORDER.indexOf(t);
    return [...layers].sort((a, b) => rank(a.type) - rank(b.type));
  }, [layers]);

  return (
    <div className={`relative overflow-hidden rounded-lg border border-slate-200 bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%),linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%)] bg-white ${className}`}
      style={{ width, height, backgroundSize: "20px 20px", backgroundPosition: "0 0, 10px 10px" }}>
      {showGrid && (
        <div className="absolute inset-0 pointer-events-none opacity-40"
          style={{ backgroundImage: "linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)", backgroundSize: `${100 * scale}px ${100 * scale}px` }} />
      )}
      {ordered.map((l, i) => {
        const src = l.imageUrl || r2ImageUrl(l.imageKey, Math.min(1600, Math.round(l.anchor.w * scale * 2)));
        const style: React.CSSProperties = {
          position: "absolute",
          left: l.anchor.x * scale, top: l.anchor.y * scale,
          width: l.anchor.w * scale, height: l.anchor.h * scale,
          opacity: l.opacity ?? 1,
          outline: l.highlight ? "2px dashed #6366f1" : undefined,
          outlineOffset: 2,
          boxSizing: "border-box",
        };
        if (src) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${l.type}-${i}`} src={src} alt={l.label ?? l.type} draggable={false} style={{ ...style, objectFit: "fill", userSelect: "none" }} />
          );
        }
        // กล่องแทนรูป (ยังไม่อัปโหลด)
        const color = l.colorHex || FALLBACK_COLOR[l.type];
        const radius = l.type === "strap" ? 8 * scale : l.type === "buckle" ? 24 * scale : 10 * scale;
        return (
          <div key={`${l.type}-${i}`} style={{ ...style, background: color, borderRadius: radius, border: l.type === "buckle" ? `${Math.max(2, 14 * scale)}px solid rgba(0,0,0,.25)` : undefined, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="text-white/80 font-medium truncate px-1" style={{ fontSize: Math.max(9, 26 * scale), textShadow: "0 1px 2px rgba(0,0,0,.5)" }}>{l.label ?? l.type}</span>
          </div>
        );
      })}
      {engraving && engraving.text && (() => {
        const box = engraving.box ?? DEFAULT_ENGRAVING_BOX;
        return (
          <div style={{ position: "absolute", left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ fontFamily: engraving.font || "Georgia, 'Times New Roman', serif", fontSize: Math.max(8, box.h * 0.55 * scale), letterSpacing: "0.08em", color: engraving.color || "rgba(255,230,180,.9)", textShadow: "0 1px 0 rgba(0,0,0,.6), 0 0 2px rgba(0,0,0,.4)", whiteSpace: "nowrap" }}>
              {engraving.text}
            </span>
          </div>
        );
      })()}
      {children}
    </div>
  );
}

/** แปลงแถว belt_parts → ชั้นพรีวิว (ของกลาง ให้หน้าอื่นใช้ร่วม) */
export function partToLayer(p: { part_type: string; anchor: unknown; image_key?: string | null; image_url?: string | null; name_th?: string | null; attrs?: unknown }, extra: Partial<PreviewLayer> = {}): PreviewLayer | null {
  const a = p.anchor as Anchor | null;
  if (!a || typeof a !== "object") return null;
  const attrs = (p.attrs && typeof p.attrs === "object" ? p.attrs : {}) as Record<string, unknown>;
  return {
    type: p.part_type as PartType,
    anchor: { x: Number(a.x) || 0, y: Number(a.y) || 0, w: Number(a.w) || 0, h: Number(a.h) || 0 },
    imageKey: p.image_key ?? null,
    imageUrl: p.image_url ?? null,
    label: p.name_th ?? undefined,
    colorHex: (attrs.color_hex as string) || (attrs.metal_hex as string) || null,
    ...extra,
  };
}
