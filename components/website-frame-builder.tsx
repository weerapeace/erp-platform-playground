"use client";

/**
 * 🖼 ตัวสร้างกรอบเอง (คลังกรอบของร้าน) — เปิดจากแผงขวาของผืนผ้าใบ (ชิ้นรูป → กรอบรูป → ＋ สร้างกรอบเอง)
 *
 * 3 แบบ:
 *   ประกอบเอง     = ทรงที่มี (วงรี/โค้งประตู/หัวใจ/…) + เส้นขอบ (เส้น/จุด/เส้นคู่) สี หนา ห่างจากรูป
 *   อัปทรงตัดรูป   = SVG (แปลงเป็นเส้นทาง · มีเส้นขอบได้) หรือ PNG พื้นใส (ส่วนทึบ = เห็นรูป · ไม่มีเส้นขอบ)
 *   อัปกรอบวางทับ = PNG ตรงกลางใสวางทับรูป (คลังกรอบรูปของร้าน DecorLibrary) + รูปห่างขอบกรอบ
 * บันทึก = /api/website/frames (ทุกร้าน / เฉพาะร้านนี้) · ใช้กับรูป = คัดลอกค่า (lib/website-frames frameDefCanvasPatch)
 * ของกลาง: ERPModal · RangeInput · ColorInput · DecorLibrary · uploadToLibrary · svgTextToFrameShape · useFileDrop
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { RangeInput } from "@/components/range-input";
import { ColorInput } from "@/components/color-picker";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { DecorLibrary, uploadToLibrary } from "@/components/website-canvas-media";
import { apiFetch } from "@/lib/api";
import { CANVAS_COLORS, CANVAS_FRAME_PATHS, canvasFrameMask } from "@/lib/website-canvas";
import { svgTextToFrameShape } from "@/lib/svg-frame-import";
import {
  DEFAULT_FRAME_DEF,
  builtinFrameShape,
  frameDefCanBorder,
  frameDefCanvasPatch,
  frameShapeMaskCss,
  normalizeFrameDef,
  type FrameDef,
  type FrameMode,
  type FrameShape,
  type SavedFrame,
} from "@/lib/website-frames";

const imgUrl = (key: string, w = 600) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;

/** ทรงที่ "ประกอบเอง" เลือกได้ (ทรงที่วาดเส้นขอบตามทรงได้) */
const BUILD_SHAPES: { v: string; l: string }[] = [
  { v: "rect", l: "เหลี่ยม" },
  { v: "rounded", l: "มุมมน" },
  { v: "ellipse", l: "วงรี" },
  { v: "arch", l: "โค้งประตู" },
  { v: "heart", l: "หัวใจ" },
  { v: "star", l: "ดาว" },
  { v: "hexagon", l: "หกเหลี่ยม" },
  { v: "cloud", l: "ก้อนเมฆ" },
  { v: "blob", l: "ทรงอิสระ" },
];
const BORDERS: { v: FrameDef["border"]; l: string }[] = [
  { v: "none", l: "ไม่มี" },
  { v: "line", l: "เส้น" },
  { v: "dotted", l: "จุดไข่ปลา" },
  { v: "double", l: "เส้นคู่" },
];
/** ทรงตัวอย่าง (ลองดูก่อนอัปไฟล์จริง) — วาดในกรอบ 0–100 */
const SAMPLE_SHAPES: { v: string; l: string; shape: FrameShape }[] = [
  { v: "bag", l: "ทรงกระเป๋า", shape: { vb: [0, 0, 100, 100], parts: [{ d: "M10 100L18 36H82L90 100Z M33 37V26A17 17 0 0 1 67 26V37H60V26A10 10 0 0 0 40 26V37Z", rule: "evenodd" }] } },
  { v: "letter", l: "ตัวอักษร L", shape: { vb: [0, 0, 100, 100], parts: [{ d: "M14 0H42V72H88V100H14Z" }] } },
  { v: "bow", l: "โบว์", shape: { vb: [0, 0, 100, 70], parts: [{ d: "M50 35C38 18 8 2 4 12 0 22 2 48 6 58 10 68 38 52 50 35Z M50 35C62 18 92 2 96 12 100 22 98 48 94 58 90 68 62 52 50 35Z M44 28H56V42H44Z" }] } },
];

export type FrameSwatch = { v: string; hex: string };
const colorOf = (sw: FrameSwatch[], v: string, hex: string) => (v === "custom" && hex ? hex : sw.find((s) => s.v === v)?.hex ?? "#b76e79");

/** ทรงของกรอบ (เส้นทาง) — ใช้วาดเส้นขอบตามทรง · ทรงที่วาดด้วยมุมโค้ง (เหลี่ยม/มุมมน/วงรี/โค้งประตู) = null (ใช้ขอบ CSS) */
function ringShapeOf(d: FrameDef): FrameShape | null {
  if (d.frame === "custom") return d.shape;
  const p = CANVAS_FRAME_PATHS[d.frame];
  return p ? builtinFrameShape(p) : null;
}

/**
 * 👁 พรีวิวกรอบ (ตัวอย่างในตัวสร้าง + ภาพย่อในแผงขวา) — วาดแบบเดียวกับเว็บร้าน (CanvasSection): ตัดรูปตามทรง · เส้นขอบตามทรง · กรอบวางทับ
 * k = px ต่อหน่วยของผืนผ้าใบ (ความหนา/ระยะห่างคูณ k)
 */
export function FramePreview({ def, imageKey, w, h, swatches, k = 0.5 }: { def: FrameDef; imageKey?: string | null; w: number; h: number; swatches: FrameSwatch[]; k?: number }) {
  const d = def;
  const color = colorOf(swatches, d.borderColor, d.borderHex);
  const line = d.border === "line" || d.border === "dotted" || d.border === "double";
  const ring = line && frameDefCanBorder(d) ? ringShapeOf(d) : null;
  const custom = d.frame === "custom";
  const mask = custom ? (d.shape ? frameShapeMaskCss(d.shape) : d.maskKey ? `url("${imgUrl(d.maskKey, 400)}")` : null) : canvasFrameMask(d.frame);
  const radius = d.frame === "ellipse" ? "50%" : d.frame === "arch" ? "9999px 9999px 0 0" : d.frame === "rounded" ? Math.min(w, h) * 0.08 : 0;
  const cssLine = line && !ring && !custom;
  const photoStyle: CSSProperties = {
    position: "absolute",
    inset: d.overlayKey ? `${d.overlayInset}%` : 0,
    borderRadius: mask ? 0 : radius,
    overflow: "hidden",
    ...(mask ? { WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: "100% 100%", maskSize: "100% 100%", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat" } : null),
    ...(cssLine
      ? { outline: `${(d.border === "double" ? Math.max(3, d.borderWidth * 2) : d.borderWidth) * k}px ${d.border === "line" ? "solid" : d.border} ${color}`, outlineOffset: d.borderGap * k }
      : null),
  };
  const ringSvg = (gap: number, key: string) =>
    ring && (
      <svg key={key} aria-hidden viewBox={ring.vb.join(" ")} preserveAspectRatio="none" style={{ position: "absolute", inset: -gap * k, width: `calc(100% + ${2 * gap * k}px)`, height: `calc(100% + ${2 * gap * k}px)`, overflow: "visible", pointerEvents: "none" }}>
        {ring.parts.map((p, i) => (
          <path
            key={i}
            d={p.d}
            transform={p.t}
            fillRule={p.rule}
            fill="none"
            stroke={color}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={(d.border === "dotted" ? Math.max(2, d.borderWidth * 1.6) : d.borderWidth) * k}
            strokeDasharray={d.border === "dotted" ? `0 ${Math.max(4, d.borderWidth * 3) * k}` : undefined}
          />
        ))}
      </svg>
    );
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <div style={photoStyle}>
        {imageKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl(imageKey, 500)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <SamplePhoto />
        )}
      </div>
      {ring && (d.border === "double" ? [ringSvg(d.borderGap, "a"), ringSvg(d.borderGap + Math.max(4, d.borderWidth * 3), "b")] : ringSvg(d.borderGap, "a"))}
      {d.overlayKey && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgUrl(d.overlayKey, 500)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }} />
      )}
    </div>
  );
}

/** รูปตัวอย่าง (ยังไม่มีรูปจริง) — ภาพวิวเรียบ ๆ */
function SamplePhoto() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }} aria-hidden>
      <rect width="100" height="100" fill="#F4C0D1" />
      <circle cx="74" cy="24" r="11" fill="#FAC775" />
      <path d="M0 78L30 50L52 70L72 54L100 80V100H0Z" fill="#ED93B1" />
      <path d="M0 88L40 66L100 92V100H0Z" fill="#D4537E" />
      <rect x="38" y="40" width="26" height="30" rx="4" fill="#72243E" />
    </svg>
  );
}

const chip = (on: boolean) => `px-2.5 py-1 rounded-lg border text-xs ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;
const Lbl = ({ children }: { children: ReactNode }) => <div className="text-[11px] font-semibold text-slate-500 mt-3 mb-1.5">{children}</div>;

export function FrameBuilder({
  open,
  onClose,
  shopId,
  swatches,
  imageKey,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  swatches: FrameSwatch[];
  /** รูปของชิ้นที่เลือกอยู่ (พรีวิวด้วยรูปจริง) */
  imageKey?: string | null;
  /** แก้กรอบเดิมในคลัง (ไม่ส่ง = สร้างใหม่) */
  editing?: SavedFrame | null;
  /** บันทึกแล้ว · apply = กด "บันทึก + ใช้กับรูปนี้" */
  onSaved: (frame: SavedFrame, apply: boolean) => void;
}) {
  const toast = useToast();
  const [def, setDef] = useState<FrameDef>(DEFAULT_FRAME_DEF);
  const [name, setName] = useState("");
  const [allShops, setAllShops] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [initial, setInitial] = useState("");

  useEffect(() => {
    if (!open) return;
    const d = editing ? normalizeFrameDef(editing.def) : DEFAULT_FRAME_DEF;
    setDef(d);
    setName(editing?.name ?? "");
    setAllShops(editing ? editing.shopId === null : true);
    setErr(null);
    setNote(null);
    setInitial(JSON.stringify({ d, n: editing?.name ?? "" }));
  }, [open, editing]);

  const set = (p: Partial<FrameDef>) => {
    setErr(null);
    setDef((d) => ({ ...d, ...p }));
  };
  const setMode = (mode: FrameMode) => {
    setErr(null);
    setNote(null);
    // แต่ละแบบเริ่มจากค่าที่สมเหตุสมผล (ไม่ทิ้งชื่อ)
    if (mode === "build") setDef({ ...DEFAULT_FRAME_DEF });
    else if (mode === "mask") setDef({ ...DEFAULT_FRAME_DEF, mode, frame: "custom", shape: SAMPLE_SHAPES[0].shape, border: "line", borderWidth: 2, borderGap: 8 });
    else setDef({ ...DEFAULT_FRAME_DEF, mode, frame: "rect", border: "none", overlayKey: null, overlayInset: 12 });
  };

  /** อัปทรง: SVG → เส้นทาง (มีเส้นขอบได้) · PNG/WebP → รูปพื้นใส (ตัดรูปตามส่วนทึบ) */
  const importShape = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setNote(null);
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    if (isSvg) {
      if (file.size > 1024 * 1024) return setErr("ไฟล์ SVG ใหญ่เกิน 1 MB — ลองลดจุดของเส้น/รวมรูปทรงก่อนส่งออก");
      const res = svgTextToFrameShape(await file.text());
      if (!res.shape) return setErr(res.error ?? "ใช้ไฟล์นี้ไม่ได้");
      set({ frame: "custom", shape: res.shape, maskKey: null });
      setNote(res.warning ?? `ได้ทรงจาก ${file.name} แล้ว`);
      if (!name) setName(file.name.replace(/\.[^.]+$/, "").slice(0, 60));
      return;
    }
    if (!/^image\/(png|webp)$/.test(file.type)) return setErr("รับ SVG หรือ PNG / WebP พื้นใส");
    setUploading(true);
    try {
      const up = await uploadToLibrary(file);
      set({ frame: "custom", shape: null, maskKey: up.key, border: "none" });
      setNote("ทรงจากรูป PNG: ส่วนทึบ = เห็นรูป · ส่วนใส = ตัดทิ้ง (เส้นขอบใช้ได้เฉพาะไฟล์ SVG)");
      if (!name) setName(file.name.replace(/\.[^.]+$/, "").slice(0, 60));
    } catch (e) {
      setErr((e as Error).message || "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const drop = useFileDrop((files) => void importShape(files[0]), {
    accept: ["image/"],
    disabled: uploading,
    onReject: () => toast.error("ลากมาได้เฉพาะไฟล์ SVG / PNG / WebP"),
  });

  const save = async (apply: boolean) => {
    const n = name.trim();
    if (!n) return setErr("ตั้งชื่อกรอบก่อนบันทึก");
    if (def.mode === "mask" && !def.shape && !def.maskKey) return setErr("ยังไม่ได้อัปทรง — อัป SVG / PNG หรือเลือกทรงตัวอย่าง");
    if (def.mode === "overlay" && !def.overlayKey) return setErr("ยังไม่ได้เลือกรูปกรอบ (PNG ตรงกลางใส)");
    setBusy(true);
    try {
      const body = { name: n, def, shopId: allShops ? null : shopId };
      const r = await apiFetch("/api/website/frames", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...body } : body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.frame) throw new Error(j.error ?? "บันทึกไม่สำเร็จ");
      toast.success(editing ? "บันทึกกรอบแล้ว" : apply ? "บันทึกกรอบ + ใช้กับรูปนี้แล้ว" : "เพิ่มกรอบเข้าคลังแล้ว");
      onSaved(j.frame as SavedFrame, apply);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canBorder = frameDefCanBorder(def);
  const dirty = open && JSON.stringify({ d: def, n: name }) !== initial;
  const MODES: { v: FrameMode; t: string; s: string }[] = [
    { v: "build", t: "🧩 ประกอบเอง", s: "ทรงที่มี + เส้นขอบ" },
    { v: "mask", t: "✂️ อัปทรงตัดรูป", s: "SVG / PNG พื้นใส" },
    { v: "overlay", t: "🖼 อัปกรอบวางทับ", s: "PNG ตรงกลางใส" },
  ];

  const borderControls = (
    <>
      <Lbl>เส้นขอบ</Lbl>
      <div className="flex flex-wrap gap-1.5">
        {BORDERS.map((b) => (
          <button key={b.v} type="button" className={chip(def.border === b.v)} onClick={() => set({ border: b.v })}>
            {b.l}
          </button>
        ))}
      </div>
      {def.border !== "none" && (
        <>
          <Lbl>สีเส้น</Lbl>
          <div className="flex flex-wrap items-center gap-1.5">
            {CANVAS_COLORS.filter((c) => c.v !== "custom").map((c) => (
              <button
                key={c.v}
                type="button"
                title={c.l}
                aria-label={c.l}
                onClick={() => set({ borderColor: c.v })}
                className={`w-6 h-6 rounded-full border ${def.borderColor === c.v ? "ring-2 ring-blue-500 ring-offset-1" : "border-slate-300"}`}
                style={{ background: colorOf(swatches, c.v, "") }}
              />
            ))}
            <button type="button" className={chip(def.borderColor === "custom")} onClick={() => set({ borderColor: "custom", borderHex: def.borderHex || "#b76e79" })}>
              สีเอง…
            </button>
            {def.borderColor === "custom" && (
              <div className="w-32">
                <ColorInput value={def.borderHex} onChange={(v) => set({ borderHex: v })} />
              </div>
            )}
          </div>
          <Lbl>ความหนา</Lbl>
          <RangeInput value={def.borderWidth} onChange={(v) => set({ borderWidth: v })} min={1} max={10} hardMax={16} unit="px" />
          <Lbl>ระยะห่างจากรูป</Lbl>
          <RangeInput value={def.borderGap} onChange={(v) => set({ borderGap: v })} min={0} max={40} hardMax={80} unit="px" />
        </>
      )}
    </>
  );

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={editing ? `แก้กรอบ "${editing.name}"` : "🖼 สร้างกรอบเอง"}
      size="xl"
      hasUnsavedChanges={dirty}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <input value={name} onChange={(e) => (setName(e.target.value), setErr(null))} maxLength={60} placeholder="ชื่อกรอบ เช่น วงรีลูกไม้ทอง" className="h-8 flex-1 min-w-[160px] rounded-lg border border-slate-300 px-2.5 text-sm" />
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="radio" checked={allShops} onChange={() => setAllShops(true)} /> ใช้ได้ทุกร้าน
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="radio" checked={!allShops} onChange={() => setAllShops(false)} /> เฉพาะร้านนี้
          </label>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">
            ยกเลิก
          </button>
          {!editing && (
            <button type="button" disabled={busy} onClick={() => void save(false)} className="px-3 py-1.5 rounded-lg border border-blue-500 text-blue-700 text-sm disabled:opacity-50">
              💾 บันทึกเข้าคลัง
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => void save(!editing)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">
            {busy ? "กำลังบันทึก…" : editing ? "💾 บันทึก" : "💾 บันทึก + ใช้กับรูปนี้"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button key={m.v} type="button" onClick={() => setMode(m.v)} className={`rounded-lg border px-3 py-2 text-left ${def.mode === m.v ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400"}`}>
              <div className="text-sm font-medium text-slate-800">{m.t}</div>
              <div className="text-[11px] text-slate-500">{m.s}</div>
            </button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0">
            {def.mode === "build" && (
              <>
                <Lbl>ทรงพื้นฐาน</Lbl>
                <div className="flex flex-wrap gap-1.5">
                  {BUILD_SHAPES.map((s) => (
                    <button key={s.v} type="button" className={chip(def.frame === s.v)} onClick={() => set({ frame: s.v, shape: null, maskKey: null })}>
                      {s.l}
                    </button>
                  ))}
                </div>
                {borderControls}
              </>
            )}

            {def.mode === "mask" && (
              <>
                <Lbl>อัปไฟล์ทรง (SVG แนะนำ · PNG / WebP พื้นใสก็ได้)</Lbl>
                <div {...drop.zone("shape")} className="relative">
                  <FileDropHint show={drop.over === "shape"} label="วางไฟล์ทรงเพื่ออัป" />
                  <input ref={fileRef} type="file" accept=".svg,image/svg+xml,image/png,image/webp" className="hidden" onChange={(e) => void importShape(e.target.files?.[0])} />
                  <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center hover:border-blue-400">
                    <div className="text-xl">✂️</div>
                    <div className="text-sm font-medium text-slate-700">{uploading ? "กำลังอัปโหลด…" : "ลากไฟล์มาวาง หรือกดเลือกไฟล์"}</div>
                    <div className="text-[11px] text-slate-400">ทำใน Canva / Illustrator / Photoshop · ส่วนทึบ = ส่วนที่เห็นรูป</div>
                  </button>
                </div>
                <Lbl>หรือลองด้วยทรงตัวอย่าง</Lbl>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_SHAPES.map((s) => (
                    <button key={s.v} type="button" className={chip(JSON.stringify(def.shape) === JSON.stringify(s.shape))} onClick={() => (set({ frame: "custom", shape: s.shape, maskKey: null }), setNote(null))}>
                      {s.l}
                    </button>
                  ))}
                </div>
                {canBorder ? borderControls : <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">ทรงจากรูป PNG ใส่เส้นขอบไม่ได้ — อยากได้เส้นขอบตามทรง ให้อัปเป็น SVG</p>}
              </>
            )}

            {def.mode === "overlay" && (
              <>
                <Lbl>รูปกรอบ (PNG ที่ตรงกลางใส)</Lbl>
                <div className="flex items-center gap-2">
                  {def.overlayKey && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgUrl(def.overlayKey, 200)} alt="" className="w-14 h-14 rounded object-contain border border-slate-200 bg-[repeating-conic-gradient(#f8fafc_0_25%,#fff_0_50%)] bg-[length:12px_12px]" />
                  )}
                  <button type="button" onClick={() => setLibOpen(true)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:border-blue-500">
                    {def.overlayKey ? "เปลี่ยนรูปกรอบ…" : "📁 เลือก / อัปโหลดรูปกรอบ…"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">เช่น กรอบลายดอกไม้ กรอบรูปทอง โพลารอยด์ติดเทป (ทำใน Canva แล้วส่งออก PNG พื้นใส)</p>
                <Lbl>รูปห่างขอบกรอบ</Lbl>
                <RangeInput value={def.overlayInset} onChange={(v) => set({ overlayInset: v })} min={0} max={40} unit="%" />
                <Lbl>ทรงของรูปข้างใน</Lbl>
                <div className="flex flex-wrap gap-1.5">
                  {BUILD_SHAPES.slice(0, 4).map((s) => (
                    <button key={s.v} type="button" className={chip(def.frame === s.v)} onClick={() => set({ frame: s.v, shape: null, maskKey: null })}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </>
            )}

            {note && <p className="mt-3 text-[11px] text-emerald-700">✓ {note}</p>}
            {err && <p className="mt-3 text-[13px] text-rose-600">⚠️ {err}</p>}
          </div>

          <div>
            <Lbl>พรีวิว {imageKey ? "(รูปที่เลือกอยู่)" : "(รูปตัวอย่าง)"}</Lbl>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-6 flex justify-center">
              <FramePreview def={def} imageKey={imageKey} w={190} h={240} swatches={swatches} k={0.6} />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400 leading-snug">บันทึกแล้วกรอบอยู่ในตัวเลือก &quot;กรอบรูป&quot; ของทุกผืนผ้าใบ · ใช้แล้ว = คัดลอกค่าไป (แก้กรอบในคลังทีหลัง รูปเดิมไม่เปลี่ยน)</p>
          </div>
        </div>
      </div>
      <DecorLibrary
        kind="frame"
        open={libOpen}
        onClose={() => setLibOpen(false)}
        shopId={shopId}
        color={colorOf(swatches, "brand", "")}
        onPickSticker={(img) => {
          set({ overlayKey: img.key });
          setLibOpen(false);
          if (!name && img.title) setName(img.title.slice(0, 60));
        }}
      />
    </ERPModal>
  );
}

/** 🗂 คลังกรอบของร้าน (โหลด/รีเฟรช) — ใช้ในแผงขวาของผืนผ้าใบ */
export function useShopFrames(shopSlug: string) {
  const [frames, setFrames] = useState<SavedFrame[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/website/frames?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => alive && setFrames(((j?.frames as SavedFrame[]) ?? []).map((f) => ({ ...f, def: normalizeFrameDef(f.def) }))))
      .catch(() => alive && setFrames([]));
    return () => {
      alive = false;
    };
  }, [shopSlug, tick]);
  return { frames, reload: () => setTick((t) => t + 1), setFrames };
}

/** ค่ากรอบของชิ้นนี้ตรงกับกรอบในคลังไหม (ไว้ไฮไลต์ไทล์ที่ใช้อยู่) */
function sameAsItem(def: FrameDef, item: Record<string, unknown>): boolean {
  const p = frameDefCanvasPatch(def);
  const norm = (v: unknown) => JSON.stringify(v ?? null);
  return Object.keys(p).every((k) => norm(p[k]) === norm(item[k]));
}

/**
 * 🗂 "กรอบของฉัน" ในแผงขวาของผืนผ้าใบ — ไทล์กรอบในคลัง (กด = ใช้กับรูปนี้ · ✎ แก้ · ✕ ลบ) + ＋ สร้างกรอบเอง
 * ลบในคลัง = รูปที่ใช้ไปแล้วไม่เปลี่ยน (ใช้แล้วคือคัดลอกค่า)
 */
export function CustomFrameGrid({
  item,
  shopSlug,
  shopId,
  swatches,
  onPatchItem,
}: {
  item: Record<string, unknown>;
  shopSlug: string;
  shopId: string;
  swatches: FrameSwatch[];
  onPatchItem: (patch: Record<string, unknown>) => void;
}) {
  const toast = useToast();
  const { frames, setFrames } = useShopFrames(shopSlug);
  const [builder, setBuilder] = useState<{ editing: SavedFrame | null } | null>(null);
  const [del, setDel] = useState<SavedFrame | null>(null);
  const imageKey = typeof item.imageKey === "string" && item.imageKey ? item.imageKey : null;

  const remove = async () => {
    if (!del) return;
    const f = del;
    setDel(null);
    const r = await apiFetch(`/api/website/frames?id=${encodeURIComponent(f.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(j.error ?? "ลบไม่สำเร็จ");
    setFrames((all) => all.filter((x) => x.id !== f.id));
    toast.success(`ลบกรอบ "${f.name}" แล้ว (รูปที่ใช้ไปแล้วไม่เปลี่ยน)`);
  };

  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-500 mb-1">กรอบของฉัน</div>
      <div className="grid grid-cols-3 gap-1.5">
        {frames.map((f) => {
          const on = sameAsItem(f.def, item);
          return (
            <div key={f.id} className={`group relative flex flex-col items-center gap-1 rounded-lg border py-2 ${on ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400"}`}>
              <button type="button" onClick={() => onPatchItem(frameDefCanvasPatch(f.def))} className="flex flex-col items-center gap-1 w-full" title={`ใช้กรอบ "${f.name}"`}>
                <FramePreview def={f.def} w={30} h={38} swatches={swatches} k={0.12} />
                <span className="text-[10px] text-slate-600 truncate max-w-full px-1">
                  {f.shopId === null ? "" : "🏪 "}
                  {f.name}
                </span>
              </button>
              <div className="absolute right-0.5 top-0.5 hidden gap-0.5 group-hover:flex">
                <button type="button" onClick={() => setBuilder({ editing: f })} className="rounded bg-white/90 px-1 text-[10px] text-slate-500 shadow hover:text-blue-600" title="แก้กรอบนี้">
                  ✎
                </button>
                <button type="button" onClick={() => setDel(f)} className="rounded bg-white/90 px-1 text-[10px] text-slate-500 shadow hover:text-rose-600" title="ลบจากคลัง">
                  ✕
                </button>
              </div>
            </div>
          );
        })}
        <button type="button" onClick={() => setBuilder({ editing: null })} className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-2 text-slate-500 hover:border-blue-500 hover:text-blue-600">
          <span className="text-lg leading-none">＋</span>
          <span className="text-[10px]">สร้างกรอบเอง</span>
        </button>
      </div>
      <FrameBuilder
        open={!!builder}
        onClose={() => setBuilder(null)}
        shopId={shopId}
        swatches={swatches}
        imageKey={imageKey}
        editing={builder?.editing ?? null}
        onSaved={(f, apply) => {
          setFrames((all) => [f, ...all.filter((x) => x.id !== f.id)]);
          if (apply) onPatchItem(frameDefCanvasPatch(f.def));
        }}
      />
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => void remove()}
        title="ลบกรอบนี้จากคลัง?"
        message={del ? `"${del.name}" จะหายจากตัวเลือกกรอบ — รูปที่ใช้กรอบนี้ไปแล้วยังอยู่เหมือนเดิม` : ""}
        confirmText="ลบ"
        variant="danger"
      />
    </div>
  );
}
