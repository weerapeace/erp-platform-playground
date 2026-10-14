"use client";

/**
 * ของกลาง — ส่วนของ "ผืนผ้าใบอิสระ" ในตัวจัดหน้า (components/website-builder.tsx เรียกใช้)
 *
 *   useCanvasBridge  = คุยกับพรีวิวแบบสด (ไม่ต้องโหลดหน้าใหม่)
 *     ERP → เว็บ : storefront-canvas-update {block}          ทุกครั้งที่ข้อมูลผืนเปลี่ยน (แก้ในแผง/undo/ลากเสร็จ)
 *     เว็บ → ERP : storefront-canvas-change {blockId, items?, height?}   ลาก/ย่อ/หมุน/พิมพ์แก้ข้อความในพรีวิวเสร็จ
 *                  storefront-canvas-delete {blockId, childId} · storefront-canvas-duplicate {blockId, childId}
 *                  storefront-canvas-key {action:"undo"|"redo"}  (กดคีย์ลัดตอนเมาส์อยู่ในพรีวิว)
 *   previewStructureSig = ลายเซ็นโครงหน้า "ไม่รวมเนื้อในผืน" → บันทึกร่างแล้วไม่ต้องโหลดพรีวิวใหม่ถ้าแก้แค่ในผืน
 *   CanvasAddBar / CanvasItemTools = ปุ่มเพิ่มชิ้น + จัดชั้นหน้า-หลัง ในแผงขวา
 *
 * ตัววาดผืน + การลากอยู่ที่เว็บร้าน src/components/home/CanvasSection.tsx
 */
import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { CANVAS_WIDTH, type CanvasKind } from "@/lib/website-canvas";
import type { Block, ChildBlock } from "@/components/website-block-editor";

/** ช่องที่พรีวิวส่งกลับมาแก้ได้ (นอกนั้นแก้จากแผงเท่านั้น) */
const LIVE_KEYS = ["x", "y", "w", "h", "rotate", "text"] as const;

const clampInt = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : null;
};

/** แปลงค่าที่พรีวิวส่งมา → patch ที่ปลอดภัย (ตัวเลขปัด/จำกัดช่วงเหมือน schema) */
function livePatch(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of LIVE_KEYS) {
    if (!(k in raw)) continue;
    if (k === "text") {
      if (typeof raw.text === "string") out.text = raw.text.slice(0, 2000);
      continue;
    }
    const lim = { x: [-1200, 2400], y: [-600, 4800], w: [4, 2400], h: [4, 4800], rotate: [-180, 180] }[k];
    const n = clampInt(raw[k], lim[0], lim[1]);
    if (n !== null) out[k] = n;
  }
  return out;
}

/** โครงหน้าแบบไม่รวม "เนื้อในผืน" (ชิ้นส่วน/ความสูง/รูปพื้น ซึ่งพรีวิวรับสดอยู่แล้ว) */
export function previewStructureSig(blocks: Block[]): string {
  return JSON.stringify(
    blocks.map((b) => (b.type === "canvas" ? { id: b.id, type: b.type, enabled: b.enabled, visibility: b.visibility, style: b.style } : b))
  );
}

export function useCanvasBridge(opts: {
  blocks: Block[];
  blocksRef: MutableRefObject<Block[]>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  patchBlock: (id: string, p: Record<string, unknown>) => void;
  removeChild: (blockId: string, childId: string) => void;
  duplicateChild: (blockId: string, childId: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
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
      const d = e.data as { type?: string; blockId?: string; childId?: string; items?: Record<string, unknown>[]; height?: unknown; action?: string } | null;
      if (!d?.type?.startsWith("storefront-")) return;
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

      if (d.type === "storefront-canvas-change") {
        const p: Record<string, unknown> = {};
        if (Array.isArray(d.items) && d.items.length) {
          const byId = new Map(d.items.filter((x) => typeof x?.id === "string").map((x) => [x.id as string, livePatch(x)]));
          p.items = list.map((it) => (byId.has(it.id) ? { ...it, ...byId.get(it.id) } : it));
        }
        const h = clampInt(d.height, 120, 2400);
        if (h !== null) p.height = h;
        if (Object.keys(p).length) fns.current.patchBlock(b.id, p);
        return;
      }
      if (d.type === "storefront-canvas-delete" && d.childId) fns.current.removeChild(b.id, d.childId);
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

const chip = "flex-1 min-w-[64px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 hover:border-blue-400 hover:text-blue-700";

export function CanvasAddBar({ onAdd, count, max }: { onAdd: (kind: CanvasKind) => void; count: number; max: number }) {
  const full = count >= max;
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-2">
      <p className="text-xs font-medium text-slate-700">เพิ่มบนผืน {full && <span className="text-red-600">(ครบ {max} ชิ้นแล้ว)</span>}</p>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["image", "🖼️ รูป"],
            ["text", "🔤 ข้อความ"],
            ["button", "🔘 ปุ่ม"],
            ["shape", "🎀 ของตกแต่ง"],
          ] as [CanvasKind, string][]
        ).map(([k, l]) => (
          <button key={k} disabled={full} onClick={() => onAdd(k)} className={`${chip} disabled:opacity-40`}>
            {l}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        ลากชิ้นในพรีวิวเพื่อย้าย · จับมุมเพื่อย่อ-ขยาย · จับจุดกลมด้านบนเพื่อหมุน · ดับเบิลคลิกข้อความเพื่อพิมพ์แก้ · ลากแถบใต้ผืนเพื่อปรับความสูง
        <br />
        มือถือ: เรียงชิ้นลงมาให้อัตโนมัติตามตำแหน่ง บน→ล่าง (ของตกแต่งซ่อนบนมือถือได้)
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
