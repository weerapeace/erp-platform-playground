"use client";

/**
 * AnchorEditor — ช่องปรับจุดยึด {x,y,w,h} ของชิ้นส่วน + พรีวิวซ้อนรูปสด (เห็นผลทันที ยังไม่ต้องบันทึก)
 *
 * - วางรูปชิ้นนี้ทับ "ชิ้นอ้างอิง" ของประเภทอื่นในร้านเดียวกัน (สายหนัง/หัว/หู ตัวแรกที่เปิดอยู่) แบบจาง ๆ ให้จัดให้ตรงกัน
 * - ลากชิ้นในพรีวิวเพื่อย้าย x/y ได้ · พิมพ์ตัวเลขตรง ๆ ได้ · ปุ่ม "ค่าเริ่มต้นของประเภทนี้"
 * - เปลี่ยนประเภทชิ้นส่วนในฟอร์ม → ถ้า anchor ยังเป็นค่าเริ่มต้นของประเภทเดิม จะสลับเป็นค่าเริ่มต้นของประเภทใหม่ให้
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { BELT_CANVAS, DEFAULT_ANCHOR, PART_TYPES, PART_TYPE_LABEL, parseAnchor, type Anchor, type PartType } from "@/lib/belt-builder";
import { BeltPreview, partToLayer, type PreviewLayer } from "./belt-preview";

type PartRow = { id: string; part_type: string; anchor: unknown; image_key: string | null; image_url: string | null; name_th: string | null; attrs: unknown; is_active: boolean };

// แคชชิ้นอ้างอิงต่อร้าน (เปิด drawer หลายครั้งไม่ต้องโหลดซ้ำ)
const refCache = new Map<string, PartRow[]>();
async function loadRefParts(shopId: string): Promise<PartRow[]> {
  const hit = refCache.get(shopId);
  if (hit) return hit;
  const j = await apiFetch(`/api/belt-builder/parts?shop_id=${encodeURIComponent(shopId)}&limit=500`).then((r) => r.json()).catch(() => ({ data: [] }));
  const rows = ((j.data ?? []) as PartRow[]).filter((p) => p.is_active);
  refCache.set(shopId, rows);
  return rows;
}
/** ให้หน้าอื่นล้างแคชหลังบันทึก (เช่น อัปโหลดรูปสายหนังใหม่) */
export function invalidateRefParts(shopId?: string) { if (shopId) refCache.delete(shopId); else refCache.clear(); }

const sameAnchor = (a: Anchor | null, b: Anchor) => !!a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

export function AnchorEditor({ value, onChange, disabled, partType, imageKey, imageUrl, colorHex, label, shopId, currentId, width = 720 }: {
  value: unknown;
  onChange: (a: Anchor) => void;
  disabled?: boolean;
  partType: PartType;
  imageKey?: string | null;
  imageUrl?: string | null;
  colorHex?: string | null;
  label?: string;
  shopId?: string | null;
  /** id ของชิ้นที่กำลังแก้ (กันเอาตัวเองมาเป็นชิ้นอ้างอิง) */
  currentId?: string | null;
  width?: number;
}) {
  const anchor = useMemo(() => parseAnchor(value) ?? DEFAULT_ANCHOR[partType], [value, partType]);
  const [refs, setRefs] = useState<PartRow[]>([]);
  const prevType = useRef<PartType>(partType);

  useEffect(() => { if (shopId) loadRefParts(shopId).then(setRefs); }, [shopId]);

  // เปลี่ยนประเภท → ถ้ายังเป็นค่าเริ่มต้นของประเภทเดิม สลับเป็นค่าเริ่มต้นของประเภทใหม่
  useEffect(() => {
    if (prevType.current !== partType) {
      const old = prevType.current;
      prevType.current = partType;
      const cur = parseAnchor(value);
      if (!cur || sameAnchor(cur, DEFAULT_ANCHOR[old])) onChange(DEFAULT_ANCHOR[partType]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partType]);

  const layers = useMemo<PreviewLayer[]>(() => {
    const out: PreviewLayer[] = [];
    for (const t of PART_TYPES) {
      if (t === partType) continue;
      const r = refs.find((p) => p.part_type === t && p.id !== currentId);
      if (!r) continue;
      const l = partToLayer(r, { opacity: 0.45 });
      if (l) out.push(l);
    }
    out.push({ type: partType, anchor, imageKey: imageKey ?? null, imageUrl: imageUrl ?? null, colorHex: colorHex ?? null, label: label || PART_TYPE_LABEL[partType].th, highlight: true });
    return out;
  }, [refs, partType, anchor, imageKey, imageUrl, colorHex, label, currentId]);

  const scale = width / BELT_CANVAS.w;
  const set = (k: keyof Anchor, v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    onChange({ ...anchor, [k]: Math.round(n) });
  };

  // ลากย้าย (pointer events) — ขยับ x/y ตามสเกล
  const drag = useRef<{ sx: number; sy: number; ax: number; ay: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ax: anchor.x, ay: anchor.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.sx) / scale, dy = (e.clientY - drag.current.sy) / scale;
    onChange({ ...anchor, x: Math.round(drag.current.ax + dx), y: Math.round(drag.current.ay + dy) });
  };
  const onPointerUp = () => { drag.current = null; };

  const missingRefs = PART_TYPES.filter((t) => t !== partType && !refs.some((p) => p.part_type === t && p.id !== currentId));
  const num = "w-20 border border-slate-300 rounded px-2 py-1 text-sm tabular-nums disabled:bg-slate-50";

  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">
        พรีวิวผืนผ้าใบ {BELT_CANVAS.w}×{BELT_CANVAS.h} px (ย่อ {Math.round(scale * 100)}%) · ชิ้นที่แก้ = ขอบเส้นประ ลากย้ายได้ · ชิ้นอื่นในร้านโชว์จาง ๆ ไว้จัดให้ตรงกัน
      </div>
      <BeltPreview layers={layers} width={width} showGrid>
        {!disabled && (
          <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            title="ลากเพื่อย้ายตำแหน่ง"
            style={{ position: "absolute", left: anchor.x * scale, top: anchor.y * scale, width: Math.max(8, anchor.w * scale), height: Math.max(8, anchor.h * scale), cursor: "move", touchAction: "none" }} />
        )}
      </BeltPreview>
      <div className="flex flex-wrap items-end gap-3">
        {(["x", "y", "w", "h"] as const).map((k) => (
          <label key={k} className="text-xs text-slate-600">
            <div className="mb-0.5">{k === "x" ? "ซ้าย (x)" : k === "y" ? "บน (y)" : k === "w" ? "กว้าง (w)" : "สูง (h)"}</div>
            <input type="number" className={num} value={anchor[k]} disabled={disabled} onChange={(e) => set(k, e.target.value)} step={1} />
          </label>
        ))}
        {!disabled && (
          <button type="button" onClick={() => onChange(DEFAULT_ANCHOR[partType])}
            className="text-xs px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700">
            ↺ ค่าเริ่มต้นของ{PART_TYPE_LABEL[partType].th}
          </button>
        )}
      </div>
      {missingRefs.length > 0 && refs.length > 0 && (
        <div className="text-[11px] text-amber-700">ยังไม่มีชิ้นอ้างอิงประเภท {missingRefs.map((t) => PART_TYPE_LABEL[t].th).join(" / ")} ในร้านนี้ — เพิ่มแล้วจะโชว์ซ้อนให้</div>
      )}
      {!imageKey && !imageUrl && (
        <div className="text-[11px] text-slate-500">ยังไม่มีรูป — ใช้กล่องสีแทนไปก่อน อัปโหลด PNG พื้นโปร่งที่ช่อง "รูป" ด้านบนแล้วพรีวิวจะเปลี่ยนเป็นรูปจริงทันที</div>
      )}
    </div>
  );
}
