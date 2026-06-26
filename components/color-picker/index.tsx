"use client";

/**
 * ColorPicker / ColorInput — ของกลางเลือกสี (ลากได้ ใช้ง่ายกว่า <input type="color">)
 * - ColorPicker: แผง HSV (กล่อง saturation/value ลากได้ + แถบ hue ลากได้) + ช่อง hex
 * - ColorInput: ปุ่ม swatch + ช่องพิมพ์ hex/rgba → กดเปิด popover (portal ลอยทะลุ modal)
 *
 * ใช้แทน <input type="color"> ทุกที่ในระบบ (มาตรฐานกลาง)
 *   <ColorInput value={hex} onChange={setHex} />
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ── hex ↔ hsv ──
function clamp(n: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, n)); }
function normHex(v: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((v ?? "").trim());
  if (!m) return null;
  let h = m[1]; if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return "#" + h.toLowerCase();
}
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const n = normHex(hex) ?? "#000000";
  const r = parseInt(n.slice(1, 3), 16) / 255, g = parseInt(n.slice(3, 5), 16) / 255, b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return "#" + to(r) + to(g) + to(b);
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const hsv = hexToHsv(value);
  const [h, setH] = useState(hsv.h);
  const [s, setS] = useState(hsv.s);
  const [v, setV] = useState(hsv.v);
  const [hexText, setHexText] = useState(normHex(value) ?? "#000000");

  // sync เมื่อ value นอก เปลี่ยน (และไม่ตรงกับสีปัจจุบัน)
  useEffect(() => {
    const nh = normHex(value);
    if (nh && nh !== hsvToHex(h, s, v)) { const x = hexToHsv(nh); setH(x.h); setS(x.s); setV(x.v); setHexText(nh); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (nh: number, ns: number, nv: number) => { const hex = hsvToHex(nh, ns, nv); setHexText(hex); onChange(hex); };

  // ลาก: อ่าน element จาก e.currentTarget (ได้ตัวจริงเสมอ ไม่พึ่ง ref ที่ null ตอน render แรก)
  //       + setPointerCapture + window listener จน pointerup → ลากได้ลื่นทั้งกล่อง แม้เมาส์ออกนอกกรอบ
  const startDrag = (onPos: (px: number, py: number) => void) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch { /* บางเบราว์เซอร์ไม่รองรับ ก็ใช้ window listener แทน */ }
    const move = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      onPos(clamp((cx - r.left) / r.width), clamp((cy - r.top) / r.height));
    };
    move(e.clientX, e.clientY);
    const mv = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const onSv = startDrag((px, py) => { const ns = px, nv = 1 - py; setS(ns); setV(nv); emit(h, ns, nv); });
  const onHue = startDrag((px) => { const nh = px * 360; setH(nh); emit(nh, s, v); });

  return (
    <div className="w-56 select-none">
      <div onPointerDown={onSv} className="relative h-32 w-full rounded-md cursor-crosshair touch-none"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(h, 1, 1)})` }}>
        <span className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: hsvToHex(h, s, v) }} />
      </div>
      <div onPointerDown={onHue} className="relative mt-2 h-3 w-full rounded-full cursor-pointer touch-none"
        style={{ background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}>
        <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${(h / 360) * 100}%`, background: hsvToHex(h, 1, 1) }} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="h-7 w-7 shrink-0 rounded border border-slate-200" style={{ background: hsvToHex(h, s, v) }} />
        <input value={hexText} onChange={(e) => { setHexText(e.target.value); const nh = normHex(e.target.value); if (nh) { const x = hexToHsv(nh); setH(x.h); setS(x.s); setV(x.v); onChange(nh); } }}
          className="h-7 flex-1 min-w-0 px-2 text-xs font-mono border border-slate-200 rounded" />
      </div>
    </div>
  );
}

// ปุ่ม swatch + ช่องพิมพ์ + popover picker (ลอย portal) — ใช้แทน <input type="color"> + ช่อง hex
export function ColorInput({ value, onChange, allowText = true, invalid }: {
  value: string; onChange: (v: string) => void; allowText?: boolean; invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const compute = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect(); if (!r) return;
    const PANEL = 230, below = window.innerHeight - r.bottom;
    setPos({ left: Math.min(r.left, window.innerWidth - 240), top: below < PANEL ? r.top : r.bottom, up: below < PANEL });
  }, []);
  useLayoutEffect(() => { if (open) compute(); }, [open, compute]);
  useEffect(() => { if (!open) return; const h = () => compute(); window.addEventListener("scroll", h, true); window.addEventListener("resize", h); return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); }; }, [open, compute]);
  // ปิดเมื่อกด "นอกแผง" เท่านั้น (ใช้ pointerdown → กด/ลากในแผงไม่ปิด) + Esc — มาตรฐาน popover
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="flex items-center gap-1.5">
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)} title="เลือกสี (ลากได้)"
        className="h-8 w-9 shrink-0 rounded border border-slate-200 cursor-pointer" style={{ background: normHex(value) ?? (value || "#fff") }} />
      {allowText && (
        <input value={value} onChange={(e) => onChange(e.target.value)}
          className={`h-8 flex-1 min-w-0 px-2 text-xs font-mono border rounded ${invalid ? "border-rose-300 bg-rose-50" : "border-slate-200"}`} />
      )}
      {open && pos && createPortal(
        <div ref={panelRef} className="fixed z-[1001] bg-white border border-slate-200 rounded-lg shadow-xl p-2"
          style={{ left: pos.left, top: pos.top, transform: pos.up ? "translateY(calc(-100% - 4px))" : "translateY(4px)" }}>
          <ColorPicker value={normHex(value) ?? "#000000"} onChange={onChange} />
        </div>,
        document.body,
      )}
    </div>
  );
}
