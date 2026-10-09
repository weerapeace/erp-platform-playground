"use client";

/**
 * WebsiteBuilder — ตัวจัดหน้าเว็บแบบ 3 แผง (ของกลาง ใช้ทั้งแท็บ "หน้าแรก" และ "หน้าเว็บ")
 *
 *   ซ้าย   = โครงหน้า: Section → Block ย่อย (ลากเรียง · เพิ่ม · ทำสำเนา · ซ่อน · ลบ · คลังเพิ่ม Section)
 *   กลาง   = พรีวิวเว็บจริงใน iframe (คลิก Section/Block ในพรีวิวเพื่อเลือก · สลับ คอม/แท็บเล็ต/มือถือ)
 *   ขวา    = คุณสมบัติของสิ่งที่เลือก: ฟอร์มจาก Schema + แสดงบนอุปกรณ์ + รูปลักษณ์ (ทุกจอ/มือถือ)
 *
 * ไฟล์นี้ "ไม่รู้" ว่าชนิดบล็อกมีอะไรบ้าง — ทุกอย่างอ่านจาก lib/website-schema.ts
 * ข้อมูล/บันทึก/เผยแพร่ เป็นหน้าที่ของตัวที่เรียกใช้ (layout panel / pages panel) — ส่ง blocks + onChange มา
 *
 * คุยกับพรีวิว (เว็บร้านต้องมี PreviewBridge):
 *   เว็บ → ERP : { type: "storefront-block-click", blockId, childId? }
 *   ERP → เว็บ : { type: "storefront-select-block", blockId, childId? }
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { SECTION_SCHEMAS, SECTION_GROUP_ORDER, blankChild, newChildId, type ChildSpec } from "@/lib/website-schema";
import { blockSummary } from "@/lib/website-blocks";
import { SchemaForm, type SchemaFormContext } from "@/components/website-schema-form";
import { StylePanel, makeBlock, visibilityLabel, ALL_VISIBLE, type Block, type ChildBlock, type BlockTypeInfo, type Visibility } from "@/components/website-block-editor";
import { DEFAULT_BLOCK_STYLE, type BlockStyle, type BlockType } from "@/lib/website-blocks";

export interface Selection {
  blockId: string;
  childId?: string | null;
}

export type Device = "desktop" | "tablet" | "mobile";
type Zoom = "fit" | 0.5 | 0.75 | 1;

export const DEVICES: { k: Device; w: number; h: number; icon: string; label: string }[] = [
  { k: "desktop", w: 1440, h: 900, icon: "🖥️", label: "คอมพิวเตอร์" },
  { k: "tablet", w: 768, h: 1024, icon: "📱", label: "แท็บเล็ต" },
  { k: "mobile", w: 390, h: 844, icon: "📲", label: "มือถือ" },
];

const uidCopy = (type: string) => `${type}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
const deepCopy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const childrenOf = (b: Block): { spec: ChildSpec; list: ChildBlock[] } | null => {
  const spec = SECTION_SCHEMAS[b.type]?.children;
  if (!spec) return null;
  const list = Array.isArray(b[spec.key]) ? (b[spec.key] as ChildBlock[]) : [];
  return { spec, list };
};

type Drag = { kind: "move"; id: string } | { kind: "new"; type: BlockType } | { kind: "child"; blockId: string; childId: string };

export function WebsiteBuilder({
  blocks,
  onChange,
  types,
  ctx,
  previewSrc,
  iframeRef: iframeRefProp,
  selection,
  onSelect,
  previewHeight = "72vh",
}: {
  blocks: Block[];
  onChange: (next: Block[]) => void;
  types: BlockTypeInfo[];
  ctx: SchemaFormContext;
  /** URL พรีวิว (เว็บจริง + ?preview=1) — null = ยังไม่ผูกโดเมน */
  previewSrc: string | null;
  iframeRef?: RefObject<HTMLIFrameElement | null>;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  previewHeight?: string;
}) {
  const localIframe = useRef<HTMLIFrameElement>(null);
  const iframeRef = iframeRefProp ?? localIframe;

  /* ── สถานะหน้าจอ ── */
  const [device, setDevice] = useState<Device>("desktop");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [fullscreen, setFullscreen] = useState(false);
  const [showLib, setShowLib] = useState(false);
  const [libQuery, setLibQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [childOver, setChildOver] = useState<{ blockId: string; idx: number } | null>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(600);

  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, [fullscreen]);

  /* ── พรีวิว ↔ ตัวจัดหน้า ── */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; blockId?: string; childId?: string } | null;
      if (d?.type !== "storefront-block-click" || !d.blockId) return;
      onSelect({ blockId: d.blockId, childId: d.childId ?? null });
      if (d.childId) setExpanded((s) => new Set(s).add(d.blockId!));
      document.getElementById(`blk-${d.childId ?? d.blockId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onSelect]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "storefront-select-block", blockId: selection?.blockId ?? null, childId: selection?.childId ?? null },
      "*"
    );
  }, [selection, iframeRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreen) setFullscreen(false);
        setMenuId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  /* ── แก้ไขโครง ── */
  const patchBlock = useCallback((id: string, p: Record<string, unknown>) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...p } : b))), [blocks, onChange]);

  const patchChild = (blockId: string, childId: string, p: Record<string, unknown>) => {
    const b = blocks.find((x) => x.id === blockId);
    const c = b && childrenOf(b);
    if (!b || !c) return;
    patchBlock(blockId, { [c.spec.key]: c.list.map((it) => (it.id === childId ? { ...it, ...p } : it)) });
  };

  const addSection = (type: BlockType, at?: number) => {
    const fresh = makeBlock(type, blocks.length + 1);
    const next = [...blocks];
    next.splice(at ?? blocks.length, 0, fresh);
    onChange(next);
    onSelect({ blockId: fresh.id });
    setExpanded((s) => new Set(s).add(fresh.id));
  };

  const duplicateSection = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const src = blocks[i];
    const copy = deepCopy(src);
    copy.id = uidCopy(src.type);
    const c = childrenOf(copy);
    if (c) copy[c.spec.key] = c.list.map((it) => ({ ...it, id: newChildId(c.spec.key) }));
    const next = [...blocks];
    next.splice(i + 1, 0, copy);
    onChange(next);
    setMenuId(null);
    onSelect({ blockId: copy.id });
  };

  const removeSection = (id: string) => {
    const b = blocks.find((x) => x.id === id);
    const label = types.find((t) => t.type === b?.type)?.label ?? "บล็อก";
    if (!confirm(`ลบ "${label}" ออกจากหน้า?`)) return;
    onChange(blocks.filter((x) => x.id !== id));
    if (selection?.blockId === id) onSelect(null);
    setMenuId(null);
  };

  const moveSection = (id: string, dir: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const setVis = (id: string, key: keyof Visibility, value: boolean) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    patchBlock(id, { visibility: { ...ALL_VISIBLE, ...b.visibility, [key]: value } });
  };

  const addChild = (blockId: string) => {
    const b = blocks.find((x) => x.id === blockId);
    const c = b && childrenOf(b);
    if (!b || !c || c.list.length >= c.spec.max) return;
    const item: ChildBlock = { id: newChildId(c.spec.key), enabled: true, ...blankChild(c.spec) };
    patchBlock(blockId, { [c.spec.key]: [...c.list, item] });
    setExpanded((s) => new Set(s).add(blockId));
    onSelect({ blockId, childId: item.id });
  };

  const duplicateChild = (blockId: string, childId: string) => {
    const b = blocks.find((x) => x.id === blockId);
    const c = b && childrenOf(b);
    if (!b || !c || c.list.length >= c.spec.max) return;
    const i = c.list.findIndex((it) => it.id === childId);
    const copy = { ...deepCopy(c.list[i]), id: newChildId(c.spec.key) };
    const next = [...c.list];
    next.splice(i + 1, 0, copy);
    patchBlock(blockId, { [c.spec.key]: next });
    onSelect({ blockId, childId: copy.id });
  };

  const removeChild = (blockId: string, childId: string) => {
    const b = blocks.find((x) => x.id === blockId);
    const c = b && childrenOf(b);
    if (!b || !c) return;
    patchBlock(blockId, { [c.spec.key]: c.list.filter((it) => it.id !== childId) });
    if (selection?.childId === childId) onSelect({ blockId });
  };

  const moveChildTo = (blockId: string, childId: string, idx: number) => {
    const b = blocks.find((x) => x.id === blockId);
    const c = b && childrenOf(b);
    if (!b || !c) return;
    const from = c.list.findIndex((it) => it.id === childId);
    if (from < 0) return;
    const next = [...c.list];
    const [moved] = next.splice(from, 1);
    next.splice(idx > from ? idx - 1 : idx, 0, moved);
    patchBlock(blockId, { [c.spec.key]: next });
  };

  /* ── ลากวาง Section ── */
  const endDrag = () => {
    setDrag(null);
    setOverIdx(null);
    setChildOver(null);
  };
  const dropAt = (idx: number) => {
    if (!drag || drag.kind === "child") return endDrag();
    if (drag.kind === "new") addSection(drag.type, idx);
    else {
      const from = blocks.findIndex((b) => b.id === drag.id);
      if (from >= 0) {
        const next = [...blocks];
        const [moved] = next.splice(from, 1);
        next.splice(idx > from ? idx - 1 : idx, 0, moved);
        onChange(next);
      }
    }
    endDrag();
  };
  const overBlock = (e: React.DragEvent, i: number) => {
    if (!drag || drag.kind === "child") return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setOverIdx(e.clientY < r.top + r.height / 2 ? i : i + 1);
  };
  /** เส้นบอกตำแหน่ง — ต้องเป็นฟังก์ชันคืน JSX (component ย่อยจะสร้าง DOM ใหม่ทุกครั้งที่ขยับเมาส์แล้ว dragleave ยิงรัว) */
  const dropLine = (idx: number) => {
    if (!drag || drag.kind === "child") return null;
    const active = overIdx === idx;
    return (
      <li
        onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
        onDrop={(e) => { e.preventDefault(); dropAt(idx); }}
        className={`rounded-lg transition-all ${active ? "h-9 border-2 border-dashed border-blue-500 bg-blue-50 flex items-center justify-center" : "h-2 border-2 border-dashed border-transparent"}`}
      >
        {active && <span className="text-[11px] font-medium text-blue-600">วางตรงนี้</span>}
      </li>
    );
  };

  /* ── คลัง Section ── */
  const grouped = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    const hit = types.filter((t) => !q || t.label.toLowerCase().includes(q) || t.hint.toLowerCase().includes(q) || t.type.includes(q));
    const map = new Map<string, BlockTypeInfo[]>();
    for (const t of hit) {
      const g = t.group ?? "อื่น ๆ";
      map.set(g, [...(map.get(g) ?? []), t]);
    }
    const order = [...SECTION_GROUP_ORDER, ...[...map.keys()].filter((g) => !SECTION_GROUP_ORDER.includes(g))];
    return order.filter((g) => map.has(g)).map((g) => [g, map.get(g)!] as const);
  }, [types, libQuery]);

  /* ── สิ่งที่เลือก ── */
  const selBlock = selection ? blocks.find((b) => b.id === selection.blockId) ?? null : null;
  const selChild = selBlock && selection?.childId ? childrenOf(selBlock)?.list.find((it) => it.id === selection.childId) ?? null : null;
  const selSchema = selBlock ? SECTION_SCHEMAS[selBlock.type] : null;

  const dev = DEVICES.find((d) => d.k === device)!;
  const scale = zoom === "fit" ? Math.min(1, (boxW - 16) / dev.w) : zoom;

  /* ── พรีวิว ── */
  const previewToolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {DEVICES.map((d) => (
        <button key={d.k} onClick={() => setDevice(d.k)} title={`${d.label} ${d.w}×${d.h}`} className={`px-2.5 py-1 rounded-lg border text-xs ${device === d.k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
          {d.icon}
        </button>
      ))}
      <select value={String(zoom)} onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : (Number(e.target.value) as Zoom))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700">
        <option value="fit">พอดีจอ</option>
        <option value="0.5">50%</option>
        <option value="0.75">75%</option>
        <option value="1">100%</option>
      </select>
      <button onClick={() => setFullscreen((v) => !v)} title="เต็มจอ (Esc เพื่อออก)" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">{fullscreen ? "⤡" : "⤢"}</button>
      <button onClick={() => iframeRef.current?.contentWindow?.location.reload()} title="โหลดใหม่ (ดูผลหลังบันทึกร่าง)" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">↻</button>
      {previewSrc && (
        <a href={previewSrc} target="_blank" rel="noreferrer" title="เปิดแท็บใหม่" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">↗</a>
      )}
      <span className="text-[10px] text-slate-400 ml-auto">{dev.w}×{dev.h} · {Math.round(scale * 100)}%</span>
    </div>
  );

  const previewFrame = (heightCss: string) => (
    <div ref={previewBoxRef} className="rounded-xl border border-slate-200 bg-slate-100 overflow-hidden" style={{ height: heightCss }}>
      {previewSrc ? (
        <div className="w-full h-full overflow-auto py-2">
          <div style={{ width: dev.w * scale, height: dev.h * scale, margin: "0 auto", overflow: "hidden" }}>
            <iframe
              ref={iframeRef}
              src={previewSrc}
              title="พรีวิวหน้าเว็บ"
              className="bg-white border-0 shadow-sm"
              style={{ width: dev.w, height: dev.h, transform: `scale(${scale})`, transformOrigin: "top left", flexShrink: 0, display: "block" }}
            />
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center text-sm text-slate-400 px-6 text-center gap-1">
          <span>ยังไม่ได้ผูกโดเมนเว็บกับร้านนี้</span>
          <span className="text-[11px]">เมื่อเว็บร้านขึ้น Vercel แล้ว ใส่โดเมนในตาราง shop_domains พรีวิวจะขึ้นที่นี่</span>
        </div>
      )}
    </div>
  );

  /* ── แผงซ้าย: ต้นไม้ ── */
  const childRow = (b: Block, c: { spec: ChildSpec; list: ChildBlock[] }, it: ChildBlock, idx: number) => {
    const isSel = selection?.blockId === b.id && selection?.childId === it.id;
    const dragging = drag?.kind === "child" && drag.childId === it.id;
    const over = childOver?.blockId === b.id && childOver.idx === idx && drag?.kind === "child" && drag.blockId === b.id;
    return (
      <Fragment key={it.id}>
        {over && <li className="h-1.5 rounded bg-blue-500 mx-6" />}
        <li
          id={`blk-${it.id}`}
          draggable
          onDragStart={(e) => { e.stopPropagation(); setDrag({ kind: "child", blockId: b.id, childId: it.id }); }}
          onDragEnd={endDrag}
          onDragOver={(e) => {
            if (drag?.kind !== "child" || drag.blockId !== b.id) return;
            e.preventDefault();
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setChildOver({ blockId: b.id, idx: e.clientY < r.top + r.height / 2 ? idx : idx + 1 });
          }}
          onDrop={(e) => {
            if (drag?.kind !== "child") return;
            e.preventDefault();
            e.stopPropagation();
            moveChildTo(b.id, drag.childId, childOver?.idx ?? idx);
            endDrag();
          }}
          className={`ml-6 flex items-center gap-1.5 rounded-lg border px-2 py-1.5 bg-white ${dragging ? "opacity-40" : ""} ${isSel ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`}
        >
          <span className="cursor-grab text-slate-300 select-none text-xs">⠿</span>
          <span className="text-sm">{c.spec.icon}</span>
          <button onClick={() => onSelect({ blockId: b.id, childId: it.id })} className="flex-1 min-w-0 text-left">
            <span className={`block text-xs truncate ${it.enabled === false ? "text-slate-400 line-through" : "text-slate-700"}`}>
              {c.spec.summary(it) || c.spec.itemLabel}
            </span>
          </button>
          <button onClick={() => patchChild(b.id, it.id, { enabled: it.enabled === false })} title={it.enabled === false ? "แสดง" : "ซ่อน"} className="text-[11px] text-slate-400 hover:text-slate-800 px-1">
            {it.enabled === false ? "👁️‍🗨️" : "👁️"}
          </button>
          <button onClick={() => duplicateChild(b.id, it.id)} disabled={c.list.length >= c.spec.max} title="ทำสำเนา" className="text-[11px] text-slate-400 hover:text-slate-800 px-1 disabled:opacity-30">📑</button>
          <button onClick={() => removeChild(b.id, it.id)} title="ลบ" className="text-[11px] text-slate-400 hover:text-red-500 px-1">🗑️</button>
        </li>
      </Fragment>
    );
  };

  const tree = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">{drag ? "ปล่อยตรงเส้นน้ำเงินเพื่อวาง" : "คลิกชื่อเพื่อแก้ · ลากเพื่อสลับลำดับ"}</p>
        <button onClick={() => setShowLib((v) => !v)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
          {showLib ? "ปิดคลัง" : "+ เพิ่ม Section"}
        </button>
      </div>

      {showLib && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-3">
          <input className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" value={libQuery} onChange={(e) => setLibQuery(e.target.value)} placeholder="ค้นหา เช่น รูป, สินค้า, คำถาม" autoFocus />
          {grouped.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">ไม่พบ Section ที่ค้นหา</p>
          ) : (
            grouped.map(([group, list]) => (
              <div key={group}>
                <p className="text-[11px] font-medium text-slate-500 mb-1.5">{group}</p>
                <div className="grid gap-1.5">
                  {list.map((t) => (
                    <button
                      key={t.type}
                      draggable
                      onDragStart={() => setDrag({ kind: "new", type: t.type })}
                      onDragEnd={endDrag}
                      onClick={() => { addSection(t.type); setLibQuery(""); }}
                      title={`${t.label} — ลากไปวางในโครง หรือกดเพื่อเพิ่มต่อท้าย`}
                      className={`flex items-start gap-2 bg-white rounded-lg border px-2.5 py-2 text-left cursor-grab active:cursor-grabbing hover:border-blue-400 ${drag?.kind === "new" && drag.type === t.type ? "border-blue-500 opacity-50" : "border-slate-200"}`}
                    >
                      <span className="text-base leading-none">{t.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-slate-800">{t.label}</span>
                        <span className="block text-[10px] text-slate-400 truncate">{t.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <ul className={drag && drag.kind !== "child" ? "space-y-0" : "space-y-1.5"}>
        {blocks.map((b, i) => {
          const info = types.find((t) => t.type === b.type);
          const schema = SECTION_SCHEMAS[b.type];
          const c = childrenOf(b);
          const isSel = selection?.blockId === b.id && !selection.childId;
          const isOpen = expanded.has(b.id);
          return (
            <Fragment key={b.id}>
              {dropLine(i)}
              <li
                id={`blk-${b.id}`}
                draggable
                onDragStart={() => setDrag({ kind: "move", id: b.id })}
                onDragEnd={endDrag}
                onDragOver={(e) => overBlock(e, i)}
                onDrop={(e) => { if (drag?.kind === "child") return; e.preventDefault(); dropAt(overIdx ?? i); }}
                className={`rounded-xl border bg-white transition ${drag?.kind === "move" && drag.id === b.id ? "border-blue-400 opacity-50" : isSel ? "border-blue-500 ring-2 ring-blue-100" : selection?.blockId === b.id ? "border-blue-300" : "border-slate-200"}`}
              >
                <div className="flex items-center gap-1.5 px-2 py-2">
                  <span className="cursor-grab text-slate-300 select-none" title="ลากเพื่อย้าย">⠿</span>
                  {c ? (
                    <button onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} className="w-4 text-[10px] text-slate-400 hover:text-slate-800" title={isOpen ? "พับ" : "ดู Block ย่อย"}>
                      {isOpen ? "▾" : "▸"}
                    </button>
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className="text-base">{info?.icon ?? "🧩"}</span>
                  <button onClick={() => onSelect({ blockId: b.id })} className="flex-1 min-w-0 text-left">
                    <span className={`block text-xs font-medium truncate ${b.enabled ? "text-slate-800" : "text-slate-400 line-through"}`}>
                      {info?.label ?? b.type}
                      {visibilityLabel(b.visibility) && <span className="ml-1.5 text-[9px] font-normal px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">{visibilityLabel(b.visibility)}</span>}
                    </span>
                    <span className="block text-[10px] text-slate-400 truncate">{schema ? blockSummary(b) : "บล็อกของระบบเดิม — แก้ที่นี่ไม่ได้"}</span>
                  </button>
                  <button onClick={() => patchBlock(b.id, { enabled: !b.enabled })} title={b.enabled ? "ซ่อน Section นี้" : "แสดง Section นี้"} className={`shrink-0 w-8 h-4 rounded-full transition relative ${b.enabled ? "bg-emerald-500" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${b.enabled ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                  <div className="relative shrink-0">
                    <button onClick={() => setMenuId(menuId === b.id ? null : b.id)} className="w-6 h-6 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-400 text-xs" title="เพิ่มเติม">⋯</button>
                    {menuId === b.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                        <div className="absolute right-0 top-7 z-20 w-52 rounded-xl border border-slate-200 bg-white shadow-lg py-1.5">
                          <button onClick={() => duplicateSection(b.id)} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">📑 ทำสำเนา</button>
                          <button onClick={() => { moveSection(b.id, -1); setMenuId(null); }} disabled={i === 0} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-30">▲ เลื่อนขึ้น</button>
                          <button onClick={() => { moveSection(b.id, 1); setMenuId(null); }} disabled={i === blocks.length - 1} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-30">▼ เลื่อนลง</button>
                          <div className="border-t border-slate-100 my-1" />
                          <p className="px-3 py-1 text-[11px] text-slate-400">แสดงบนอุปกรณ์</p>
                          {([{ k: "desktop" as const, l: "🖥️ คอมพิวเตอร์" }, { k: "tablet" as const, l: "📱 แท็บเล็ต" }, { k: "mobile" as const, l: "📲 มือถือ" }]).map((d) => {
                            const on = { ...ALL_VISIBLE, ...b.visibility }[d.k];
                            return (
                              <label key={d.k} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={on} onChange={(e) => setVis(b.id, d.k, e.target.checked)} />
                                {d.l}
                              </label>
                            );
                          })}
                          <div className="border-t border-slate-100 my-1" />
                          <button onClick={() => removeSection(b.id)} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">🗑️ ลบ Section นี้</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {c && isOpen && (
                  <ul className="pb-2 pr-2 space-y-1" onDragOver={(e) => { if (drag?.kind === "child" && drag.blockId === b.id) e.preventDefault(); }}>
                    {c.list.map((it, idx) => childRow(b, c, it, idx))}
                    {drag?.kind === "child" && drag.blockId === b.id && childOver?.blockId === b.id && childOver.idx === c.list.length && <li className="h-1.5 rounded bg-blue-500 mx-6" />}
                    <li
                      className="ml-6"
                      onDragOver={(e) => { if (drag?.kind === "child" && drag.blockId === b.id) { e.preventDefault(); setChildOver({ blockId: b.id, idx: c.list.length }); } }}
                      onDrop={(e) => { if (drag?.kind !== "child") return; e.preventDefault(); moveChildTo(b.id, drag.childId, c.list.length); endDrag(); }}
                    >
                      <button onClick={() => addChild(b.id)} disabled={c.list.length >= c.spec.max} className="text-[11px] text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline">
                        + เพิ่ม{c.spec.itemLabel} {c.list.length >= c.spec.max ? `(ครบ ${c.spec.max} แล้ว)` : `(${c.list.length}/${c.spec.max})`}
                      </button>
                    </li>
                  </ul>
                )}
              </li>
            </Fragment>
          );
        })}
        {dropLine(blocks.length)}
      </ul>

      {!blocks.length && (
        <div
          onDragOver={(e) => { if (drag && drag.kind !== "child") { e.preventDefault(); setOverIdx(0); } }}
          onDrop={(e) => { e.preventDefault(); dropAt(0); }}
          className={`rounded-xl border-2 border-dashed py-10 text-center text-sm transition ${drag ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-300 text-slate-400"}`}
        >
          {drag ? "วางตรงนี้เพื่อเริ่มจัดหน้า" : 'ยังไม่มี Section — กด "+ เพิ่ม Section" หรือลากจากคลังมาวาง'}
        </div>
      )}
    </div>
  );

  /* ── แผงขวา: คุณสมบัติ ── */
  const props = !selBlock ? (
    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
      <p>เลือก Section หรือ Block ทางซ้าย</p>
      <p className="text-[11px] mt-1">หรือคลิกส่วนที่ต้องการแก้ในพรีวิวตรงกลาง</p>
    </div>
  ) : !selSchema ? (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-800">
      บล็อกชนิด <code>{selBlock.type}</code> เป็นของระบบเดิม แก้ในตัวจัดหน้านี้ไม่ได้ (ยังอยู่บนเว็บตามเดิม)
    </div>
  ) : selChild ? (
    <div className="space-y-4">
      <div>
        <button onClick={() => onSelect({ blockId: selBlock.id })} className="text-[11px] text-slate-500 hover:text-blue-600">← {selSchema.meta.icon} {selSchema.meta.label}</button>
        <h3 className="text-sm font-semibold text-slate-800 mt-0.5">
          {selSchema.children!.icon} {selSchema.children!.itemLabel}: {selSchema.children!.summary(selChild) || "—"}
        </h3>
      </div>
      <SchemaForm fields={selSchema.children!.fields} value={selChild} onChange={(p) => patchChild(selBlock.id, selChild.id, p)} ctx={ctx} compact />
      <div className="pt-3 border-t border-slate-200 space-y-2">
        <p className="text-[11px] font-medium text-slate-500">แสดงบนอุปกรณ์</p>
        <div className="flex flex-wrap gap-3">
          {([{ k: "desktop" as const, l: "🖥️ คอม" }, { k: "tablet" as const, l: "📱 แท็บเล็ต" }, { k: "mobile" as const, l: "📲 มือถือ" }]).map((d) => {
            const on = { ...ALL_VISIBLE, ...selChild.visibility }[d.k];
            return (
              <label key={d.k} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={on} onChange={(e) => patchChild(selBlock.id, selChild.id, { visibility: { ...ALL_VISIBLE, ...selChild.visibility, [d.k]: e.target.checked } })} />
                {d.l}
              </label>
            );
          })}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={selChild.enabled !== false} onChange={(e) => patchChild(selBlock.id, selChild.id, { enabled: e.target.checked })} />
          เปิดใช้ {selSchema.children!.itemLabel}นี้
        </label>
      </div>
      <div className="flex justify-between pt-3 border-t border-slate-200">
        <button onClick={() => duplicateChild(selBlock.id, selChild.id)} className="text-xs text-slate-600 hover:text-blue-600">📑 ทำสำเนา</button>
        <button onClick={() => removeChild(selBlock.id, selChild.id)} className="text-xs text-red-500 hover:underline">ลบ{selSchema.children!.itemLabel}นี้</button>
      </div>
    </div>
  ) : (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{selSchema.meta.icon} {selSchema.meta.label}</h3>
        <p className="text-[11px] text-slate-400">{selSchema.meta.hint}</p>
      </div>
      <SchemaForm fields={selSchema.fields} value={selBlock} onChange={(p) => patchBlock(selBlock.id, p)} ctx={ctx} />
      {selSchema.children && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-500">
          {selSchema.children.icon} {selSchema.children.label}: {childrenOf(selBlock)?.list.length ?? 0} รายการ — แก้ทีละชิ้นได้จากต้นไม้ทางซ้าย (กด ▸ หน้าชื่อ Section)
          <button onClick={() => addChild(selBlock.id)} className="ml-2 text-blue-600 hover:underline">+ เพิ่ม{selSchema.children.itemLabel}</button>
        </div>
      )}
      <StylePanel value={{ ...DEFAULT_BLOCK_STYLE, ...((selBlock.style as Partial<BlockStyle>) ?? {}) }} onChange={(style) => patchBlock(selBlock.id, { style })} />
      <div className="pt-3 border-t border-slate-200">
        <p className="text-[11px] font-medium text-slate-500 mb-1.5">แสดงบนอุปกรณ์</p>
        <div className="flex flex-wrap gap-3">
          {([{ k: "desktop" as const, l: "🖥️ คอม" }, { k: "tablet" as const, l: "📱 แท็บเล็ต" }, { k: "mobile" as const, l: "📲 มือถือ" }]).map((d) => {
            const on = { ...ALL_VISIBLE, ...selBlock.visibility }[d.k];
            return (
              <label key={d.k} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={on} onChange={(e) => setVis(selBlock.id, d.k, e.target.checked)} />
                {d.l}
              </label>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between pt-3 border-t border-slate-200">
        <button onClick={() => duplicateSection(selBlock.id)} className="text-xs text-slate-600 hover:text-blue-600">📑 ทำสำเนา Section</button>
        <button onClick={() => removeSection(selBlock.id)} className="text-xs text-red-500 hover:underline">ลบ Section นี้</button>
      </div>
    </div>
  );

  return (
    <>
      <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)_360px] lg:grid-cols-[280px_minmax(0,1fr)] items-start">
        {/* ซ้าย */}
        <aside className="min-w-0 lg:sticky lg:top-4 max-h-[80vh] overflow-y-auto pr-1">{tree}</aside>
        {/* กลาง */}
        <div className="min-w-0 lg:sticky lg:top-4 space-y-2">
          {previewToolbar}
          {previewFrame(previewHeight)}
          <p className="text-[10px] text-slate-400 text-center">คลิก Section/Block ในพรีวิวเพื่อเลือก · บันทึกร่างแล้วกด ↻ เพื่อดูผลเต็ม</p>
        </div>
        {/* ขวา */}
        <aside className="min-w-0 xl:sticky xl:top-4 max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2 xl:col-span-1">{props}</aside>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm p-4 flex flex-col gap-3">
          <div className="bg-white rounded-xl px-4 py-2.5">{previewToolbar}</div>
          <div className="flex-1 min-h-0">{previewFrame("100%")}</div>
        </div>
      )}
    </>
  );
}
