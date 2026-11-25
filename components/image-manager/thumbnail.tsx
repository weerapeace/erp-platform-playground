"use client";
/**
 * ImageThumbnail — รูปเล็กในตาราง + ชี้ขยาย + (enlargeable) คลิกดูเต็มจอ/พิมพ์รูป · printImageWindow (ของกลาง)
 * แยกไฟล์ออกจาก components/image-manager (2026-11-25 เจ้าของ "ลดไซส์") — ตัวจัดการรูปเต็ม (คลังรูป · วาดกำกับ · ตรวจรูปซ้ำ · คัดลอกรูป)
 * หนักมาก แต่ตาราง/ตัวเลือกสินค้าใช้แค่รูปย่อ → ไฟล์นี้ไม่ import ของหนักใด ๆ · ที่เดิม (image-manager) ยัง export ต่อให้เหมือนเดิม
 * ห้ามเพิ่ม import ของหนักในไฟล์นี้ (DataTable / pickers ทุกหน้าใช้)
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { withImageWidth } from "@/lib/r2-image";

// พิมพ์ "เฉพาะรูป" — เปิดหน้าต่างใหม่ที่มีแค่ <img> แล้วสั่งพิมพ์ (ของกลาง)
export function printImageWindow(url: string) {
  const safe = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปแล้วลองใหม่ หรือกด ↗ เปิดเต็มแล้วสั่งพิมพ์เอง"); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>พิมพ์รูป</title><style>@page{margin:8mm}html,body{margin:0;padding:0}img{max-width:100%;max-height:100vh;display:block;margin:0 auto}</style></head><body><img src="${safe}" onload="setTimeout(function(){window.focus();window.print();},60)"></body></html>`);
  w.document.close();
}


export function ImageThumbnail({ url, size = 40, alt = "", enlargeable = false }: { url?: string | null; size?: number; alt?: string; enlargeable?: boolean }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos]     = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const [full, setFull] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  if (!url) {
    return (
      <div className="flex items-center justify-center rounded bg-slate-100 text-slate-300" style={{ width: size, height: size }}>
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </svg>
      </div>
    );
  }

  const onEnter = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.right + 8, y: r.top });
    setHover(true);
  };

  // กันทะลุขอบจอ
  const ZOOM = 240;
  const left = typeof window !== "undefined" ? Math.min(pos.x, window.innerWidth - ZOOM - 16) : pos.x;
  const top  = typeof window !== "undefined" ? Math.min(Math.max(8, pos.y), window.innerHeight - ZOOM - 16) : pos.y;

  return (
    <div ref={ref} onMouseEnter={onEnter} onMouseLeave={() => setHover(false)} className="inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* object-contain (fit): รูปไม่จัตุรัสเห็นทั้งใบ ไม่ถูกครอบตัด · รูปจัตุรัสยังเต็มกรอบเหมือนเดิม */}
      <img src={withImageWidth(url, Math.min(size * 3, 512)) ?? url} alt={alt} loading="lazy" decoding="async"
        onClick={enlargeable ? () => setFull(true) : undefined}
        className={`rounded object-contain border border-slate-200 bg-white ${enlargeable ? "cursor-zoom-in" : ""}`} style={{ width: size, height: size }} />
      {mounted && hover && !full && createPortal(
        <div className="fixed z-[60] pointer-events-none rounded-lg overflow-hidden shadow-2xl border border-slate-200 bg-white"
          style={{ left, top, width: ZOOM, height: ZOOM }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withImageWidth(url, 480) ?? url} alt={alt} decoding="async" className="w-full h-full object-contain bg-slate-50" />
        </div>,
        document.body
      )}
      {mounted && full && createPortal(
        <div className="fixed inset-0 z-[130] flex flex-col items-center justify-center gap-3 bg-black/80 p-4" onClick={() => setFull(false)}>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => printImageWindow(withImageWidth(url, 1600) ?? url)}
              className="h-9 px-3 text-sm font-medium bg-white text-slate-700 rounded-lg hover:bg-slate-100 shadow">🖨 พิมพ์รูป</button>
            <a href={withImageWidth(url, 1600) ?? url} target="_blank" rel="noreferrer"
              className="h-9 px-3 inline-flex items-center text-sm bg-white/90 text-slate-700 rounded-lg hover:bg-white shadow">↗ เปิดเต็ม</a>
            <button type="button" onClick={() => setFull(false)}
              className="h-9 px-3 text-sm bg-white/90 text-slate-700 rounded-lg hover:bg-white shadow">✕ ปิด</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withImageWidth(url, 1600) ?? url} alt={alt} onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[82vh] object-contain rounded-lg shadow-2xl bg-white" />
        </div>,
        document.body
      )}
    </div>
  );
}
