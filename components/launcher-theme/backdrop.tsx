"use client";
/**
 * 🎨 ชั้นพื้นหลังรูป + ของตกแต่งของหน้าแรก /apps (ของกลาง · กฎ lib/launcher-theme)
 *   - รูปพื้นหลัง: ชั้นแยกคงที่ทั้งจอ ปรับ ความชัด/ตำแหน่ง/ขนาด/ซูม
 *   - ของตกแต่ง: รูป/GIF/PNG/WebP วางเป็น % ของจอ · ท่าขยับ (CSS) · หลังการ์ด = ใต้เนื้อหา · หน้าการ์ด = ทับแต่กดทะลุได้
 *   - ซ่อนบนมือถือ (< 768px) ยกเว้นชิ้นที่ติ๊ก "โชว์บนมือถือ" · เครื่องตั้ง "ลดภาพเคลื่อนไหว" = ท่าขยับหยุด
 *   - editing = เปิดแผงแต่งอยู่: ทุกชิ้นยกขึ้นมา (z-61 ระหว่างแผ่นปิดแผง z-60 กับแผง z-62) ลากย้ายได้ (onChange x/y เป็น %)
 * ตัวห่อหน้าต้องเป็น `relative isolate` (ชั้น -z-10 จะอยู่ใต้เนื้อหาแต่เหนือพื้นของหน้า)
 */
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { r2ImageUrl } from "@/lib/r2-image";
import { bgImageLayer, type LauncherDecor, type LauncherTheme } from "@/lib/launcher-theme";

const ANIM_CSS = `
@keyframes lt-float{0%,100%{translate:0 0}50%{translate:0 -12px}}
@keyframes lt-sway{0%,100%{rotate:-8deg}50%{rotate:8deg}}
@keyframes lt-pulse{0%,100%{scale:1}50%{scale:1.12}}
@keyframes lt-spin{to{rotate:360deg}}
@keyframes lt-twinkle{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes lt-bounce{0%,100%{translate:0 0}30%{translate:0 -18px}60%{translate:0 0}}
.lt-a-float{animation:lt-float 3.2s ease-in-out infinite}
.lt-a-sway{animation:lt-sway 2.8s ease-in-out infinite;transform-origin:50% 10%}
.lt-a-pulse{animation:lt-pulse 2.2s ease-in-out infinite}
.lt-a-spin{animation:lt-spin 9s linear infinite}
.lt-a-twinkle{animation:lt-twinkle 2s ease-in-out infinite}
.lt-a-bounce{animation:lt-bounce 1.8s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.lt-anim{animation:none!important}}
`;

export function LauncherBackdrop({ theme, editing = false, selectedId, onSelect, onChange }: {
  theme: LauncherTheme & { decor: LauncherDecor[] };
  editing?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** ลากย้ายระหว่างแต่ง (x/y %) */
  onChange?: (id: string, patch: Pick<LauncherDecor, "x" | "y">) => void;
}) {
  const layer = bgImageLayer(theme, r2ImageUrl(theme.bgImage));
  const decor = theme.decor;

  const startDrag = (d: LauncherDecor) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    onSelect?.(d.id);
    const move = (ev: PointerEvent) => {
      const x = Math.min(100, Math.max(0, Math.round((ev.clientX / window.innerWidth) * 1000) / 10));
      const y = Math.min(100, Math.max(0, Math.round((ev.clientY / window.innerHeight) * 1000) / 10));
      onChange?.(d.id, { x, y });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const piece = (d: LauncherDecor) => {
    const url = r2ImageUrl(d.key);   // ไม่ขอย่อ — ย่อแล้ว GIF/WebP หยุดขยับ
    if (!url) return null;
    const sel = editing && d.id === selectedId;
    const style: CSSProperties = { left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, transform: "translate(-50%,-50%)", opacity: d.opacity / 100 };
    return (
      <div key={d.id} data-launcher-decor style={style} onPointerDown={editing ? startDrag(d) : undefined}
        className={`absolute ${d.mobile ? "" : "hidden md:block"} ${editing ? `pointer-events-auto cursor-grab touch-none rounded-md outline-dashed outline-offset-4 ${sel ? "outline-2 outline-violet-500" : "outline-1 outline-slate-400/70"}` : "pointer-events-none"}`}>
        <div style={{ rotate: `${d.rotate}deg` }}>
          <div className={d.anim !== "none" ? `lt-anim lt-a-${d.anim}` : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" draggable={false} className="block h-auto w-full select-none" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {decor.length > 0 && <style>{ANIM_CSS}</style>}
      {layer && (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0" style={layer} />
        </div>
      )}
      {decor.length > 0 && (editing ? (
        // แต่งอยู่: เหนือแผ่นปิดแผง (z-60) ใต้ตัวแผง (z-62) → ลากชิ้นได้ · กดที่ว่าง = ปิดแผงตามเดิม
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[61]">{decor.map(piece)}</div>
      ) : (
        <>
          <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">{decor.filter((d) => !d.front).map(piece)}</div>
          <div aria-hidden className="pointer-events-none fixed inset-0 z-[5]">{decor.filter((d) => d.front).map(piece)}</div>
        </>
      ))}
    </>
  );
}
