"use client";

/**
 * "ดูหน้านี้แบบมือถือ/แท็บเล็ต" (ของกลาง) — ใช้ได้ทุกหน้าในเชลล์เว็บ ไม่ต้องแก้ทีละหน้า
 *
 * ที่อยู่ปุ่ม: เมนูโปรไฟล์ (AccountMenu → "อุปกรณ์และแอป") — เจ้าของสั่งย้ายมาจากท้ายเมนูซ้าย 2026-11-16
 *   (โหมดแอป /app/<key> มีชุด "มุมมองอุปกรณ์" ของตัวเองในเมนูโปรไฟล์อยู่แล้ว)
 * กดแล้วเปิดกรอบเครื่อง (iPhone/iPad) ครอบ "หน้าที่กำลังเปิดอยู่ตอนนั้น"
 * ข้างในเป็น <iframe> ของ URL เดิม + ?embed=1 (เชลล์จะซ่อนเมนู เหมือนเปิดเป็นแอปจริง)
 *
 *   <DevicePreviewModal open onClose />   — ตัวกรอบ (ใช้ในเมนูโปรไฟล์)
 *   <DevicePreviewButton />               — ปุ่ม + กรอบในตัว (แบบเดิม เผื่อหน้าอื่นอยากวางปุ่มเอง)
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DeviceQrPanel, type DeviceLayout } from "@/components/device-view";

type Device = "iphone" | "ipad";
const SIZE: Record<Device, { w: number; h: number; label: string }> = {
  iphone: { w: 390, h: 740, label: "iPhone" },
  ipad: { w: 768, h: 1000, label: "iPad" },
};

/**
 * อ่าน URL จาก window ตอนเปิด (ไม่ใช้ useSearchParams)
 * ⚠️ เหตุผล: ตัวนี้อยู่ในเชลล์ซึ่งครอบ "ทุกหน้า" — useSearchParams จะบังคับให้ทุกหน้าต้องมี <Suspense> ไม่งั้น build ไม่ผ่านทั้งระบบ
 */
function currentEmbedUrl(): string {
  const q = new URLSearchParams(window.location.search);
  q.delete("device");   // ลิงก์เก่าที่ติด ?device= ไม่ต้องส่งเข้ากรอบ (ในกรอบหน้าดูจอจริงของกรอบเอง)
  q.set("embed", "1");
  return `${window.location.pathname}?${q.toString()}`;
}

export function DevicePreviewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [device, setDevice] = useState<Device>("iphone");
  const [landscape, setLandscape] = useState(false);
  const [qr, setQr] = useState(false);
  useEffect(() => { if (open) { setUrl(currentEmbedUrl()); setQr(false); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !url || typeof document === "undefined") return null;
  const base = SIZE[device];
  const w = landscape ? base.h : base.w;
  const h = landscape ? base.w : base.h;
  const qrLayout: DeviceLayout = device === "iphone" ? "phone" : "tablet";

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-slate-900/70 flex flex-col items-center justify-center p-4 gap-3" onClick={onClose}>
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
        <button onClick={() => setQr((v) => !v)}
          className={`h-8 px-3 text-sm rounded-lg border border-white/30 ${qr ? "bg-white text-slate-800" : "bg-white/10 text-white hover:bg-white/20"}`}>📷 QR เปิดบนเครื่องจริง</button>
        <a href={url} target="_blank" rel="noreferrer"
          className="h-8 px-3 leading-8 text-sm rounded-lg bg-white/10 text-white hover:bg-white/20 border border-white/30">↗ เปิดแท็บใหม่</a>
        <button onClick={onClose}
          className="h-8 px-3 text-sm rounded-lg bg-white text-slate-800 font-medium hover:bg-slate-100">✕ ปิด</button>
      </div>

      <div className="flex items-start gap-4 max-h-full" onClick={(e) => e.stopPropagation()}>
        {/* กรอบเครื่อง */}
        <div className="bg-slate-800 rounded-[2rem] p-3 shadow-2xl max-h-full overflow-auto" style={{ width: w + 24 }}>
          <iframe src={url} title="ดูแบบมือถือ"
            className="bg-white rounded-[1.4rem] border-0 block"
            style={{ width: w, height: h, maxHeight: "78vh" }} />
        </div>
        {/* QR สแกนเปิดหน้านี้บนเครื่องจริง (ของกลาง device-view) */}
        {qr && <div className="w-[232px] shrink-0"><DeviceQrPanel layout={qrLayout} /></div>}
      </div>
      <p className="text-[11px] text-white/50">หน้าที่แสดง = หน้าที่คุณเปิดอยู่ตอนนี้ · กดพื้นหลังหรือ Esc เพื่อปิด</p>
    </div>,
    document.body);
}

export function DevicePreviewButton({ collapsed }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        title="ดูหน้านี้แบบมือถือ / แท็บเล็ต"
        className={`flex items-center gap-2.5 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors w-full ${collapsed ? "px-0 justify-center" : "px-2.5"}`}>
        <span className="text-base leading-none">📱</span>
        {!collapsed && <span className="flex-1 text-left leading-tight">ดูแบบมือถือ/แท็บเล็ต</span>}
      </button>
      <DevicePreviewModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
