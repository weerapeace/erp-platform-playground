"use client";

/**
 * ปุ่ม "ดูแบบมือถือ/แท็บเล็ต" (ของกลาง) — อยู่ท้ายเมนูซ้ายของ PlaygroundShell
 *
 * กดแล้วเปิดกรอบเครื่อง (iPhone/iPad) ครอบ "หน้าที่กำลังเปิดอยู่ตอนนั้น"
 *   → ใช้ได้ทุกหน้าทันที ไม่ต้องไปแก้ทีละหน้า
 * ข้างในเป็น <iframe> ของ URL เดิม + ?embed=1 (เชลล์จะซ่อนเมนู เหมือนเปิดเป็นแอปจริง)
 */
import { useState } from "react";
import { createPortal } from "react-dom";

type Device = "iphone" | "ipad";
const SIZE: Record<Device, { w: number; h: number; label: string }> = {
  iphone: { w: 390, h: 740, label: "iPhone" },
  ipad: { w: 768, h: 1000, label: "iPad" },
};

export function DevicePreviewButton({ collapsed }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");     // URL หน้าปัจจุบัน + embed=1 (เก็บตอนกดปุ่ม)
  const [device, setDevice] = useState<Device>("iphone");
  const [landscape, setLandscape] = useState(false);

  /**
   * อ่าน URL จาก window ตอนกด (ไม่ใช้ useSearchParams)
   * ⚠️ เหตุผล: component นี้อยู่ใน PlaygroundShell ซึ่งครอบ "ทุกหน้า" —
   *    useSearchParams จะบังคับให้ทุกหน้าต้องมี <Suspense> ไม่งั้น build ไม่ผ่านทั้งระบบ
   */
  const openPreview = () => {
    const q = new URLSearchParams(window.location.search);
    q.set("embed", "1");
    setUrl(`${window.location.pathname}?${q.toString()}`);
    setOpen(true);
  };

  const base = SIZE[device];
  const w = landscape ? base.h : base.w;
  const h = landscape ? base.w : base.h;

  return (
    <>
      <button type="button" onClick={openPreview}
        title="ดูหน้านี้แบบมือถือ / แท็บเล็ต"
        className={`flex items-center gap-2.5 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors w-full ${collapsed ? "px-0 justify-center" : "px-2.5"}`}>
        <span className="text-base leading-none">📱</span>
        {!collapsed && <span className="flex-1 text-left leading-tight">ดูแบบมือถือ/แท็บเล็ต</span>}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] bg-slate-900/70 flex flex-col items-center justify-center p-4 gap-3" onClick={() => setOpen(false)}>
          {/* แถบเครื่องมือ */}
          <div className="flex items-center gap-2 flex-wrap justify-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex rounded-lg overflow-hidden border border-white/30 text-sm">
              {(Object.keys(SIZE) as Device[]).map((d) => (
                <button key={d} onClick={() => setDevice(d)}
                  className={`h-8 px-3 ${device === d ? "bg-white text-slate-800 font-medium" : "bg-white/10 text-white hover:bg-white/20"}`}>
                  {d === "iphone" ? "📱" : "📟"} {SIZE[d].label}
                </button>
              ))}
            </div>
            <button onClick={() => setLandscape((v) => !v)}
              className="h-8 px-3 text-sm rounded-lg bg-white/10 text-white hover:bg-white/20 border border-white/30">
              {landscape ? "⟳ แนวตั้ง" : "⟲ แนวนอน"}
            </button>
            <span className="text-[11px] text-white/60 tabular-nums">{w}×{h}</span>
            <a href={url} target="_blank" rel="noreferrer"
              className="h-8 px-3 leading-8 text-sm rounded-lg bg-white/10 text-white hover:bg-white/20 border border-white/30">↗ เปิดแท็บใหม่</a>
            <button onClick={() => setOpen(false)}
              className="h-8 px-3 text-sm rounded-lg bg-white text-slate-800 font-medium hover:bg-slate-100">✕ ปิด</button>
          </div>

          {/* กรอบเครื่อง */}
          <div onClick={(e) => e.stopPropagation()}
            className="bg-slate-800 rounded-[2rem] p-3 shadow-2xl max-h-full overflow-auto"
            style={{ width: w + 24 }}>
            <iframe src={url} title="ดูแบบมือถือ"
              className="bg-white rounded-[1.4rem] border-0 block"
              style={{ width: w, height: h, maxHeight: "78vh" }} />
          </div>
          <p className="text-[11px] text-white/50">หน้าที่แสดง = หน้าที่คุณเปิดอยู่ตอนนี้ · กดพื้นหลังเพื่อปิด</p>
        </div>,
        document.body)}
    </>
  );
}
