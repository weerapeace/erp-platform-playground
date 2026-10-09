"use client";

/**
 * WebsiteBuilder — ตัวจัดหน้าเว็บแบบ 3 แผง (ของกลาง ใช้ทั้งแท็บ "หน้าแรก" และ "หน้าเว็บ")
 *
 *   แถบบน  = สถานะ · จุดที่ควรแก้ · ย้อน/ทำซ้ำ · สลับจอ/ซูม/โหลดใหม่ · ประวัติ · บันทึกร่าง · เผยแพร่ (ข้อมูล/ปุ่มมาจาก prop toolbar)
 *   ซ้าย   = โครงหน้า: Section → Block ย่อย (กะทัดรัด · ลากเรียง · คลิกขวา · ปุ่มโผล่ตอนชี้) + คลัง Section แบบเลื่อนออก + ให้ AI ช่วย
 *   กลาง   = พรีวิวเว็บจริงใน iframe (คลิก/ลากวาง/หูจับ · โหลดใหม่เองเมื่อ previewVersion เปลี่ยน)
 *   ขวา    = คุณสมบัติของสิ่งที่เลือก แบ่งแท็บ เนื้อหา / รูปลักษณ์ / ลูกเล่น
 *   จอแคบ (< lg) = สลับแท็บ โครง / พรีวิว / ตั้งค่า
 *
 * คีย์ลัด: Delete ลบที่เลือก · Ctrl+D ทำสำเนา · ↑/↓ เลือก Section ก่อน/ถัดไป (เมื่อไม่ได้พิมพ์ในช่อง) · Esc ปิดคลัง/เมนู/เต็มจอ
 * ไฟล์นี้ "ไม่รู้" ว่าชนิดบล็อกมีอะไรบ้าง — ทุกอย่างอ่านจาก lib/website-schema.ts
 * ข้อมูล/บันทึก/เผยแพร่ เป็นหน้าที่ของตัวที่เรียกใช้ (layout panel / pages panel) — ส่ง blocks + onChange + toolbar มา
 *
 * คุยกับพรีวิว (เว็บร้านต้องมี PreviewBridge):
 *   เว็บ → ERP : storefront-block-click {blockId, childId?} · storefront-drop {data, beforeId} · storefront-preview-loaded · storefront-scroll {y}
 *   ERP → เว็บ : storefront-select-block {blockId, childId?} · storefront-restore-scroll {y}
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { SECTION_SCHEMAS, SECTION_GROUP_ORDER, blankChild, newChildId, type ChildSpec } from "@/lib/website-schema";
import { blockSummary, normalizeBlocks, DEFAULT_BLOCK_STYLE, DEFAULT_MOTION, type BlockStyle, type BlockType, type ValidationIssue } from "@/lib/website-blocks";
import { buildAiPrompt } from "@/lib/website-ai-prompt";
import { ERPModal } from "@/components/modal";
import { SchemaForm, type SchemaFormContext } from "@/components/website-schema-form";
import { StylePanel, makeBlock, visibilityLabel, ALL_VISIBLE, type Block, type ChildBlock, type BlockTypeInfo, type Visibility } from "@/components/website-block-editor";

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

/** สรุปว่าร่างต่างจากที่เผยแพร่ตรงไหน (เป็นชื่อ Section ที่อ่านออก — ตัวที่เรียกใช้คำนวณให้) */
export interface ChangeSummary {
  added: string[];
  removed: string[];
  changed: string[];
}

/** แถบเครื่องมือด้านบน — ข้อมูล/ปุ่มมาจากตัวที่เรียกใช้ (layout panel / pages panel) */
export interface BuilderToolbar {
  /** true = มีการแก้ที่ยังไม่เผยแพร่ */
  dirty: boolean;
  statusNote?: string;
  savedText?: string;
  saving?: boolean;
  issues: ValidationIssue[];
  changes?: ChangeSummary;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  autoSave?: boolean;
  onAutoSave?: (v: boolean) => void;
  onHistory?: () => void;
  onDiscard?: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  publishLabel?: string;
  busy?: boolean;
  /** ของเพิ่มด้านซ้ายสุด เช่น ปุ่มกลับ/ชื่อหน้า (แท็บหน้าเว็บ) */
  leading?: ReactNode;
}

const uidCopy = (type: string) => `${type}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
const deepCopy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const childrenOf = (b: Block): { spec: ChildSpec; list: ChildBlock[] } | null => {
  const spec = SECTION_SCHEMAS[b.type]?.children;
  if (!spec) return null;
  const list = Array.isArray(b[spec.key]) ? (b[spec.key] as ChildBlock[]) : [];
  return { spec, list };
};
const inInput = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};
const DEVICE_OPTS = [
  { k: "desktop" as const, l: "🖥️ คอม" },
  { k: "tablet" as const, l: "📱 แท็บเล็ต" },
  { k: "mobile" as const, l: "📲 มือถือ" },
];

type Drag = { kind: "move"; id: string } | { kind: "new"; type: BlockType } | { kind: "child"; blockId: string; childId: string };
type Pane = "tree" | "preview" | "props";
type PropTab = "content" | "style" | "motion";

const iconBtn = "inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-400 disabled:opacity-40 text-sm";
const miniBtn = "w-6 h-6 rounded text-[12px] text-slate-400 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30";

export function WebsiteBuilder({
  blocks,
  onChange,
  types,
  ctx,
  previewSrc,
  iframeRef: iframeRefProp,
  selection,
  onSelect,
  previewHeight = "calc(100vh - 170px)",
  previewVersion = 0,
  toolbar,
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
  /** ตัวที่เรียกใช้บวกเลขนี้เมื่อบันทึกร่าง/เผยแพร่แล้ว → พรีวิวโหลดใหม่เอง (แล้วเลื่อนกลับไปที่เดิม) */
  previewVersion?: number;
  toolbar?: BuilderToolbar;
}) {
  const localIframe = useRef<HTMLIFrameElement>(null);
  const iframeRef = iframeRefProp ?? localIframe;

  /* ── สถานะหน้าจอ ── */
  const [device, setDevice] = useState<Device>("desktop");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [fullscreen, setFullscreen] = useState(false);
  const [pane, setPane] = useState<Pane>("tree");
  const [propTab, setPropTab] = useState<PropTab>("content");
  const [showLib, setShowLib] = useState(false);
  const [libQuery, setLibQuery] = useState("");
  const [showAi, setShowAi] = useState(false);
  const [aiBrief, setAiBrief] = useState("");
  const [aiJson, setAiJson] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [childOver, setChildOver] = useState<{ blockId: string; idx: number } | null>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(600);
  /** โหลดพรีวิวใหม่ด้วยการเปลี่ยน src (iframe ต่างโดเมน สั่ง reload ตรง ๆ ไม่ได้) */
  const [nonce, setNonce] = useState(0);
  const lastScrollY = useRef(0);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  useEffect(() => {
    setNonce((n) => n + 1);
  }, [previewVersion]);
  const reloadPreview = () => setNonce((n) => n + 1);

  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, [fullscreen, pane]);

  /* ── แก้ไขโครง ── */
  const patchBlock = useCallback((id: string, p: Record<string, unknown>) => onChange(blocksRef.current.map((b) => (b.id === id ? { ...b, ...p } : b))), [onChange]);

  const patchChild = (blockId: string, childId: string, p: Record<string, unknown>) => {
    const b = blocks.find((x) => x.id === blockId);
    const c = b && childrenOf(b);
    if (!b || !c) return;
    patchBlock(blockId, { [c.spec.key]: c.list.map((it) => (it.id === childId ? { ...it, ...p } : it)) });
  };

  const addSection = useCallback(
    (type: BlockType, at?: number) => {
      const cur = blocksRef.current;
      const fresh = makeBlock(type, cur.length + 1);
      const next = [...cur];
      next.splice(at ?? cur.length, 0, fresh);
      onChange(next);
      onSelect({ blockId: fresh.id });
      setPropTab("content");
      setExpanded((s) => new Set(s).add(fresh.id));
      setShowLib(false);
      setLibQuery("");
    },
    [onChange, onSelect]
  );

  const duplicateSection = useCallback(
    (id: string) => {
      const cur = blocksRef.current;
      const i = cur.findIndex((b) => b.id === id);
      if (i < 0) return;
      const copy = deepCopy(cur[i]);
      copy.id = uidCopy(copy.type);
      const c = childrenOf(copy);
      if (c) copy[c.spec.key] = c.list.map((it) => ({ ...it, id: newChildId(c.spec.key) }));
      const next = [...cur];
      next.splice(i + 1, 0, copy);
      onChange(next);
      onSelect({ blockId: copy.id });
    },
    [onChange, onSelect]
  );

  const removeSection = useCallback(
    (id: string) => {
      const cur = blocksRef.current;
      const b = cur.find((x) => x.id === id);
      const label = types.find((t) => t.type === b?.type)?.label ?? "บล็อก";
      if (!confirm(`ลบ "${label}" ออกจากหน้า?`)) return;
      onChange(cur.filter((x) => x.id !== id));
      if (selectionRef.current?.blockId === id) onSelect(null);
    },
    [onChange, onSelect, types]
  );

  const moveSection = useCallback(
    (id: string, dir: -1 | 1) => {
      const cur = blocksRef.current;
      const i = cur.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      onChange(next);
    },
    [onChange]
  );

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
    setPropTab("content");
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

  /* ── พรีวิว ↔ ตัวจัดหน้า ── */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; blockId?: string; childId?: string; y?: number; data?: string; beforeId?: string | null } | null;
      if (!d?.type) return;
      if (d.type === "storefront-block-click" && d.blockId) {
        onSelect({ blockId: d.blockId, childId: d.childId ?? null });
        setPropTab("content");
        if (d.childId) setExpanded((s) => new Set(s).add(d.blockId!));
        document.getElementById(`blk-${d.childId ?? d.blockId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (d.type === "storefront-scroll") {
        lastScrollY.current = Number(d.y) || 0;
        return;
      }
      if (d.type === "storefront-preview-loaded") {
        // พรีวิวโหลดใหม่ → ไฮไลต์+เลื่อนไปที่ที่เลือกอยู่ หรือคืนตำแหน่งเลื่อนเดิม
        const sel = selectionRef.current;
        const win = iframeRef.current?.contentWindow;
        if (sel) win?.postMessage({ type: "storefront-select-block", blockId: sel.blockId, childId: sel.childId ?? null }, "*");
        else if (lastScrollY.current > 0) win?.postMessage({ type: "storefront-restore-scroll", y: lastScrollY.current }, "*");
        return;
      }
      if (d.type === "storefront-drop" && typeof d.data === "string") {
        // วางของที่ลากมาจากคลัง/ต้นไม้/หูจับในพรีวิว ลง "ก่อนหน้า" Section ที่ beforeId (null = ท้ายสุด)
        const cur = blocksRef.current;
        const at = d.beforeId ? cur.findIndex((b) => b.id === d.beforeId) : cur.length;
        const idx = at < 0 ? cur.length : at;
        if (d.data.startsWith("website-new:")) {
          const type = d.data.slice("website-new:".length) as BlockType;
          if (SECTION_SCHEMAS[type]) addSection(type, idx);
        } else if (d.data.startsWith("website-move:")) {
          const id = d.data.slice("website-move:".length);
          const from = cur.findIndex((b) => b.id === id);
          if (from < 0) return;
          const next = [...cur];
          const [moved] = next.splice(from, 1);
          next.splice(idx > from ? idx - 1 : idx, 0, moved);
          onChange(next);
          onSelect({ blockId: id });
        }
        setDrag(null);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onSelect, onChange, iframeRef, addSection]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: "storefront-select-block", blockId: selection?.blockId ?? null, childId: selection?.childId ?? null }, "*");
  }, [selection, iframeRef]);

  /* ── คีย์ลัด ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreen) setFullscreen(false);
        setMenu(null);
        setShowLib(false);
        setShowIssues(false);
        setShowChanges(false);
        return;
      }
      if (inInput(e.target) || showAi) return;
      const sel = selectionRef.current;
      const cur = blocksRef.current;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && sel) {
        e.preventDefault();
        if (sel.childId) duplicateChild(sel.blockId, sel.childId);
        else duplicateSection(sel.blockId);
        return;
      }
      if (e.key === "Delete" && sel) {
        e.preventDefault();
        if (sel.childId) removeChild(sel.blockId, sel.childId);
        else removeSection(sel.blockId);
        return;
      }
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && cur.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const i = sel ? cur.findIndex((b) => b.id === sel.blockId) : -1;
        const j = e.key === "ArrowUp" ? Math.max(0, i - 1) : Math.min(cur.length - 1, i + 1);
        onSelect({ blockId: cur[j].id });
        document.getElementById(`blk-${cur[j].id}`)?.scrollIntoView({ block: "nearest" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen, showAi, duplicateSection, removeSection, onSelect]);

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
  /** เส้นบอกตำแหน่ง — เป็นฟังก์ชันคืน JSX (component ย่อยจะสร้าง DOM ใหม่ทุกครั้งที่ขยับเมาส์ → dragleave ยิงรัว) */
  const dropLine = (idx: number) => {
    if (!drag || drag.kind === "child") return null;
    const active = overIdx === idx;
    return (
      <li
        onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
        onDrop={(e) => { e.preventDefault(); dropAt(idx); }}
        className={`rounded transition-all ${active ? "h-7 border-2 border-dashed border-blue-500 bg-blue-50 flex items-center justify-center" : "h-1.5 border border-dashed border-transparent"}`}
      >
        {active && <span className="text-[10px] font-medium text-blue-600">วางตรงนี้</span>}
      </li>
    );
  };

  /* ── ให้ AI ช่วย ── */
  const aiPrompt = useMemo(() => buildAiPrompt({ shopName: ctx.shopName ?? ctx.shopSlug, categories: ctx.categories, brief: aiBrief.trim() || undefined }), [ctx, aiBrief]);
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ผู้ใช้เลือกข้อความเองได้ */
    }
  };
  const importAiJson = () => {
    setAiError(null);
    let raw = aiJson.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setAiError("อ่าน JSON ไม่ออก — ให้ AI ตอบเป็น JSON array ล้วน ๆ (เริ่มด้วย [ จบด้วย ])");
      return;
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const known = list.filter((b) => b && typeof b === "object" && SECTION_SCHEMAS[String((b as { type?: string }).type)]);
    if (!known.length) {
      setAiError("ไม่พบ Section ชนิดที่ระบบรู้จักใน JSON นี้ (ดูรายการชนิดในคำสั่ง)");
      return;
    }
    const fresh = normalizeBlocks(known).map((b) => {
      const copy = deepCopy(b as unknown as Block);
      copy.id = uidCopy(copy.type);
      const c = childrenOf(copy);
      if (c) copy[c.spec.key] = c.list.map((it) => ({ ...it, id: newChildId(c.spec.key) }));
      return copy;
    });
    onChange([...blocks, ...fresh]);
    onSelect({ blockId: fresh[0].id });
    setShowAi(false);
    setAiJson("");
    if (known.length < list.length) alert(`เพิ่ม ${fresh.length} Section แล้ว · ข้าม ${list.length - known.length} ก้อนที่ระบบไม่รู้จัก`);
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
  const errors = (toolbar?.issues ?? []).filter((i) => i.level === "error");
  const warnings = (toolbar?.issues ?? []).filter((i) => i.level === "warning");
  const hasChanges = !!toolbar?.changes && (toolbar.changes.added.length > 0 || toolbar.changes.removed.length > 0 || toolbar.changes.changed.length > 0);

  const dev = DEVICES.find((d) => d.k === device)!;
  const scale = zoom === "fit" ? Math.min(1, (boxW - 16) / dev.w) : zoom;

  /* ── แถบเครื่องมือ ── */
  const topbar = (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2">
      {toolbar?.leading}
      {toolbar && (
        <div className="relative">
          <button
            onClick={() => setShowChanges((v) => !v)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium border ${toolbar.dirty ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}
            title={toolbar.dirty ? "กดดูว่าเปลี่ยนอะไรไปบ้าง" : "ตรงกับเว็บจริงแล้ว"}
          >
            {toolbar.dirty ? "● ยังไม่เผยแพร่" : "✓ เผยแพร่แล้ว"}
          </button>
          {showChanges && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowChanges(false)} />
              <div className="absolute left-0 top-8 z-20 w-72 rounded-xl border border-slate-200 bg-white shadow-lg p-3 text-xs space-y-1.5">
                <p className="font-medium text-slate-800">{toolbar.dirty ? "สิ่งที่ต่างจากเว็บจริง" : "ตรงกับเว็บจริงแล้ว"}</p>
                {hasChanges ? (
                  <>
                    {toolbar.changes!.added.length > 0 && <p className="text-emerald-700">+ เพิ่ม: {toolbar.changes!.added.join(", ")}</p>}
                    {toolbar.changes!.removed.length > 0 && <p className="text-red-600">− ลบ: {toolbar.changes!.removed.join(", ")}</p>}
                    {toolbar.changes!.changed.length > 0 && <p className="text-blue-700">✎ แก้: {toolbar.changes!.changed.join(", ")}</p>}
                  </>
                ) : (
                  <p className="text-slate-500">{toolbar.dirty ? "มีร่างที่บันทึกไว้ (เนื้อหาเหมือนที่เผยแพร่)" : "ไม่มีการเปลี่ยนแปลงค้างอยู่"}</p>
                )}
                {toolbar.dirty && <p className="text-slate-400 pt-1">กด &quot;เผยแพร่&quot; เพื่อให้ขึ้นเว็บจริง</p>}
              </div>
            </>
          )}
        </div>
      )}
      {toolbar?.statusNote && <span className="hidden md:inline text-[11px] text-slate-400">{toolbar.statusNote}</span>}
      {toolbar && <span className="text-[11px] text-slate-400">{toolbar.saving ? "กำลังบันทึก…" : toolbar.savedText ?? ""}</span>}
      {toolbar && (errors.length > 0 || warnings.length > 0) && (
        <div className="relative">
          <button onClick={() => setShowIssues((v) => !v)} className={`text-[11px] px-2 py-1 rounded-full border ${errors.length ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"}`} title="กดดูรายละเอียด">
            {errors.length ? `⚠️ ควรแก้ ${errors.length} จุด` : `💡 แนะนำ ${warnings.length}`}
            {errors.length > 0 && warnings.length > 0 && ` · เตือน ${warnings.length}`}
          </button>
          {showIssues && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowIssues(false)} />
              <ul className="absolute left-0 top-8 z-20 w-80 rounded-xl border border-slate-200 bg-white shadow-lg p-2 space-y-1 max-h-72 overflow-y-auto">
                {toolbar.issues.map((it, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs px-1 py-1">
                    <span className={it.level === "error" ? "text-red-600" : "text-amber-600"}>{it.level === "error" ? "✕" : "!"}</span>
                    <span className="flex-1 text-slate-700">{it.message}</span>
                    {it.blockId && (
                      <button
                        onClick={() => {
                          onSelect({ blockId: it.blockId! });
                          setShowIssues(false);
                          setPane("props");
                          document.getElementById(`blk-${it.blockId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className="text-blue-600 hover:underline whitespace-nowrap"
                      >
                        ไปที่
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <span className="flex-1" />

      {toolbar && (
        <>
          <button onClick={toolbar.onUndo} disabled={!toolbar.canUndo} title="ย้อนกลับ (Ctrl+Z)" className={iconBtn}>↶</button>
          <button onClick={toolbar.onRedo} disabled={!toolbar.canRedo} title="ทำซ้ำ (Ctrl+Shift+Z)" className={iconBtn}>↷</button>
          <span className="w-px h-5 bg-slate-200 mx-0.5" />
        </>
      )}
      {DEVICES.map((d) => (
        <button key={d.k} onClick={() => { setDevice(d.k); setPane("preview"); }} title={`${d.label} ${d.w}×${d.h}`} className={`${iconBtn} ${device === d.k ? "!bg-slate-900 !text-white !border-slate-900" : ""}`}>
          {d.icon}
        </button>
      ))}
      <select value={String(zoom)} onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : (Number(e.target.value) as Zoom))} className="h-8 rounded-lg border border-slate-200 px-1.5 text-xs text-slate-700" title="ซูมพรีวิว">
        <option value="fit">พอดี</option>
        <option value="0.5">50%</option>
        <option value="0.75">75%</option>
        <option value="1">100%</option>
      </select>
      <button onClick={reloadPreview} title="โหลดพรีวิวใหม่" className={iconBtn}>↻</button>
      <button onClick={() => setFullscreen(true)} title="พรีวิวเต็มจอ (Esc ออก)" className={iconBtn}>⤢</button>
      {previewSrc && <a href={previewSrc} target="_blank" rel="noreferrer" title="เปิดพรีวิวในแท็บใหม่" className={iconBtn}>↗</a>}
      {toolbar && (
        <>
          <span className="w-px h-5 bg-slate-200 mx-0.5" />
          {toolbar.onHistory && <button onClick={toolbar.onHistory} title="ประวัติเวอร์ชันที่เผยแพร่" className={iconBtn}>🕘</button>}
          {toolbar.onAutoSave && (
            <label className="hidden xl:flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer" title="บันทึกร่างอัตโนมัติหลังหยุดแก้ 1.5 วิ แล้วพรีวิวอัปเดตเอง">
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={toolbar.autoSave} onChange={(e) => toolbar.onAutoSave?.(e.target.checked)} />
              อัตโนมัติ
            </label>
          )}
          {toolbar.onDiscard && toolbar.dirty && <button onClick={toolbar.onDiscard} className="px-2.5 h-8 rounded-lg text-xs text-slate-500 hover:text-slate-800" title="ละทิ้งการเปลี่ยนแปลงทั้งหมด กลับไปใช้ที่เผยแพร่อยู่">ละทิ้ง</button>}
          <button onClick={toolbar.onSaveDraft} disabled={toolbar.saving || toolbar.busy} className="px-3 h-8 rounded-lg border border-slate-300 text-xs text-slate-700 hover:border-slate-500 disabled:opacity-50">บันทึกร่าง</button>
          <button onClick={toolbar.onPublish} disabled={toolbar.busy} className="px-4 h-8 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
            {toolbar.busy ? "กำลังเผยแพร่…" : toolbar.publishLabel ?? "เผยแพร่"}
          </button>
        </>
      )}
    </div>
  );

  /* ── พรีวิว ── */
  const previewFrame = (heightCss: string) => (
    <div ref={previewBoxRef} className="rounded-xl border border-slate-200 bg-slate-100 overflow-hidden" style={{ height: heightCss }}>
      {previewSrc ? (
        <div className="w-full h-full overflow-auto py-2">
          <div style={{ width: dev.w * scale, height: dev.h * scale, margin: "0 auto", overflow: "hidden" }}>
            <iframe
              ref={iframeRef}
              src={`${previewSrc}&_r=${nonce}`}
              title="พรีวิวหน้าเว็บ"
              className="bg-white border-0 shadow-sm"
              style={{ width: dev.w, height: dev.h, transform: `scale(${scale})`, transformOrigin: "top left", flexShrink: 0, display: "block" }}
            />
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center text-sm text-slate-400 px-6 text-center gap-1" onDragOver={(e) => e.preventDefault()}>
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
        {over && <li className="h-1 rounded bg-blue-500 ml-7 mr-1" />}
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
          onClick={() => { onSelect({ blockId: b.id, childId: it.id }); setPropTab("content"); setPane("props"); }}
          className={`group ml-7 mr-1 flex items-center gap-1.5 rounded-md px-1.5 py-1 cursor-pointer text-[11px] ${dragging ? "opacity-40" : ""} ${isSel ? "bg-orange-50 text-orange-800 ring-1 ring-orange-200" : "text-slate-600 hover:bg-slate-50"}`}
        >
          <span className="cursor-grab text-slate-300 select-none">⠿</span>
          <span className={`flex-1 truncate ${it.enabled === false ? "line-through text-slate-400" : ""}`}>{c.spec.summary(it) || c.spec.itemLabel}</span>
          <span className="hidden group-hover:flex items-center">
            <button onClick={(e) => { e.stopPropagation(); patchChild(b.id, it.id, { enabled: it.enabled === false }); }} title={it.enabled === false ? "แสดง" : "ซ่อน"} className="w-5 h-5 text-[10px] text-slate-400 hover:text-slate-800">{it.enabled === false ? "🚫" : "👁️"}</button>
            <button onClick={(e) => { e.stopPropagation(); duplicateChild(b.id, it.id); }} disabled={c.list.length >= c.spec.max} title="ทำสำเนา" className="w-5 h-5 text-[10px] text-slate-400 hover:text-slate-800 disabled:opacity-30">📑</button>
            <button onClick={(e) => { e.stopPropagation(); removeChild(b.id, it.id); }} title="ลบ" className="w-5 h-5 text-[10px] text-slate-400 hover:text-red-500">🗑️</button>
          </span>
        </li>
      </Fragment>
    );
  };

  const tree = (
    <div className="relative h-full flex flex-col">
      <div className="flex items-center gap-1 mb-2">
        <button onClick={() => setShowLib(true)} className="flex-1 h-8 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">+ เพิ่ม Section</button>
        <button onClick={() => setShowAi(true)} title="ให้ AI ช่วยออกแบบ แล้ววาง JSON กลับมา" className={`${iconBtn} !border-violet-200 !bg-violet-50 !text-violet-700 hover:!bg-violet-100`}>🤖</button>
      </div>

      <ul className={`flex-1 overflow-y-auto pr-0.5 ${drag && drag.kind !== "child" ? "space-y-0" : "space-y-0.5"}`}>
        {blocks.map((b, i) => {
          const info = types.find((t) => t.type === b.type);
          const schema = SECTION_SCHEMAS[b.type];
          const c = childrenOf(b);
          const isSel = selection?.blockId === b.id && !selection.childId;
          const isOpen = expanded.has(b.id);
          const hasIssue = errors.some((x) => x.blockId === b.id);
          return (
            <Fragment key={b.id}>
              {dropLine(i)}
              <li
                id={`blk-${b.id}`}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", `website-move:${b.id}`); e.dataTransfer.effectAllowed = "move"; setDrag({ kind: "move", id: b.id }); }}
                onDragEnd={endDrag}
                onDragOver={(e) => overBlock(e, i)}
                onDrop={(e) => { if (drag?.kind === "child") return; e.preventDefault(); dropAt(overIdx ?? i); }}
                onContextMenu={(e) => { e.preventDefault(); onSelect({ blockId: b.id }); setMenu({ id: b.id, x: e.clientX, y: e.clientY }); }}
                className={`rounded-lg transition ${drag?.kind === "move" && drag.id === b.id ? "opacity-40" : ""}`}
              >
                <div
                  onClick={() => { onSelect({ blockId: b.id }); setPropTab("content"); setPane("props"); }}
                  className={`group flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 cursor-pointer ${isSel ? "bg-blue-50 ring-1 ring-blue-200" : selection?.blockId === b.id ? "bg-blue-50/40" : "hover:bg-slate-50"}`}
                >
                  <span className="cursor-grab text-slate-300 select-none text-xs" title="ลากเพื่อย้าย">⠿</span>
                  {c ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpanded((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; }); }}
                      className="w-3.5 text-[9px] text-slate-400 hover:text-slate-800"
                      title={isOpen ? "พับ" : `ดู${c.spec.label}`}
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                  ) : (
                    <span className="w-3.5" />
                  )}
                  <span className="text-sm leading-none">{info?.icon ?? "🧩"}</span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-xs truncate ${b.enabled ? "text-slate-800" : "text-slate-400 line-through"} ${isSel ? "font-medium" : ""}`}>{info?.label ?? b.type}</span>
                    <span className="block text-[10px] text-slate-400 truncate">
                      {schema ? blockSummary(b) : "บล็อกของระบบเดิม"}
                      {c && !isOpen && ` · ${c.spec.itemLabel} ${c.list.length}`}
                      {visibilityLabel(b.visibility) && ` · ${visibilityLabel(b.visibility)}`}
                    </span>
                  </span>
                  {hasIssue && <span className="text-[10px] text-red-500" title="มีจุดที่ควรแก้">●</span>}
                  <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); patchBlock(b.id, { enabled: !b.enabled }); }} title={b.enabled ? "ซ่อน" : "แสดง"} className={miniBtn}>{b.enabled ? "👁️" : "🚫"}</button>
                    <button onClick={(e) => { e.stopPropagation(); duplicateSection(b.id); }} title="ทำสำเนา (Ctrl+D)" className={miniBtn}>📑</button>
                    <button onClick={(e) => { e.stopPropagation(); onSelect({ blockId: b.id }); setMenu({ id: b.id, x: e.clientX, y: e.clientY }); }} title="เพิ่มเติม" className={miniBtn}>⋯</button>
                  </span>
                  <span className={`group-hover:hidden w-1.5 h-1.5 rounded-full shrink-0 ${b.enabled ? "bg-emerald-500" : "bg-slate-300"}`} title={b.enabled ? "แสดงอยู่" : "ซ่อนอยู่"} />
                </div>

                {c && isOpen && (
                  <ul className="pb-1 space-y-0.5" onDragOver={(e) => { if (drag?.kind === "child" && drag.blockId === b.id) e.preventDefault(); }}>
                    {c.list.map((it, idx) => childRow(b, c, it, idx))}
                    {drag?.kind === "child" && drag.blockId === b.id && childOver?.blockId === b.id && childOver.idx === c.list.length && <li className="h-1 rounded bg-blue-500 ml-7 mr-1" />}
                    <li
                      className="ml-7"
                      onDragOver={(e) => { if (drag?.kind === "child" && drag.blockId === b.id) { e.preventDefault(); setChildOver({ blockId: b.id, idx: c.list.length }); } }}
                      onDrop={(e) => { if (drag?.kind !== "child") return; e.preventDefault(); moveChildTo(b.id, drag.childId, c.list.length); endDrag(); }}
                    >
                      <button onClick={() => addChild(b.id)} disabled={c.list.length >= c.spec.max} className="text-[10px] text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline">
                        + เพิ่ม{c.spec.itemLabel} ({c.list.length}/{c.spec.max})
                      </button>
                    </li>
                  </ul>
                )}
              </li>
            </Fragment>
          );
        })}
        {dropLine(blocks.length)}
        {!blocks.length && (
          <li
            onDragOver={(e) => { if (drag && drag.kind !== "child") { e.preventDefault(); setOverIdx(0); } }}
            onDrop={(e) => { e.preventDefault(); dropAt(0); }}
            className={`rounded-xl border-2 border-dashed py-10 text-center text-xs transition ${drag ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-300 text-slate-400"}`}
          >
            {drag ? "วางตรงนี้เพื่อเริ่มจัดหน้า" : 'ยังไม่มี Section — กด "+ เพิ่ม Section"'}
          </li>
        )}
      </ul>
      <p className="mt-1 text-[10px] text-slate-400 leading-snug">ลากเรียง · คลิกขวาเปิดเมนู · Delete ลบ · Ctrl+D สำเนา</p>

      {/* คลัง Section — เลื่อนออกมาทับแผงซ้าย */}
      {showLib && (
        <div className="absolute inset-0 z-20 rounded-xl border border-blue-200 bg-white shadow-xl flex flex-col p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <input className="flex-1 min-w-0 h-8 rounded-lg border border-slate-200 px-2.5 text-xs" value={libQuery} onChange={(e) => setLibQuery(e.target.value)} placeholder="ค้นหา เช่น รูป สินค้า คำถาม" autoFocus />
            <button onClick={() => { setShowLib(false); setLibQuery(""); }} className={iconBtn} title="ปิด (Esc)">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
            {grouped.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">ไม่พบ Section ที่ค้นหา</p>
            ) : (
              grouped.map(([group, list]) => (
                <div key={group}>
                  <p className="text-[10px] font-medium text-slate-500 mb-1">{group}</p>
                  <div className="grid gap-1">
                    {list.map((t) => (
                      <button
                        key={t.type}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", `website-new:${t.type}`); e.dataTransfer.effectAllowed = "copyMove"; setDrag({ kind: "new", type: t.type }); }}
                        onDragEnd={endDrag}
                        onClick={() => addSection(t.type)}
                        title={`${t.label} — ${t.hint}\nกดเพื่อเพิ่มต่อท้าย หรือลากไปวางในพรีวิว`}
                        className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left cursor-grab active:cursor-grabbing hover:border-blue-400 hover:bg-blue-50/40 ${drag?.kind === "new" && drag.type === t.type ? "border-blue-500 opacity-50" : "border-slate-200"}`}
                      >
                        <span className="text-base leading-none">{t.icon}</span>
                        <span className="min-w-0">
                          <span className="block text-xs text-slate-800">{t.label}</span>
                          <span className="block text-[10px] text-slate-400 truncate">{t.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="mt-2 text-[10px] text-slate-400 leading-snug">กด = เพิ่มต่อท้าย · ลากไปวางในพรีวิวได้</p>
        </div>
      )}
    </div>
  );

  /* ── เมนูคลิกขวา ── */
  const menuBlock = menu ? blocks.find((x) => x.id === menu.id) ?? null : null;
  const menuIdx = menuBlock ? blocks.findIndex((x) => x.id === menuBlock.id) : -1;
  const menuItem = "w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-30 flex items-center gap-2";
  const contextMenu = menu && menuBlock && (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
      <div className="fixed z-50 w-52 rounded-xl border border-slate-200 bg-white shadow-lg py-1" style={{ left: Math.max(4, Math.min(menu.x, window.innerWidth - 220)), top: Math.max(4, Math.min(menu.y, window.innerHeight - 330)) }}>
        <button className={menuItem} onClick={() => { duplicateSection(menuBlock.id); setMenu(null); }}>📑 ทำสำเนา <span className="ml-auto text-slate-400">Ctrl+D</span></button>
        <button className={menuItem} onClick={() => { patchBlock(menuBlock.id, { enabled: !menuBlock.enabled }); setMenu(null); }}>{menuBlock.enabled ? "🚫 ซ่อน Section" : "👁️ แสดง Section"}</button>
        <button className={menuItem} disabled={menuIdx <= 0} onClick={() => { moveSection(menuBlock.id, -1); setMenu(null); }}>▲ เลื่อนขึ้น</button>
        <button className={menuItem} disabled={menuIdx >= blocks.length - 1} onClick={() => { moveSection(menuBlock.id, 1); setMenu(null); }}>▼ เลื่อนลง</button>
        <div className="border-t border-slate-100 my-1" />
        <p className="px-3 py-0.5 text-[10px] text-slate-400">แสดงบนอุปกรณ์</p>
        {DEVICE_OPTS.map((d) => (
          <label key={d.k} className="flex items-center gap-2 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={{ ...ALL_VISIBLE, ...menuBlock.visibility }[d.k]} onChange={(e) => setVis(menuBlock.id, d.k, e.target.checked)} />
            {d.l}
          </label>
        ))}
        <div className="border-t border-slate-100 my-1" />
        <button className={`${menuItem} !text-red-600 hover:!bg-red-50`} onClick={() => { setMenu(null); removeSection(menuBlock.id); }}>🗑️ ลบ Section <span className="ml-auto text-red-300">Delete</span></button>
      </div>
    </>
  );

  /* ── แผงขวา: คุณสมบัติ ── */
  const styleOf = (b: Block): BlockStyle => ({ ...DEFAULT_BLOCK_STYLE, ...((b.style as Partial<BlockStyle>) ?? {}) });
  const styleTouched = (st: BlockStyle) => JSON.stringify({ ...st, motion: undefined }) !== JSON.stringify({ ...DEFAULT_BLOCK_STYLE, motion: undefined });
  const motionTouched = (st: BlockStyle) => JSON.stringify({ ...DEFAULT_MOTION, ...(st.motion ?? {}) }) !== JSON.stringify(DEFAULT_MOTION);
  const tabBtn = (k: PropTab, l: string, dot?: boolean) => (
    <button onClick={() => setPropTab(k)} className={`flex-1 py-2 text-xs border-b-2 -mb-px ${propTab === k ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
      {l}
      {dot && <span className="ml-1 text-[8px] text-blue-500 align-middle" title="ปรับแล้ว">●</span>}
    </button>
  );
  const visibilityRow = (v: Visibility | undefined, onChangeVis: (k: keyof Visibility, val: boolean) => void) => (
    <div className="pt-3 border-t border-slate-200">
      <p className="text-[11px] font-medium text-slate-500 mb-1.5">แสดงบนอุปกรณ์</p>
      <div className="flex flex-wrap gap-3">
        {DEVICE_OPTS.map((d) => (
          <label key={d.k} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={{ ...ALL_VISIBLE, ...v }[d.k]} onChange={(e) => onChangeVis(d.k, e.target.checked)} />
            {d.l}
          </label>
        ))}
      </div>
    </div>
  );

  const props = !selBlock ? (
    <div className="h-full flex flex-col items-center justify-center text-center text-sm text-slate-400 px-6 gap-1">
      <span className="text-3xl">👆</span>
      <p>เลือก Section ทางซ้าย หรือคลิกในพรีวิว</p>
      <p className="text-[11px]">ค่าต่าง ๆ ของสิ่งที่เลือกจะมาอยู่ตรงนี้</p>
    </div>
  ) : !selSchema ? (
    <div className="m-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-800">
      บล็อกชนิด <code>{selBlock.type}</code> เป็นของระบบเดิม แก้ในตัวจัดหน้านี้ไม่ได้ (ยังอยู่บนเว็บตามเดิม)
    </div>
  ) : selChild ? (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-slate-200">
        <button onClick={() => onSelect({ blockId: selBlock.id })} className="text-[11px] text-slate-500 hover:text-blue-600">← {selSchema.meta.icon} {selSchema.meta.label}</button>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-base">{selSchema.children!.icon}</span>
          <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">{selSchema.children!.itemLabel}: {selSchema.children!.summary(selChild) || "—"}</span>
          <button onClick={() => patchChild(selBlock.id, selChild.id, { enabled: selChild.enabled === false })} title={selChild.enabled === false ? "แสดง" : "ซ่อน"} className={iconBtn}>{selChild.enabled === false ? "🚫" : "👁️"}</button>
          <button onClick={() => duplicateChild(selBlock.id, selChild.id)} title="ทำสำเนา (Ctrl+D)" className={iconBtn}>📑</button>
          <button onClick={() => removeChild(selBlock.id, selChild.id)} title="ลบ (Delete)" className={`${iconBtn} hover:!border-red-300 hover:!text-red-600`}>🗑️</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <SchemaForm fields={selSchema.children!.fields} value={selChild} onChange={(p) => patchChild(selBlock.id, selChild.id, p)} ctx={ctx} />
        {visibilityRow(selChild.visibility, (k, val) => patchChild(selBlock.id, selChild.id, { visibility: { ...ALL_VISIBLE, ...selChild.visibility, [k]: val } }))}
      </div>
    </div>
  ) : (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-2.5 border-b border-slate-200">
        <div className="flex items-center gap-1">
          <span className="text-base">{selSchema.meta.icon}</span>
          <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate" title={selSchema.meta.hint}>{selSchema.meta.label}</span>
          <button onClick={() => patchBlock(selBlock.id, { enabled: !selBlock.enabled })} title={selBlock.enabled ? "ซ่อน Section" : "แสดง Section"} className={iconBtn}>{selBlock.enabled ? "👁️" : "🚫"}</button>
          <button onClick={() => duplicateSection(selBlock.id)} title="ทำสำเนา (Ctrl+D)" className={iconBtn}>📑</button>
          <button onClick={() => removeSection(selBlock.id)} title="ลบ (Delete)" className={`${iconBtn} hover:!border-red-300 hover:!text-red-600`}>🗑️</button>
        </div>
        {!selBlock.enabled && <p className="mt-1 text-[11px] text-amber-600">Section นี้ซ่อนอยู่ — ไม่แสดงบนเว็บ</p>}
        <div className="flex mt-1.5">
          {tabBtn("content", "เนื้อหา")}
          {tabBtn("style", "รูปลักษณ์", styleTouched(styleOf(selBlock)))}
          {tabBtn("motion", "ลูกเล่น", motionTouched(styleOf(selBlock)))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {propTab === "content" && (
          <div className="space-y-4">
            <SchemaForm fields={selSchema.fields} value={selBlock} onChange={(p) => patchBlock(selBlock.id, p)} ctx={ctx} />
            {selSchema.children && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-500">
                {selSchema.children.icon} {selSchema.children.label}: {childrenOf(selBlock)?.list.length ?? 0} รายการ — แก้ทีละชิ้นจากต้นไม้ทางซ้าย (กด ▸)
                <button onClick={() => addChild(selBlock.id)} className="ml-2 text-blue-600 hover:underline">+ เพิ่ม{selSchema.children.itemLabel}</button>
              </div>
            )}
          </div>
        )}
        {propTab === "style" && (
          <div className="space-y-4">
            <StylePanel value={styleOf(selBlock)} onChange={(style) => patchBlock(selBlock.id, { style })} mode="style" />
            {visibilityRow(selBlock.visibility, (k, val) => setVis(selBlock.id, k, val))}
          </div>
        )}
        {propTab === "motion" && <StylePanel value={styleOf(selBlock)} onChange={(style) => patchBlock(selBlock.id, { style })} mode="motion" />}
      </div>
    </div>
  );

  const paneBtn = (k: Pane, l: string) => (
    <button onClick={() => setPane(k)} className={`flex-1 py-1.5 text-xs rounded-lg ${pane === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{l}</button>
  );

  return (
    <>
      <div className="space-y-2">
        {topbar}
        {/* จอแคบ: สลับแผง */}
        <div className="lg:hidden flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {paneBtn("tree", "โครง")}
          {paneBtn("preview", "พรีวิว")}
          {paneBtn("props", "ตั้งค่า")}
        </div>
        <div className="grid gap-2 lg:grid-cols-[230px_minmax(0,1fr)_330px] items-stretch">
          <aside className={`${pane === "tree" ? "" : "hidden"} lg:block min-w-0 rounded-xl border border-slate-200 bg-white p-2`} style={{ height: previewHeight }}>{tree}</aside>
          <div className={`${pane === "preview" ? "" : "hidden"} lg:block min-w-0`}>{previewFrame(previewHeight)}</div>
          <aside className={`${pane === "props" ? "" : "hidden"} lg:block min-w-0 rounded-xl border border-slate-200 bg-white overflow-hidden`} style={{ height: previewHeight }}>{props}</aside>
        </div>
      </div>

      {contextMenu}

      <ERPModal open={showAi} onClose={() => setShowAi(false)} title="🤖 ให้ AI ช่วยออกแบบ Section" size="lg">
        <div className="space-y-4 text-sm">
          <ol className="list-decimal pl-5 text-slate-600 space-y-1 text-xs">
            <li>บอกโจทย์สั้น ๆ (ไม่บังคับ) แล้วกด &quot;คัดลอกคำสั่ง&quot;</li>
            <li>ไปวางใน ChatGPT / Claude / Gemini แล้วรอคำตอบ</li>
            <li>ก๊อปคำตอบ (JSON) มาวางในช่องล่าง กด &quot;เพิ่มลงหน้า&quot; — ทุกช่องแก้ต่อได้ในแผงขวา</li>
          </ol>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">โจทย์ที่อยากได้ (ไม่บังคับ)</label>
            <input className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" value={aiBrief} onChange={(e) => setAiBrief(e.target.value)} placeholder="เช่น หน้าแรกร้านกระเป๋าหนัง เน้นงานไทย โทนหรู มี FAQ และรีวิว" />
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-slate-500">คำสั่งสำหรับ AI (สร้างจากรายการ Section ที่ระบบรู้จัก)</span>
              <button onClick={() => void copyPrompt()} className="px-3 py-1 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700">{copied ? "✓ คัดลอกแล้ว" : "คัดลอกคำสั่ง"}</button>
            </div>
            <textarea readOnly className="w-full h-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-600" value={aiPrompt} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">วาง JSON ที่ AI ตอบกลับมา</label>
            <textarea className="w-full h-36 rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs" value={aiJson} onChange={(e) => setAiJson(e.target.value)} placeholder='[ { "type": "hero", ... } ]' spellCheck={false} />
            {aiError && <p className="mt-1 text-xs text-red-600">{aiError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAi(false)} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100">ปิด</button>
            <button onClick={importAiJson} disabled={!aiJson.trim()} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40">เพิ่มลงหน้า</button>
          </div>
        </div>
      </ERPModal>

      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm p-4 flex flex-col gap-3">
          <div className="bg-white rounded-xl px-4 py-2 flex items-center gap-1.5">
            {DEVICES.map((d) => (
              <button key={d.k} onClick={() => setDevice(d.k)} className={`${iconBtn} ${device === d.k ? "!bg-slate-900 !text-white !border-slate-900" : ""}`}>{d.icon}</button>
            ))}
            <button onClick={reloadPreview} className={iconBtn} title="โหลดใหม่">↻</button>
            <span className="flex-1" />
            <button onClick={() => setFullscreen(false)} className={iconBtn} title="ออกจากเต็มจอ (Esc)">✕</button>
          </div>
          <div className="flex-1 min-h-0">{previewFrame("100%")}</div>
        </div>
      )}
    </>
  );
}
