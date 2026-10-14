"use client";

/**
 * ป๊อปอัป "แก้ผืนผ้าใบ" แบบเต็มจอ (ของกลาง — เปิดจากตัวจัดหน้า: ปุ่ม ✏️ หรือดับเบิลคลิกผืนในพรีวิว)
 *
 *   ซ้าย  = เพิ่มชิ้น: รูป (อัปโหลด/คลัง/รูปสินค้า) · ข้อความสำเร็จรูป · ปุ่มสำเร็จรูป · คลังของตกแต่ง · ชั้น
 *   กลาง  = ผืนใหญ่ของเว็บร้านจริง (iframe /canvas-edit?preview=1&block=<id>) — ลาก/ย่อ/หมุน + แถบเครื่องมือลอยเหนือชิ้น
 *   ขวา   = แผงตั้งค่าแบบภาพของชิ้นที่เลือก (components/website-canvas-inspector.tsx)
 *
 * ข้อมูล/ย้อนกลับ/บันทึกร่างอัตโนมัติ ใช้ของตัวจัดหน้าเดิมทั้งหมด (ส่งฟังก์ชันมาทาง props) — ป๊อปอัปนี้ไม่เก็บข้อมูลเอง
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { ERPModal } from "@/components/modal";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { CanvasInspector, type ThemeColors } from "@/components/website-canvas-inspector";
import { ImageChooser, DecorLibrary, type PickedImage } from "@/components/website-canvas-media";
import { useCanvasBridge, reorderLayer } from "@/components/website-canvas-tools";
import { SECTION_SCHEMAS, blankChild, newChildId } from "@/lib/website-schema";
import { CANVAS_BUTTON_PRESETS, CANVAS_TEXT_PRESETS, CANVAS_WIDTH, canvasItemPreset, canvasItemSummary, fitImageBox, type CanvasKind } from "@/lib/website-canvas";
import type { SchemaFormContext } from "@/components/website-schema-form";
import type { Block, ChildBlock } from "@/components/website-block-editor";
import type { Selection } from "@/components/website-builder";

/** เปิดป๊อปอัปพร้อมคำสั่งแรก (เช่น กด "รูป" ในแผงตัวจัดหน้า → เปิดมาที่หน้าต่างเลือกรูปเลย) */
export interface CanvasEditorTarget {
  blockId: string;
  action?: "add-image" | "add-text" | "add-button" | "add-shape" | "replace-image" | "link" | string;
  childId?: string | null;
}

const DEFAULT_THEME: ThemeColors = { brand: "#b76e79", brandDeep: "#9d4e5a", ink: "#141517", muted: "#9ba1a9", page: "#fafaf9", surface: "#ffffff" };

/** ฟอนต์ตัวอย่างในแผง (Google Fonts) */
const PREVIEW_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Parisienne&family=Great+Vibes&family=Cormorant+Garamond:wght@500&family=Playfair+Display:wght@500&family=Trirong:wght@400;500&family=Charm&family=Mali:wght@500&family=Itim&family=Kanit:wght@400;500&family=Prompt:wght@400;500&display=swap";

const DEVICE_W = { desktop: 1280, mobile: 390 } as const;
const WIDE_SHAPES = ["pearls", "scallop", "wave", "line"];

type Panel = null | "text" | "button" | "layers";

export function CanvasEditor({
  target,
  onClose,
  blocks,
  blocksRef,
  previewOrigin,
  ctx,
  selection,
  onSelect,
  patchBlock,
  patchChild,
  insertChild,
  removeChild,
  duplicateChild,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  target: CanvasEditorTarget;
  onClose: () => void;
  blocks: Block[];
  blocksRef: MutableRefObject<Block[]>;
  /** origin ของเว็บร้าน (เช่น https://pixiedustie-store.vercel.app) */
  previewOrigin: string;
  ctx: SchemaFormContext;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  patchBlock: (id: string, p: Record<string, unknown>) => void;
  patchChild: (blockId: string, childId: string, p: Record<string, unknown>) => void;
  insertChild: (blockId: string, item: ChildBlock) => void;
  removeChild: (blockId: string, childId: string) => void;
  duplicateChild: (blockId: string, childId: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}) {
  const blockId = target.blockId;
  const block = blocks.find((b) => b.id === blockId && b.type === "canvas") ?? null;
  const items = useMemo(() => ((block?.items as ChildBlock[] | undefined) ?? []), [block]);
  const selItem = selection?.blockId === blockId && selection.childId ? items.find((it) => it.id === selection.childId) ?? null : null;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 900, h: 600 });
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [panel, setPanel] = useState<Panel>(null);
  const [chooser, setChooser] = useState<null | { mode: "add" | "replace" | "bg"; childId?: string }>(null);
  const [decorOpen, setDecorOpen] = useState(false);
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeColors>(DEFAULT_THEME);
  const [fontNames, setFontNames] = useState({ display: "Kanit", body: "Noto Sans Thai" });

  // สีธีม/ฟอนต์ของร้าน (API สาธารณะ — ใช้วาดจุดสี/ตัวอย่างฟอนต์ให้ตรงเว็บจริง)
  useEffect(() => {
    let alive = true;
    fetch(`/api/public/storefront/site?shop=${encodeURIComponent(ctx.shopSlug)}&preview=1`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.theme) return;
        const c = j.theme.colors ?? {};
        setTheme({ ...DEFAULT_THEME, ...c });
        if (j.theme.fonts) setFontNames({ display: j.theme.fonts.display || "Kanit", body: j.theme.fonts.body || "Noto Sans Thai" });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ctx.shopSlug]);

  // ฟอนต์ตัวอย่างในแผงขวา
  useEffect(() => {
    const id = "zz-canvas-fonts";
    if (document.getElementById(id)) return;
    const el = document.createElement("link");
    el.id = id;
    el.rel = "stylesheet";
    el.href = PREVIEW_FONTS_HREF;
    document.head.appendChild(el);
  }, []);

  // ขนาดกล่องกลาง → ย่อพรีวิวให้พอดี
  useEffect(() => {
    const el = centerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const post = (msg: Record<string, unknown>) => iframeRef.current?.contentWindow?.postMessage(msg, "*");

  /* ── คุยกับพรีวิวในป๊อปอัป ── */
  useCanvasBridge({
    blocks,
    blocksRef,
    iframeRef,
    patchBlock,
    removeChild,
    duplicateChild,
    onUndo,
    onRedo,
    onAction: (bid, childId, action) => {
      if (bid !== blockId) return;
      onSelect({ blockId: bid, childId });
      if (action === "replace-image") setChooser({ mode: "replace", childId });
      else if (action === "link") setLinkFor(childId);
    },
  });

  // พรีวิวย่ออยู่เท่าไร → บอกเว็บร้านให้ขยายแถบเครื่องมือ/จุดจับกลับ (อ่านง่ายเท่าเดิม)
  const scaleRef = useRef(1);
  const selRef = useRef(selection);
  selRef.current = selection;
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if ((e.data as { type?: string } | null)?.type !== "storefront-preview-loaded") return;
      post({ type: "storefront-edit-mode", on: true });
      post({ type: "storefront-ui-scale", scale: scaleRef.current });
      const s = selRef.current;
      post({ type: "storefront-select-block", blockId, childId: s?.blockId === blockId ? (s.childId ?? null) : null });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId]);

  useEffect(() => {
    post({ type: "storefront-select-block", blockId, childId: selection?.blockId === blockId ? (selection.childId ?? null) : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, blockId]);

  /* ── เพิ่มชิ้น ── */
  const addItem = useCallback(
    (kind: CanvasKind, patch: Record<string, unknown>) => {
      const b = blocksRef.current.find((x) => x.id === blockId);
      const spec = SECTION_SCHEMAS.canvas.children!;
      if (!b) return;
      const list = (b.items as ChildBlock[] | undefined) ?? [];
      if (list.length >= spec.max) return;
      const base = { ...canvasItemPreset(kind, list.length), ...patch };
      const item: ChildBlock = { id: newChildId(spec.key), enabled: true, ...blankChild({ ...spec, blank: () => base }) };
      const w = Number(item.w) || 300;
      const h = Number(item.h) || 80;
      const height = Number(b.height) || 560;
      // วางกลางผืน เหลื่อมลงทีละนิดตามจำนวนชิ้น จะได้ไม่ทับกันสนิท
      item.x = Math.round((CANVAS_WIDTH - w) / 2);
      item.y = Math.max(0, Math.min(height - Math.min(h, height), 60 + (list.length % 6) * 36));
      insertChild(blockId, item);
    },
    [blockId, blocksRef, insertChild]
  );

  const addImage = (img: PickedImage, sticker = false) => {
    const { w, h } = sticker ? fitImageBox(img.w, img.h, 160, 160) : fitImageBox(img.w, img.h);
    addItem("image", {
      imageKey: img.key,
      alt: img.title?.slice(0, 200) ?? "",
      w,
      h,
      ...(sticker ? { fit: "contain", frame: "rect", border: "none", hideMobile: true } : {}),
    });
  };

  const onPicked = (img: PickedImage) => {
    if (!chooser) return;
    if (chooser.mode === "bg") patchBlock(blockId, { bgImageKey: img.key });
    else if (chooser.mode === "replace" && chooser.childId) {
      const it = items.find((x) => x.id === chooser.childId);
      const w = Number(it?.w) || 300;
      // เปลี่ยนรูป: คงความกว้างไว้ ปรับความสูงตามสัดส่วนรูปใหม่ (ไม่บีบ/ยืด)
      patchChild(blockId, chooser.childId, { imageKey: img.key, h: Math.max(40, Math.round((w * img.h) / Math.max(1, img.w))), ...(img.title && !it?.alt ? { alt: img.title.slice(0, 200) } : {}) });
    } else addImage(img);
  };

  useEffect(() => {
    const k = Math.max(0.2, Math.min(1, (box.w - 24) / DEVICE_W[device]));
    post({ type: "storefront-ui-scale", scale: k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.w, device]);

  // คำสั่งแรกตอนเปิด (มาจากปุ่มในแผงตัวจัดหน้า หรือแถบเครื่องมือลอยในพรีวิวเล็ก)
  const ranAction = useRef(false);
  useEffect(() => {
    if (ranAction.current) return;
    ranAction.current = true;
    const a = target.action;
    if (a === "add-image") setChooser({ mode: "add" });
    else if (a === "add-text") setPanel("text");
    else if (a === "add-button") setPanel("button");
    else if (a === "add-shape") setDecorOpen(true);
    else if (a === "replace-image" && target.childId) setChooser({ mode: "replace", childId: target.childId });
    else if (a === "link" && target.childId) setLinkFor(target.childId);
  }, [target]);

  if (!block) return null;

  const base = DEVICE_W[device];
  const scale = Math.max(0.2, Math.min(1, (box.w - 24) / base));
  scaleRef.current = scale;
  const linkItem = linkFor ? items.find((x) => x.id === linkFor) ?? null : null;

  const railBtn = (icon: string, label: string, onClick: () => void, on = false) => (
    <button onClick={onClick} className={`w-full flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] border ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-transparent text-slate-600 hover:bg-slate-100"}`}>
      <span className="text-xl leading-none">{icon}</span>
      {label}
    </button>
  );

  return (
    <>
      <ERPModal open onClose={onClose} title="🎨 แก้ผืนผ้าใบ" size="xl" defaultExpanded resizable={false}>
        <div className="-mx-5 -my-4 flex flex-col bg-slate-50" style={{ height: "calc(100% + 2rem)" }}>
          {/* แถบบน */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-200 bg-white">
            <button onClick={onUndo} disabled={!canUndo} title="ย้อนกลับ (Ctrl+Z)" className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40">↶</button>
            <button onClick={onRedo} disabled={!canRedo} title="ทำซ้ำ (Ctrl+Shift+Z)" className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40">↷</button>
            <span className="w-px h-5 bg-slate-200 mx-1" />
            <button onClick={() => setDevice("desktop")} className={`h-8 px-3 rounded-lg border text-xs ${device === "desktop" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"}`}>🖥️ คอม</button>
            <button onClick={() => setDevice("mobile")} className={`h-8 px-3 rounded-lg border text-xs ${device === "mobile" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"}`}>📲 มือถือ</button>
            <span className="hidden md:inline text-[11px] text-slate-400 ml-2">
              {device === "mobile" ? "มือถือเรียงชิ้นลงมาให้อัตโนมัติ (ดูอย่างเดียว · จัดในโหมดคอม)" : "ลากย้าย · จับมุมย่อ-ขยาย · จุดกลมด้านบน = หมุน · ดับเบิลคลิกข้อความเพื่อพิมพ์ · บันทึกร่างอัตโนมัติ"}
            </span>
            <span className="flex-1" />
            <button onClick={onClose} className="h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">เสร็จ</button>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-[84px_minmax(0,1fr)_300px]">
            {/* ซ้าย: เพิ่มชิ้น */}
            <div className="relative border-r border-slate-200 bg-white p-1.5 space-y-1">
              {railBtn("🖼️", "รูป", () => setChooser({ mode: "add" }))}
              {railBtn("🔤", "ข้อความ", () => setPanel((p) => (p === "text" ? null : "text")), panel === "text")}
              {railBtn("🔘", "ปุ่ม", () => setPanel((p) => (p === "button" ? null : "button")), panel === "button")}
              {railBtn("🎀", "ตกแต่ง", () => setDecorOpen(true))}
              <div className="h-px bg-slate-200 my-1" />
              {railBtn("🗂️", "ชั้น", () => setPanel((p) => (p === "layers" ? null : "layers")), panel === "layers")}

              {panel && (
                <div className="absolute left-full top-1.5 z-20 ml-1.5 w-64 rounded-xl border border-slate-200 bg-white shadow-xl p-2.5">
                  <div className="flex items-center mb-2">
                    <p className="flex-1 text-xs font-semibold text-slate-700">{panel === "text" ? "เพิ่มข้อความ" : panel === "button" ? "เพิ่มปุ่ม" : "ชั้น (บน = อยู่หน้าสุด)"}</p>
                    <button onClick={() => setPanel(null)} className="text-slate-400 hover:text-slate-700 text-sm">✕</button>
                  </div>
                  {panel === "text" &&
                    CANVAS_TEXT_PRESETS.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => {
                          addItem("text", p.patch);
                          setPanel(null);
                        }}
                        className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 mb-1.5 hover:border-blue-500"
                      >
                        <span
                          className="block truncate text-slate-800"
                          style={{
                            fontFamily: `"${p.patch.font === "display" ? fontNames.display : p.patch.font === "body" ? fontNames.body : String(p.patch.font)}", sans-serif`,
                            fontSize: Math.min(26, Number(p.patch.size) || 16),
                            textTransform: p.patch.uppercase ? "uppercase" : undefined,
                            letterSpacing: p.patch.spacing ? "0.2em" : undefined,
                          }}
                        >
                          {p.sample}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">{p.label}</span>
                      </button>
                    ))}
                  {panel === "button" &&
                    CANVAS_BUTTON_PRESETS.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => {
                          addItem("button", p.patch);
                          setPanel(null);
                        }}
                        className="w-full flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 mb-1.5 hover:border-blue-500"
                      >
                        <span
                          className="text-xs px-3 py-1.5"
                          style={
                            p.patch.variant === "brand"
                              ? { background: theme.brand, color: "#fff", borderRadius: 99 }
                              : p.patch.variant === "outline"
                                ? { border: `1px solid ${theme.ink}`, color: theme.ink, borderRadius: 99 }
                                : { color: theme.brandDeep, textDecoration: "underline" }
                          }
                        >
                          {String(p.patch.label)}
                        </span>
                        <span className="text-[10px] text-slate-400">{p.label}</span>
                      </button>
                    ))}
                  {panel === "layers" && (
                    <div className="max-h-[55vh] overflow-y-auto space-y-1">
                      {[...items].reverse().map((it) => {
                        const idx = items.findIndex((x) => x.id === it.id);
                        const on = selItem?.id === it.id;
                        return (
                          <div key={it.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${on ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                            <button onClick={() => onSelect({ blockId, childId: it.id })} className="flex-1 min-w-0 text-left text-xs text-slate-700 truncate">
                              {canvasItemSummary(it)}
                            </button>
                            <button title="ขึ้นหน้า" disabled={idx === items.length - 1} onClick={() => patchBlock(blockId, { items: reorderLayer(items, it.id, "up") })} className="text-xs text-slate-400 hover:text-slate-800 disabled:opacity-30">↑</button>
                            <button title="ลงหลัง" disabled={idx === 0} onClick={() => patchBlock(blockId, { items: reorderLayer(items, it.id, "down") })} className="text-xs text-slate-400 hover:text-slate-800 disabled:opacity-30">↓</button>
                            <button title={it.locked ? "ปลดล็อก" : "ล็อก"} onClick={() => patchChild(blockId, it.id, { locked: !it.locked })} className="text-xs">{it.locked ? "🔒" : "🔓"}</button>
                          </div>
                        );
                      })}
                      {!items.length && <p className="text-xs text-slate-400 py-2">ยังไม่มีชิ้นบนผืน</p>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* กลาง: ผืนจริง */}
            <div ref={centerRef} className="relative min-w-0 overflow-hidden" onClick={() => setPanel(null)}>
              <div className="mx-auto mt-3" style={{ width: base * scale, height: box.h - 24, overflow: "hidden" }}>
                <iframe
                  ref={iframeRef}
                  title="แก้ผืนผ้าใบ"
                  src={`${previewOrigin}/canvas-edit?preview=1&block=${encodeURIComponent(blockId)}`}
                  className="border-0 bg-white rounded-lg shadow-sm"
                  style={{ width: base, height: (box.h - 24) / scale, transform: `scale(${scale})`, transformOrigin: "top left", display: "block" }}
                />
              </div>
            </div>

            {/* ขวา: ตั้งค่า */}
            <div className="border-l border-slate-200 bg-white flex flex-col min-h-0">
              <div className="px-3 py-2.5 border-b border-slate-200 flex items-center gap-1">
                {selItem ? (
                  <>
                    <button onClick={() => onSelect({ blockId })} className="text-[11px] text-slate-500 hover:text-blue-600">← ทั้งผืน</button>
                    <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate ml-1">{canvasItemSummary(selItem)}</span>
                    <button title="ทำสำเนา" onClick={() => duplicateChild(blockId, selItem.id)} className="w-7 h-7 rounded-md border border-slate-200 text-xs">⧉</button>
                    <button title="ลบ" onClick={() => removeChild(blockId, selItem.id)} className="w-7 h-7 rounded-md border border-slate-200 text-xs text-red-600">🗑</button>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-slate-800">ตั้งค่า</span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <CanvasInspector
                  block={block}
                  item={selItem}
                  theme={theme}
                  fontNames={fontNames}
                  ctx={ctx}
                  onPatchItem={(p) => selItem && patchChild(blockId, selItem.id, p)}
                  onPatchBlock={(p) => patchBlock(blockId, p)}
                  onReplaceImage={() => selItem && setChooser({ mode: "replace", childId: selItem.id })}
                  onPickBgImage={() => setChooser({ mode: "bg" })}
                />
              </div>
            </div>
          </div>
        </div>
      </ERPModal>

      <ImageChooser
        open={!!chooser}
        onClose={() => setChooser(null)}
        shopSlug={ctx.shopSlug}
        title={chooser?.mode === "replace" ? "เปลี่ยนรูป" : chooser?.mode === "bg" ? "รูปพื้นหลังผืน" : "เพิ่มรูป"}
        onPick={onPicked}
      />
      <DecorLibrary
        open={decorOpen}
        onClose={() => setDecorOpen(false)}
        shopId={ctx.shopId}
        color={theme.brand}
        onPickShape={(shape) =>
          addItem("shape", {
            shape,
            color: "brand",
            hideMobile: true,
            ...(WIDE_SHAPES.includes(shape) ? { w: 320, h: shape === "scallop" ? 30 : 22 } : shape === "lace" ? { w: 300, h: 380, strokeWidth: 2 } : shape === "rect" || shape === "ellipse" ? { w: 220, h: 160, color: "brandSoft" } : {}),
          })
        }
        onPickSticker={(img) => addImage(img, true)}
      />
      <ERPModal open={!!linkItem} onClose={() => setLinkFor(null)} title="กดแล้วไปที่" size="md" defaultExpanded={false} resizable={false} footer={<button onClick={() => setLinkFor(null)} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm">เสร็จ</button>}>
        {linkItem && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{canvasItemSummary(linkItem)}</p>
            <LinkTargetPicker value={String(linkItem.href ?? "")} onChange={(href) => patchChild(blockId, linkItem.id, { href })} ctx={ctx} />
            {Boolean(linkItem.href) && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" className="accent-blue-600" checked={linkItem.newTab === true} onChange={(e) => patchChild(blockId, linkItem.id, { newTab: e.target.checked })} /> เปิดในแท็บใหม่
              </label>
            )}
          </div>
        )}
      </ERPModal>
    </>
  );
}
