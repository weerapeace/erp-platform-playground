"use client";

// ============================================================
// ImageLightbox (ของกลาง) — กดรูปแล้วขยายเต็มจอ + เลื่อนดูถัดไป/ก่อนหน้า + ซูม/เลื่อนดู
// ลูกศรซ้าย/ขวา · Esc ปิด · ปัดนิ้ว (มือถือ) · กดพื้นหลังปิด
// ซูม: ล้อเมาส์ · ดับเบิลคลิก · จีบนิ้ว (pinch) · ปุ่ม +/− · ลากเลื่อนเมื่อซูม · กด "0"/ปุ่มรีเซ็ต = พอดีจอ
// ใช้ซ้ำได้ทุกที่ที่มีชุดรูป (แนบงาน, คอนเทนต์, แกลเลอรีสินค้า ฯลฯ)
// เสริม (ไม่บังคับ — ไม่ส่ง = หน้าตาเดิมทุกอย่าง):
//   groups     = ชิปกลุ่มด้านล่าง (เช่น Parent / SKU / Description) กดแล้วกระโดดไปรูปแรกของกลุ่ม · หัวบอก "กลุ่ม 2/5"
//                รูปแต่ละใบบอกกลุ่มด้วย image.group
//   thumbnails = แถบรูปเล็กด้านล่าง กดเลือกรูปได้ (รูปเล็กใช้ image.thumbUrl ถ้ามี)
//   ตัวที่ใช้ทั้งสองอย่าง: GroupedImageViewer (components/grouped-image-viewer)
// ============================================================

import { useCallback, useEffect, useRef, useState, type ReactNode, type WheelEvent as RWheelEvent, type MouseEvent as RMouseEvent, type TouchEvent as RTouchEvent } from "react";
import { createPortal } from "react-dom";
import { copyImageToClipboard, downloadImageAsJpg, canCopyImage } from "@/lib/image-clipboard";

export type LightboxImage = {
  url: string;
  label?: string | null;
  group?: string | null;      // key ของกลุ่ม (ใช้คู่กับ prop groups)
  thumbUrl?: string | null;   // รูปย่อสำหรับแถบรูปเล็ก (ไม่ส่ง = ใช้ url)
};
export type LightboxGroup = { key: string; label: string };

const MIN = 1, MAX = 6;
const clampScale = (s: number) => Math.min(MAX, Math.max(MIN, s));
type Pt = { clientX: number; clientY: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

/** ตั้งชื่อไฟล์ .jpg จากรูป (ใช้ชื่อไฟล์เดิมจาก R2 key ถ้ามี ไม่งั้นใช้ป้ายกำกับ) */
function jpgFileName(img: LightboxImage): string {
  let base = "";
  try {
    const origin = typeof location !== "undefined" ? location.origin : "http://x";
    const key = new URL(img.url, origin).searchParams.get("key");
    if (key) base = key.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
  } catch { /* ไม่ใช่ URL proxy — ข้าม */ }
  if (!base && img.label) base = img.label;
  base = (base || "image").replace(/[^\w฀-๿.-]+/g, "_").slice(0, 60);
  return base.toLowerCase().endsWith(".jpg") ? base : `${base}.jpg`;
}

export function ImageLightbox({ images, index, onClose, onIndex, footer, groups, thumbnails = false }: {
  images: LightboxImage[];
  index: number;                 // รูปปัจจุบัน · นอกช่วง (เช่น -1) = ปิด
  onClose: () => void;
  onIndex: (i: number) => void;  // เปลี่ยนรูป
  footer?: (index: number) => ReactNode;   // ปุ่ม/ข้อความเสริมใต้รูป (เช่น "เลือกรูปนี้" ในป๊อปโพสต์) — ไม่ส่ง = คำใบ้ซูมเหมือนเดิม
  groups?: LightboxGroup[];      // ชิปกลุ่มด้านล่าง (เรียงตามนี้ · โชว์เฉพาะกลุ่มที่มีรูป)
  thumbnails?: boolean;          // แถบรูปเล็กด้านล่าง
}) {
  const open = index >= 0 && index < images.length;
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const drag = useRef(false);           // กำลังลากเลื่อน (เมื่อซูม)
  const moved = useRef(false);          // ขยับจริงไหม (กันปิดตอนลาก)
  const last = useRef({ x: 0, y: 0 });
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const touchX = useRef<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");

  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);
  const go = useCallback((delta: number) => {
    if (images.length < 2) return;
    reset();
    onIndex((index + delta + images.length) % images.length);
  }, [index, images.length, onIndex, reset]);

  useEffect(() => { reset(); }, [index, reset]);   // เปลี่ยนรูป → รีเซ็ตซูม

  // แถบรูปเล็ก: เลื่อนให้รูปปัจจุบันอยู่ในสายตาเสมอ
  const stripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open || !thumbnails) return;
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-thumb="${index}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index, open, thumbnails]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "0") reset();
      else if (e.key === "+" || e.key === "=") setScale((s) => clampScale(s * 1.3));
      else if (e.key === "-") setScale((s) => { const n = clampScale(s / 1.3); if (n === 1) reset(); return n; });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, onClose, reset]);

  if (!open) return null;
  const cur = images[index];
  const zoomed = scale > 1;
  // กลุ่ม (ถ้าส่งมา): เฉพาะกลุ่มที่มีรูปจริง + ตำแหน่งของรูปปัจจุบันในกลุ่ม
  const groupList = (groups ?? []).map((g) => ({ ...g, first: images.findIndex((im) => im.group === g.key), count: images.filter((im) => im.group === g.key).length })).filter((g) => g.count > 0);
  const curGroup = groupList.find((g) => g.key === cur.group) ?? null;
  const posInGroup = curGroup ? images.slice(0, index + 1).filter((im) => im.group === curGroup.key).length : 0;
  const hasDock = thumbnails || groupList.length > 0;   // มีแถบล่าง (ชิปกลุ่ม/รูปเล็ก) → ย่อรูปใหญ่ให้พอที่
  const stopDock = { onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(), onMouseDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onWheel: (e: { stopPropagation: () => void }) => e.stopPropagation(), onTouchStart: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onTouchMove: (e: { stopPropagation: () => void }) => e.stopPropagation(), onTouchEnd: (e: { stopPropagation: () => void }) => e.stopPropagation() };
  const navBtn = "absolute top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl leading-none select-none";

  const onWheel = (e: RWheelEvent) => {
    e.preventDefault();
    const ns = clampScale(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    if (ns === 1) reset(); else setScale(ns);
  };
  const toggleZoom = () => { if (zoomed) reset(); else setScale(2.5); };

  // ลากเลื่อน (เมาส์) — เฉพาะตอนซูม
  const onMouseDown = (e: RMouseEvent) => { if (!zoomed) return; drag.current = true; moved.current = false; last.current = { x: e.clientX, y: e.clientY }; };
  const onMouseMove = (e: RMouseEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - last.current.x, dy = e.clientY - last.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    setTx((t) => t + dx); setTy((t) => t + dy);
  };
  const endDrag = () => { drag.current = false; };

  // สัมผัส: 2 นิ้ว = จีบซูม · 1 นิ้วตอนซูม = เลื่อน · 1 นิ้วไม่ซูม = ปัดเปลี่ยนรูป
  const onTouchStart = (e: RTouchEvent) => {
    if (e.touches.length === 2) { pinch.current = { dist: dist(e.touches[0], e.touches[1]), scale }; touchX.current = null; }
    else if (e.touches.length === 1) {
      if (zoomed) { drag.current = true; moved.current = false; last.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
      else touchX.current = e.touches[0].clientX;
    }
  };
  const onTouchMove = (e: RTouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      const d = dist(e.touches[0], e.touches[1]);
      setScale(clampScale(pinch.current.scale * (d / pinch.current.dist)));
    } else if (drag.current && e.touches.length === 1) {
      const dx = e.touches[0].clientX - last.current.x, dy = e.touches[0].clientY - last.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      last.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setTx((t) => t + dx); setTy((t) => t + dy);
    }
  };
  const onTouchEnd = (e: RTouchEvent) => {
    if (pinch.current) { pinch.current = null; if (scale <= 1) reset(); }
    else if (!zoomed && touchX.current != null) {
      const x1 = e.changedTouches[0]?.clientX ?? null;
      if (x1 != null && Math.abs(x1 - touchX.current) > 50) go(x1 < touchX.current ? 1 : -1);
    }
    touchX.current = null; drag.current = false;
  };

  const bgClick = () => { if (zoomed || moved.current) return; onClose(); };

  // รูปเต็มความละเอียด (ตัด &w= ที่ย่อไว้สำหรับพรีวิวออกก่อน)
  const fullUrl = () => cur.url.replace(/([?&])w=\d+/, "$1").replace(/[?&]$/, "");

  // ดาวน์โหลดรูปปัจจุบันเป็น JPG (ของกลาง lib/image-clipboard) · รูปข้ามโดเมนไม่มี CORS → เปิดแท็บใหม่แทน
  const downloadJpg = async (e: RMouseEvent) => {
    e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    const url = fullUrl();
    try { await downloadImageAsJpg(url, jpgFileName(cur)); }
    catch { window.open(url, "_blank"); }
    finally { setDownloading(false); }
  };

  // คัดลอกรูปปัจจุบันลงคลิปบอร์ด
  const copyImg = async (e: RMouseEvent) => {
    e.stopPropagation();
    try { await copyImageToClipboard(fullUrl()); setCopyState("ok"); } catch { setCopyState("err"); }
    setTimeout(() => setCopyState("idle"), 1400);
  };

  // z-[9999] + portal ไป body → ลอยทับทุกอย่าง (modal/drawer) ไม่จมหลัง popup ที่เปิดอยู่
  const node = (
    <div className={`fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center overflow-hidden select-none ${hasDock ? "pt-12 pb-36" : ""}`}
      onClick={bgClick} onWheel={onWheel}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* แถบบน: ลำดับ + ป้ายกำกับ */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[70vw] truncate text-white/85 text-sm pointer-events-none">{curGroup ? `${curGroup.label} ${posInGroup} / ${curGroup.count}` : `${index + 1} / ${images.length}`}{cur.label ? ` · ${cur.label}` : ""}{zoomed ? ` · ${Math.round(scale * 100)}%` : ""}</div>

      {/* ปุ่มซูม + ปิด (มุมขวาบน) */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
        <button onClick={(e) => { e.stopPropagation(); setScale((s) => { const n = clampScale(s / 1.3); if (n === 1) reset(); return n; }); }} title="ซูมออก (−)" className="h-10 w-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-xl">−</button>
        <button onClick={(e) => { e.stopPropagation(); setScale((s) => clampScale(s * 1.3)); }} title="ซูมเข้า (+)" className="h-10 w-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-xl">＋</button>
        {zoomed && <button onClick={(e) => { e.stopPropagation(); reset(); }} title="พอดีจอ (0)" className="h-10 px-3 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-sm">⤢</button>}
        {canCopyImage() && <button onClick={copyImg} title="คัดลอกรูปลงคลิปบอร์ด (Ctrl+V วางได้)" className="h-10 w-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-lg">{copyState === "ok" ? "✓" : copyState === "err" ? "✕" : "📋"}</button>}
        <button onClick={downloadJpg} disabled={downloading} title="ดาวน์โหลดรูปนี้เป็น JPG" className="h-10 w-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-lg disabled:opacity-50">{downloading ? "…" : "⬇"}</button>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} title="ปิด (Esc)" className="h-10 w-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-xl">✕</button>
      </div>

      {images.length > 1 && !zoomed && <button onClick={(e) => { e.stopPropagation(); go(-1); }} title="ก่อนหน้า (←)" className={`${navBtn} left-3`}>‹</button>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cur.url} alt={cur.label ?? ""} draggable={false}
        onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => { e.stopPropagation(); toggleZoom(); }}
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, cursor: zoomed ? (drag.current ? "grabbing" : "grab") : "zoom-in", transition: drag.current || pinch.current ? "none" : "transform 0.12s ease-out" }}
        className={`${hasDock ? "max-h-[calc(100vh-200px)]" : "max-h-[92vh]"} max-w-[94vw] object-contain rounded shadow-2xl`} />
      {images.length > 1 && !zoomed && <button onClick={(e) => { e.stopPropagation(); go(1); }} title="ถัดไป (→)" className={`${navBtn} right-3`}>›</button>}

      {/* แถบล่างแบบเต็ม (มีชิปกลุ่ม/รูปเล็ก): ปุ่มเสริม → ชิปกลุ่ม → แถบรูปเล็ก */}
      {hasDock ? (
        <div className="absolute bottom-0 inset-x-0 z-10 flex flex-col items-center gap-2 px-3 pb-3 pt-2 bg-gradient-to-t from-black/70 to-transparent" {...stopDock}>
          {footer && <div className="flex items-center gap-2">{footer(index)}</div>}
          {groupList.length > 0 && (
            <div className="flex max-w-full gap-1.5 overflow-x-auto">
              {groupList.map((g) => (
                <button key={g.key} type="button" onClick={() => { reset(); onIndex(g.first); }}
                  className={`shrink-0 h-7 px-3 rounded-full text-xs whitespace-nowrap transition-colors ${curGroup?.key === g.key ? "bg-white text-slate-900" : "bg-white/15 text-white hover:bg-white/30"}`}>
                  {g.label} <span className="opacity-70">{g.count}</span>
                </button>
              ))}
            </div>
          )}
          {thumbnails && images.length > 1 && (
            <div ref={stripRef} className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
              {images.map((im, i) => (
                <button key={i} type="button" data-thumb={i} onClick={() => { reset(); onIndex(i); }} title={im.label ?? undefined}
                  className={`shrink-0 h-14 w-14 rounded-md overflow-hidden bg-white border-2 transition-opacity ${i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.thumbUrl || im.url} alt="" loading="lazy" draggable={false} className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : footer
        ? <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>{footer(index)}</div>
        : !zoomed && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/45 text-[11px] pointer-events-none">ดับเบิลคลิก/ล้อเมาส์/จีบนิ้ว = ซูม</div>}
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}
