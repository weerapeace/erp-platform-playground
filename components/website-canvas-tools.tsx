"use client";

/**
 * ของกลาง — ส่วนของ "ผืนผ้าใบอิสระ" ในตัวจัดหน้า (components/website-builder.tsx เรียกใช้)
 *
 *   useCanvasBridge  = คุยกับพรีวิวแบบสด (ไม่ต้องโหลดหน้าใหม่)
 *     ERP → เว็บ : storefront-canvas-update {block}          ทุกครั้งที่ข้อมูลผืนเปลี่ยน (แก้ในแผง/undo/ลากเสร็จ)
 *     เว็บ → ERP : storefront-canvas-change {blockId, items?, height?, mobileHeight?, mobileMode?}   ลาก/ย่อ/หมุน/พิมพ์/จับกลุ่ม/แปลงมือถือ เสร็จ
 *                  storefront-canvas-delete {blockId, childId | childIds} · storefront-canvas-duplicate {blockId, childId | childIds}
 *                  storefront-canvas-key {action:"undo"|"redo"}  (กดคีย์ลัดตอนเมาส์อยู่ในพรีวิว)
 *                  storefront-canvas-action {blockId, childId | childIds, action}  (ปุ่มบนแถบเครื่องมือลอย: เปลี่ยนรูป/ลิงก์/ชั้น)
 *                  storefront-canvas-multi {blockId, ids}  (เลือกหลายชิ้น — ตัวท้าย = ชิ้นหลัก)
 *                  storefront-canvas-open {blockId}  (ดับเบิลคลิกผืน = เปิดแก้แบบเต็มจอ)
 *     ERP → เว็บ (คำสั่งที่ต้องใช้ขนาดจริงบนจอ): storefront-canvas-align {childIds, to} · storefront-canvas-crop · storefront-canvas-mobile-freeze
 *   previewStructureSig = ลายเซ็นโครงหน้า "ไม่รวมเนื้อในผืน" → บันทึกร่างแล้วไม่ต้องโหลดพรีวิวใหม่ถ้าแก้แค่ในผืน
 *   CanvasAddBar / CanvasItemTools = ปุ่มเพิ่มชิ้น + จัดชั้นหน้า-หลัง ในแผงขวา
 *
 * ตัววาดผืน + การลากอยู่ที่เว็บร้าน src/components/home/CanvasSection.tsx
 */
import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { CANVAS_MAX_HEIGHT, CANVAS_MOBILE_WIDTH, CANVAS_WIDTH } from "@/lib/website-canvas";
import { SECTION_SCHEMAS } from "@/lib/website-schema";
import { sanitizeField } from "@/lib/website-blocks";
import type { Block, ChildBlock } from "@/components/website-block-editor";

const clampInt = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : null;
};

/** ช่องของ "ชิ้น" บนผืน (จาก schema ที่เดียว) — ใช้กรองค่าที่พรีวิวส่งมา */
const ITEM_FIELDS = new Map((SECTION_SCHEMAS.canvas?.children?.fields ?? []).map((fd) => [fd.key, fd]));

/**
 * ค่าที่พรีวิวส่งมา (ลาก/ย่อ/หมุน/พิมพ์แก้/แถบเครื่องมือลอย) → patch ที่ปลอดภัย
 * ทุกช่องผ่านตัวทำความสะอาดของ schema เดียวกับตอนบันทึก (ตัวเลขจำกัดช่วง · ตัวเลือกต้องอยู่ในรายการ · ลิงก์กรอง)
 * ห้ามเปลี่ยน id / ชนิดชิ้นจากพรีวิว
 */
export function livePatch(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "id" || k === "kind") continue;
    const fd = ITEM_FIELDS.get(k);
    if (fd) out[k] = sanitizeField(fd, v);
  }
  return out;
}

/** โครงหน้าแบบไม่รวม "เนื้อในผืน" (ชิ้นส่วน/ความสูง/รูปพื้น ซึ่งพรีวิวรับสดอยู่แล้ว) — ย้ายไป lib/website-live-preview.ts */
export { previewStructureSig } from "@/lib/website-live-preview";

export function useCanvasBridge(opts: {
  blocks: Block[];
  blocksRef: MutableRefObject<Block[]>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  patchBlock: (id: string, p: Record<string, unknown>) => void;
  removeChild: (blockId: string, childId: string) => void;
  duplicateChild: (blockId: string, childId: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** พรีวิวขอให้ ERP เปิดหน้าจอ (เลือกรูป/ตั้งลิงก์) ให้ชิ้นนี้ */
  onAction?: (blockId: string, childId: string, action: string) => void;
  /** ดับเบิลคลิกผืนในพรีวิว = ขอเปิดแก้แบบเต็มจอ */
  onOpen?: (blockId: string) => void;
  /** พรีวิวเลือกหลายชิ้น (ตัวท้าย = ชิ้นหลัก) · หลังทำสำเนาหลายชิ้นก็เรียกตัวนี้ให้เลือกชุดสำเนา */
  onMulti?: (blockId: string, ids: string[]) => void;
}) {
  const { blocks, blocksRef, iframeRef } = opts;
  const sent = useRef(new Map<string, string>());
  const fns = useRef(opts);
  fns.current = opts;

  const post = (msg: Record<string, unknown>) => iframeRef.current?.contentWindow?.postMessage(msg, "*");

  // ส่งผืนที่เปลี่ยนเข้าพรีวิว (เทียบกับที่ส่งล่าสุด — ไม่ส่งซ้ำ)
  useEffect(() => {
    for (const b of blocks) {
      if (b.type !== "canvas") continue;
      const json = JSON.stringify(b);
      if (sent.current.get(b.id) === json) continue;
      sent.current.set(b.id, json);
      post({ type: "storefront-canvas-update", block: b });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as {
        type?: string;
        blockId?: string;
        childId?: string;
        childIds?: unknown;
        ids?: unknown;
        items?: Record<string, unknown>[];
        height?: unknown;
        mobileHeight?: unknown;
        mobileMode?: unknown;
        action?: string;
      } | null;
      if (!d?.type?.startsWith("storefront-")) return;
      // ฟังเฉพาะพรีวิวของตัวเอง (ตัวจัดหน้า + ป๊อปอัปเต็มจอ มีคนละ iframe ห้ามทำซ้ำสองรอบ)
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (d.type === "storefront-preview-loaded") {
        // พรีวิวโหลดใหม่ = ได้ข้อมูลที่บันทึกไว้ → ส่งของล่าสุดที่ยังไม่บันทึกตามไปทันที
        sent.current.clear();
        for (const b of blocksRef.current) {
          if (b.type !== "canvas") continue;
          sent.current.set(b.id, JSON.stringify(b));
          post({ type: "storefront-canvas-update", block: b });
        }
        return;
      }
      if (!d.blockId) return;
      const b = blocksRef.current.find((x) => x.id === d.blockId && x.type === "canvas");
      if (!b) return;
      const list = (Array.isArray(b.items) ? b.items : []) as ChildBlock[];

      const ids = Array.isArray(d.childIds) ? (d.childIds as unknown[]).filter((x): x is string => typeof x === "string" && list.some((it) => it.id === x)) : [];

      if (d.type === "storefront-canvas-change") {
        const p: Record<string, unknown> = {};
        if (Array.isArray(d.items) && d.items.length) {
          const byId = new Map(d.items.filter((x) => typeof x?.id === "string").map((x) => [x.id as string, livePatch(x)]));
          p.items = list.map((it) => (byId.has(it.id) ? { ...it, ...byId.get(it.id) } : it));
        }
        const h = clampInt(d.height, 120, CANVAS_MAX_HEIGHT);
        if (h !== null) p.height = h;
        const mh = clampInt(d.mobileHeight, 120, 8000);
        if (mh !== null) p.mobileHeight = mh;
        if (d.mobileMode === "auto" || d.mobileMode === "custom") p.mobileMode = d.mobileMode;
        if (Object.keys(p).length) fns.current.patchBlock(b.id, p);
        return;
      }
      if (d.type === "storefront-canvas-multi") {
        const sel = Array.isArray(d.ids) ? (d.ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
        fns.current.onMulti?.(b.id, sel);
        return;
      }
      // ชั้นหน้า-หลัง (ปุ่ม "จัดวาง" บนแถบลอย) — เรียงลำดับใหม่ในข้อมูลได้เลย ไม่ต้องเปิดหน้าจออะไร
      const layer = { "layer-up": "up", "layer-down": "down", "layer-front": "front", "layer-back": "back" } as const;
      if (d.type === "storefront-canvas-action" && d.action && d.action in layer) {
        const to = layer[d.action as keyof typeof layer];
        const one = d.childId ?? (ids.length === 1 ? ids[0] : null);
        if (ids.length > 1) fns.current.patchBlock(b.id, { items: reorderLayerMany(list, ids, to === "up" ? "front" : to === "down" ? "back" : to) });
        else if (one) fns.current.patchBlock(b.id, { items: reorderLayer(list, one, to) });
        return;
      }
      // หลายชิ้น: ลบ / ทำสำเนา ทีเดียว (ย้อนกลับได้ในขั้นเดียว)
      if (d.type === "storefront-canvas-delete" && ids.length > 1) {
        fns.current.patchBlock(b.id, { items: list.filter((it) => !ids.includes(it.id)) });
        fns.current.onMulti?.(b.id, []);
        return;
      }
      if (d.type === "storefront-canvas-duplicate" && ids.length > 1) {
        const r = duplicateItems(list, ids, b.mobileMode === "custom", Number((SECTION_SCHEMAS.canvas?.children?.max ?? 60)));
        if (!r.copies.length) return;
        fns.current.patchBlock(b.id, { items: r.list });
        fns.current.onMulti?.(b.id, r.copies);
        post({ type: "storefront-select-block", blockId: b.id, childId: r.copies[r.copies.length - 1], childIds: r.copies });
        return;
      }
      if (ids.length === 1 && !d.childId) d.childId = ids[0];
      if (d.type === "storefront-canvas-open") fns.current.onOpen?.(b.id);
      else if (d.type === "storefront-canvas-action" && d.childId && d.action) fns.current.onAction?.(b.id, d.childId, d.action);
      else if (d.type === "storefront-canvas-delete" && d.childId) fns.current.removeChild(b.id, d.childId);
      else if (d.type === "storefront-canvas-duplicate" && d.childId) fns.current.duplicateChild(b.id, d.childId);
      else if (d.type === "storefront-canvas-key") {
        if (d.action === "undo") fns.current.onUndo?.();
        else if (d.action === "redo") fns.current.onRedo?.();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** จัดชั้นหน้า-หลัง: ลำดับใน array = ลำดับวาด (ตัวแรกอยู่หลังสุด) */
export function reorderLayer<T extends { id: string }>(list: T[], id: string, to: "front" | "back" | "up" | "down"): T[] {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return list;
  const next = [...list];
  const [it] = next.splice(i, 1);
  const j = to === "front" ? next.length : to === "back" ? 0 : to === "up" ? Math.min(next.length, i + 1) : Math.max(0, i - 1);
  next.splice(j, 0, it);
  return next;
}

/** หลายชิ้นไปหน้าสุด/หลังสุดพร้อมกัน (คงลำดับกันเองไว้) */
export function reorderLayerMany<T extends { id: string }>(list: T[], ids: string[], to: "front" | "back"): T[] {
  const moving = list.filter((x) => ids.includes(x.id));
  const rest = list.filter((x) => !ids.includes(x.id));
  return to === "front" ? [...rest, ...moving] : [...moving, ...rest];
}

/** รหัสกลุ่มใหม่ (ชิ้นที่ group ตรงกัน = เลือก/ย้ายไปด้วยกัน) */
export const newGroupId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * ทำสำเนาหลายชิ้น: สำเนาวางเยื้องนิดหน่อย (คอม +24 · มือถือแบบจัดเอง +12) · อยู่ชั้นหน้าสุด · กลุ่มได้รหัสใหม่
 * คืนรายการใหม่ + id ของสำเนา (ไว้เลือกต่อ)
 */
export function duplicateItems(list: ChildBlock[], ids: string[], mobileCustom: boolean, max: number): { list: ChildBlock[]; copies: string[] } {
  const src = list.filter((it) => ids.includes(it.id)).slice(0, Math.max(0, max - list.length));
  const stamp = Date.now().toString(36);
  const groups = new Map<string, string>();
  const copies = src.map((it, i) => {
    const c: ChildBlock = { ...(JSON.parse(JSON.stringify(it)) as ChildBlock), id: `items-${stamp}${i.toString(36)}${Math.random().toString(36).slice(2, 5)}`, locked: false };
    c.x = (Number(c.x) || 0) + 24;
    c.y = (Number(c.y) || 0) + 24;
    if (mobileCustom && Number(c.mw) > 0) {
      c.mx = (Number(c.mx) || 0) + 12;
      c.my = (Number(c.my) || 0) + 12;
    }
    const g = String(c.group ?? "");
    if (g) {
      if (!groups.has(g)) groups.set(g, newGroupId() + groups.size);
      c.group = groups.get(g);
    }
    return c;
  });
  return { list: [...list, ...copies], copies: copies.map((c) => c.id) };
}

const chip = "flex-1 min-w-[64px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 hover:border-blue-400 hover:text-blue-700";

/** แผงขวาของตัวจัดหน้าเมื่อเลือกผืน: ปุ่มเปิดแก้เต็มจอ (แนะนำ) + ทางลัดเพิ่มชิ้น (เปิดป๊อปอัปไปที่เครื่องมือนั้นเลย) */
export function CanvasAddBar({ onOpen, count, max, mobileCustom }: { onOpen: (action?: string) => void; count: number; max: number; mobileCustom?: boolean }) {
  const full = count >= max;
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-2.5">
      <button onClick={() => onOpen()} className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
        ✏️ แก้แบบเต็มจอ
      </button>
      <button onClick={() => onOpen("templates")} className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-medium text-blue-700 hover:border-blue-400">
        📐 แม่แบบ — เริ่มจากแบบสำเร็จ / บันทึกผืนนี้ไว้ใช้ซ้ำ
      </button>
      <p className="text-xs font-medium text-slate-700">เพิ่มบนผืน {full && <span className="text-red-600">(ครบ {max} ชิ้นแล้ว)</span>}</p>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["add-image", "🖼️ รูป"],
            ["add-text", "🔤 ข้อความ"],
            ["add-button", "🔘 ปุ่ม"],
            ["add-shape", "🎀 ของตกแต่ง"],
          ] as [string, string][]
        ).map(([a, l]) => (
          <button key={a} disabled={full} onClick={() => onOpen(a)} className={`${chip} disabled:opacity-40`}>
            {l}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        ดับเบิลคลิกที่ว่างบนผืนในพรีวิวก็เปิดแก้เต็มจอได้ · คลิกชิ้นในพรีวิวจะมีแถบเครื่องมือลอย (เปลี่ยนรูป/กรอบ/สี/ลิงก์) · Shift+คลิก หรือลากกรอบ = เลือกหลายชิ้น
        <br />
        {mobileCustom ? `มือถือ: จัดเอง (ผืนมือถือกว้าง ${CANVAS_MOBILE_WIDTH}) — สลับเป็นมือถือในหน้าแก้เต็มจอเพื่อจัด` : "มือถือ: เรียงชิ้นลงมาให้อัตโนมัติตามตำแหน่ง บน→ล่าง (จัดเองได้ในหน้าแก้เต็มจอ → 📲 มือถือ)"}
      </p>
    </div>
  );
}

export function CanvasItemTools({
  index,
  count,
  item,
  onLayer,
  onPatch,
}: {
  index: number;
  count: number;
  item: ChildBlock;
  onLayer: (to: "front" | "back" | "up" | "down") => void;
  onPatch: (p: Record<string, unknown>) => void;
}) {
  const w = Number(item.w) || 0;
  const btn = "rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:border-slate-400 disabled:opacity-40";
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-slate-500 mr-1">ชั้น {index + 1}/{count}</span>
        <button className={btn} disabled={index === count - 1} onClick={() => onLayer("front")} title="ไว้หน้าสุด">⤒ หน้าสุด</button>
        <button className={btn} disabled={index === count - 1} onClick={() => onLayer("up")} title="ขึ้นมาหนึ่งชั้น">↑</button>
        <button className={btn} disabled={index === 0} onClick={() => onLayer("down")} title="ลงไปหนึ่งชั้น">↓</button>
        <button className={btn} disabled={index === 0} onClick={() => onLayer("back")} title="ไว้หลังสุด">⤓ หลังสุด</button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button className={btn} onClick={() => onPatch({ x: Math.round((CANVAS_WIDTH - w) / 2) })} title="วางกึ่งกลางผืนตามแนวนอน">↔ กึ่งกลางผืน</button>
        <button className={btn} onClick={() => onPatch({ rotate: 0 })} disabled={!Number(item.rotate)}>⟲ เลิกหมุน</button>
        <button className={btn} onClick={() => onPatch({ locked: !item.locked })}>{item.locked ? "🔓 ปลดล็อก" : "🔒 ล็อก"}</button>
        <button className={btn} onClick={() => onPatch({ hideMobile: !item.hideMobile })}>{item.hideMobile ? "📲 โชว์บนมือถือ" : "📵 ซ่อนบนมือถือ"}</button>
      </div>
    </div>
  );
}
