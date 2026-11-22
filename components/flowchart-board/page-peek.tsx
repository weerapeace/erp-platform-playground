"use client";

// 👁 ดูตัวอย่างหน้าในการ์ด "หน้าใน ERP" (ใช้ภายใน components/flowchart-board · เจ้าของเลือก 2026-11-22 แบบ A + ข้อ 1-3)
//   - PagePeek = ภาพหน้าจริงสด (iframe ?embed=1 ย่อ · ดูอย่างเดียว กดข้างในไม่ได้) ลอยข้างการ์ด — ชี้การ์ด (จอคอม) หรือกดปุ่มตา (มือถือ)
//   - captureCardImage = ถ่ายภาพหน้าจอเก็บไว้ในการ์ด (การ์ดแบบมีภาพ ไม่ต้องโหลดหน้าจริงทุกใบ · กด "ถ่ายใหม่" เมื่อหน้าเปลี่ยน)
//   กดภาพ/ปุ่มขยาย = ป๊อปดูหน้าจริงตัวใหญ่ (ของกลาง components/flow-map/page-preview — ล็อกปุ่มบันทึก/ลบ)

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icon";
import { snapshotFrame } from "@/lib/page-snapshot";
import { uploadMediaFile } from "@/lib/media-upload";

const FRAME_W = 1280, FRAME_H = 800;
const embedUrl = (href: string) => `${href}${href.includes("?") ? "&" : "?"}embed=1`;

/** ภาพหน้าจริงสดลอยข้างการ์ด · anchor = กรอบการ์ดบนจอ */
export function PagePeek({ href, label, anchor, t, onBig, onEnter, onLeave }: {
  href: string; label: string; anchor: DOMRect; t: (th: string, en: string) => string;
  onBig: () => void; onEnter: () => void; onLeave: () => void;
}) {
  const W = 300, scale = W / FRAME_W, H = Math.round(FRAME_H * scale);
  const [loaded, setLoaded] = useState(false);
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200, vh = typeof window !== "undefined" ? window.innerHeight : 800;
  // วางขวาของการ์ด · ไม่พอ = ซ้าย · ไม่พอทั้งคู่ (มือถือ) = ใต้การ์ด
  let left = anchor.right + 10, top = anchor.top;
  if (left + W + 12 > vw) left = anchor.left - W - 10;
  if (left < 8) { left = Math.max(8, Math.min(vw - W - 8, anchor.left)); top = anchor.bottom + 8; }
  top = Math.max(8, Math.min(vh - H - 52, top));
  return createPortal(
    <div className="fixed z-[1150] overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl" style={{ left, top, width: W + 12 }}
      onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500">
        <Icon value="i:eye" /><span className="min-w-0 flex-1 truncate">{t(`หน้าจริง · ${label}`, `Live page · ${label}`)}</span>
        <button type="button" onClick={onBig} className="rounded px-1.5 text-violet-700 hover:bg-violet-50">{t("ขยาย ↗", "Expand ↗")}</button>
      </div>
      <button type="button" onClick={onBig} title={t("กดเพื่อดูหน้าจริงตัวใหญ่", "Click for the large live view")}
        className="relative mx-1.5 mb-1.5 block overflow-hidden rounded-lg border border-slate-200 bg-slate-50" style={{ width: W, height: H }}>
        {!loaded && <span className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">{t("กำลังโหลดหน้า...", "Loading the page...")}</span>}
        <iframe src={embedUrl(href)} title={label} onLoad={() => setLoaded(true)} tabIndex={-1} aria-hidden="true"
          sandbox="allow-same-origin allow-scripts"
          style={{ width: FRAME_W, height: FRAME_H, transform: `scale(${scale})`, transformOrigin: "0 0", pointerEvents: "none", border: 0 }} />
      </button>
    </div>,
    document.body,
  );
}

/** ถ่ายภาพหน้าจอของหน้า (โหลดหน้าในกรอบที่ซ่อนไว้ → รอข้อมูลขึ้น → ถ่าย → อัปขึ้นคลัง) · คืน r2 key */
export async function captureCardImage(href: string): Promise<string> {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin allow-scripts");
  frame.style.cssText = `position:fixed;left:-${FRAME_W + 200}px;top:0;width:${FRAME_W}px;height:${FRAME_H}px;border:0;opacity:0;pointer-events:none`;
  frame.src = embedUrl(href);
  document.body.appendChild(frame);
  try {
    await new Promise<void>((ok, bad) => { frame.onload = () => ok(); setTimeout(() => bad(new Error("โหลดหน้านานเกินไป")), 25000); });
    await new Promise((r) => setTimeout(r, 2500));   // รอข้อมูลในหน้าขึ้นครบ
    const blob = await snapshotFrame(frame, []);
    const file = new File([blob], `flow-page-${Date.now()}.png`, { type: blob.type || "image/png" });
    return await uploadMediaFile(file, { folder: "flowchart-page-previews" });
  } finally { frame.remove(); }
}

/** ตัวจับเวลาชี้ค้าง (จอคอม): ชี้ 450ms = เปิด · ออก 250ms = ปิด (ย้ายเมาส์เข้าภาพได้ทัน) */
export function useHoverPeek(open: () => void, close: () => void) {
  const tm = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (tm.current) clearTimeout(tm.current); }, []);
  return {
    enter: () => { if (tm.current) clearTimeout(tm.current); tm.current = setTimeout(open, 450); },
    leave: () => { if (tm.current) clearTimeout(tm.current); tm.current = setTimeout(close, 250); },
    cancel: () => { if (tm.current) clearTimeout(tm.current); },
  };
}
