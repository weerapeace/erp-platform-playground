"use client";

/**
 * ⬚ ดัดรูปเอียงให้ตรง — จิ้ม/ลาก 4 มุมของแผ่นที่ถ่ายเฉียง แล้วระบบยืดให้เป็นสี่เหลี่ยมตรง (ส่วนหนึ่งของ photo-capture)
 * คณิต: lib/perspective-warp (ไม่ใช้ไลบรารี) · ทำในเครื่อง ไม่ส่งรูปออกไปไหน
 */
import { useEffect, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { loadImageEl } from "@/components/image-crop-picker";
import { defaultQuad, isConvexQuad, outputSize, warpQuad, type Pt, type Quad } from "@/lib/perspective-warp";

const LABELS = ["บนซ้าย", "บนขวา", "ล่างขวา", "ล่างซ้าย"];

export function StraightenModal({ open, src, onClose, onDone, maxSide = 2400, zIndex, aspect, initialQuad, title, description }: {
  open: boolean;
  zIndex?: number;
  /** blob URL ของรูปในเครื่อง */
  src: string;
  onClose: () => void;
  /** quad = มุมที่ใช้ (พิกัดพิกเซลในรูปเดิม) — เก็บไว้แก้ใหม่ได้ */
  onDone: (r: { blob: Blob; w: number; h: number; quad: Quad }) => void | Promise<void>;
  maxSide?: number;
  /** บังคับสัดส่วนรูปผลลัพธ์ กว้าง÷สูง (เช่น ผ้าจริง 90×60 ซม. = 1.5) — ไม่ส่ง = ใช้ความยาวด้านในรูป */
  aspect?: number;
  /** มุมเดิม (แก้มุมใหม่) — ไม่ส่ง = เข้ามาจากขอบรูป */
  initialQuad?: Quad | null;
  title?: string;
  description?: string;
}) {
  const toast = useToast();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);   // พิกัดพิกเซลในรูปจริง
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSize(null); setQuad(null);
    loadImageEl(src).then((im) => {
      if (!alive) return;
      const w = im.naturalWidth, h = im.naturalHeight;
      setSize({ w, h }); setQuad(initialQuad && initialQuad.length === 4 ? initialQuad : defaultQuad(w, h));
    }).catch(() => toast.error("เปิดรูปไม่ได้"));
    return () => { alive = false; };
  }, [open, src]);   // eslint-disable-line react-hooks/exhaustive-deps

  const toImg = (e: React.PointerEvent): Pt | null => {
    const el = boxRef.current;
    if (!el || !size) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(size.w, ((e.clientX - r.left) / r.width) * size.w)),
      y: Math.max(0, Math.min(size.h, ((e.clientY - r.top) / r.height) * size.h)),
    };
  };
  const onDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = i;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* บางเบราว์เซอร์ไม่รองรับ */ }
  };
  const onMove = (e: React.PointerEvent) => {
    const i = dragRef.current;
    if (i === null || !quad) return;
    const p = toImg(e);
    if (!p) return;
    const q = [...quad] as Quad; q[i] = p; setQuad(q);
  };
  const onUp = () => { dragRef.current = null; };

  const ok = !!quad && isConvexQuad(quad);
  const apply = async () => {
    if (!quad || !size) return;
    if (!ok) { toast.warning("มุมไขว้กันอยู่ — เรียงมุมตามป้าย บนซ้าย → บนขวา → ล่างขวา → ล่างซ้าย"); return; }
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 30));   // ให้หน้าจอโชว์ "กำลังดัด…" ก่อนคำนวณหนัก
      const im = await loadImageEl(src);
      // อ่านพิกเซลรูปเดิม (ย่อก่อนถ้าใหญ่มาก กันมือถือค้าง) — ปรับพิกัดมุมตามสัดส่วนที่ย่อ
      const k = Math.min(1, 3200 / Math.max(size.w, size.h));
      const sw = Math.round(size.w * k), sh = Math.round(size.h * k);
      const c1 = document.createElement("canvas"); c1.width = sw; c1.height = sh;
      const x1 = c1.getContext("2d");
      if (!x1) throw new Error("no canvas");
      x1.drawImage(im, 0, 0, sw, sh);
      const srcPx = x1.getImageData(0, 0, sw, sh);
      const q = quad.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad;
      const out0 = outputSize(q, maxSide);
      // สัดส่วนจริง: ด้านยาวเท่าเดิม อีกด้านคิดจากสัดส่วนที่บังคับ
      const out = aspect && aspect > 0
        ? (aspect >= 1 ? { w: Math.max(out0.w, out0.h), h: Math.max(1, Math.round(Math.max(out0.w, out0.h) / aspect)) } : { w: Math.max(1, Math.round(Math.max(out0.w, out0.h) * aspect)), h: Math.max(out0.w, out0.h) })
        : out0;
      const px = warpQuad(srcPx, q, out.w, out.h);
      const c2 = document.createElement("canvas"); c2.width = out.w; c2.height = out.h;
      const x2 = c2.getContext("2d");
      if (!x2) throw new Error("no canvas");
      x2.putImageData(new ImageData(px, out.w, out.h), 0, 0);
      const blob = await new Promise<Blob>((res, rej) => c2.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", 0.9));
      await onDone({ blob, w: out.w, h: out.h, quad });
      onClose();
    } catch (e) { toast.error("ดัดรูปไม่สำเร็จ: " + ((e as Error).message || "ลองใหม่")); }
    finally { setBusy(false); }
  };

  const pct = (p: Pt) => (size ? { left: `${(p.x / size.w) * 100}%`, top: `${(p.y / size.h) * 100}%` } : {});
  return (
    <ERPModal open={open} onClose={onClose} title={title ?? "ดัดรูปให้ตรง"} size="xl" loading={busy} zIndex={zIndex}
      description={description ?? "ลากจุดทั้ง 4 ไปวางที่มุมของแผ่น แล้วกด ดัดให้ตรง — ส่วนนอกกรอบจะถูกตัดทิ้ง"}
      footer={
        <div className="flex items-center justify-between w-full gap-2 flex-wrap">
          <button type="button" onClick={() => size && setQuad(defaultQuad(size.w, size.h))} disabled={busy}
            className="h-9 px-3 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50">วางมุมใหม่</button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-9 px-3 text-sm rounded-lg text-slate-600 hover:bg-slate-100">ยกเลิก</button>
            <button type="button" onClick={() => void apply()} disabled={busy || !quad}
              className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังดัด…" : "ดัดให้ตรง"}</button>
          </div>
        </div>
      }>
      {!ok && quad && <p className="mb-2 text-[12px] text-amber-700">มุมไขว้กันอยู่ — เรียงตามป้าย บนซ้าย → บนขวา → ล่างขวา → ล่างซ้าย</p>}
      <div className="flex justify-center bg-slate-100 rounded-lg p-3 select-none" style={{ touchAction: "none" }}>
        {size && quad ? (
          <div ref={boxRef} className="relative" style={{ aspectRatio: `${size.w} / ${size.h}`, width: `min(100%, calc(60vh * ${size.w / size.h}))` }}
            onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" draggable={false} className="absolute inset-0 w-full h-full rounded" />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
              <path fillRule="evenodd" fill="rgba(15,23,42,0.45)"
                d={`M0 0H${size.w}V${size.h}H0Z M${quad.map((p) => `${p.x} ${p.y}`).join(" L")}Z`} />
              <polygon points={quad.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={ok ? "#3b82f6" : "#f59e0b"} strokeWidth={Math.max(size.w, size.h) / 300} />
            </svg>
            {quad.map((p, i) => (
              <button key={i} type="button" onPointerDown={onDown(i)} aria-label={`มุม${LABELS[i]}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border-[3px] border-blue-500 bg-white/10 shadow-[0_0_0_2px_rgba(255,255,255,0.9)] cursor-grab active:cursor-grabbing"
                style={{ ...pct(p), touchAction: "none" }}>
                {/* กลางวงโปร่ง เห็นมุมที่วางอยู่ข้างใต้ · จุดกลาง = ตำแหน่งมุมจริง */}
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 ring-1 ring-white" />
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-0.5 whitespace-nowrap text-[10.5px] px-1 rounded bg-slate-900/75 text-white">{LABELS[i]}</span>
              </button>
            ))}
          </div>
        ) : <div className="h-[40vh] flex items-center text-sm text-slate-400">กำลังเปิดรูป…</div>}
      </div>
    </ERPModal>
  );
}
