"use client";

/**
 * 📷 กล้องในเว็บ (ส่วนหนึ่งของ photo-capture) — เปิดกล้องในหน้าเว็บ มีเส้นกริด 3×3 + กรอบกลางช่วยถ่ายให้ตรง
 * - ถ่ายต่อเนื่องได้ (กดชัตเตอร์ได้เรื่อย ๆ · เห็นจำนวน + รูปล่าสุด) · สลับกล้องหน้า/หลัง · ใช้เว็บแคม PC ได้ด้วย
 * - กด "เสร็จ" = ส่งรูปทั้งหมดไปถาดตรวจรูป · ปิดหน้าต่าง = ปิดกล้องทันที (ไฟกล้องดับ)
 * - ข้อจำกัด: คุณภาพด้อยกว่าแอปกล้องจริงของมือถือ (ไม่มีแฟลช/โฟกัสครบ) · ต้องเป็น https + ผู้ใช้อนุญาตกล้อง
 */
import { useEffect, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";

export function WebCameraModal({ open, onClose, onShots, multiple = true, initialFacing = "environment", zIndex }: {
  open: boolean;
  zIndex?: number;
  initialFacing?: "environment" | "user";
  onClose: () => void;
  /** รูปที่ถ่าย (ส่งตอนกด "เสร็จ") */
  onShots: (files: File[]) => void;
  multiple?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">(initialFacing);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [shots, setShots] = useState<File[]>([]);
  const [last, setLast] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [grid, setGrid] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const [vdim, setVdim] = useState<{ w: number; h: number } | null>(null);
  const [bdim, setBdim] = useState<{ w: number; h: number } | null>(null);
  const readDim = () => { const v = videoRef.current; if (v?.videoWidth) setVdim({ w: v.videoWidth, h: v.videoHeight }); };
  useEffect(() => {
    const el = boxRef.current;
    if (!open || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setBdim({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, ready]);
  const shown = vdim && bdim ? (() => { const k = Math.min(bdim.w / vdim.w, bdim.h / vdim.h); return { w: Math.round(vdim.w * k), h: Math.round(vdim.h * k) }; })() : null;

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setReady(false); };

  useEffect(() => {
    if (!open) { stop(); return; }
    let alive = true;
    setErr(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        stop();
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        const v = videoRef.current;
        if (v) { v.srcObject = s; await v.play().catch(() => {}); setReady(true); }
      } catch (e) {
        const n = (e as { name?: string }).name;
        setErr(n === "NotAllowedError" ? "ยังไม่ได้อนุญาตให้ใช้กล้อง — กดรูปกุญแจข้างช่องที่อยู่เว็บ แล้วเปิดสิทธิ์กล้อง"
          : n === "NotFoundError" || n === "OverconstrainedError" ? "ไม่พบกล้องในเครื่องนี้"
          : "เปิดกล้องในเว็บไม่ได้ — ใช้ปุ่ม ถ่ายรูป (แอปกล้องของเครื่อง) แทน");
      }
    })();
    return () => { alive = false; };
  }, [open, facing]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!open) { setShots([]); setLast((u) => { if (u) URL.revokeObjectURL(u); return null; }); } }, [open]);
  useEffect(() => () => stop(), []);   // eslint-disable-line react-hooks/exhaustive-deps

  const snap = async () => {
    const v = videoRef.current;
    if (!v || !ready || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
    if (!blob) return;
    const f = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
    setFlash(true); setTimeout(() => setFlash(false), 120);
    setLast((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob); });
    if (!multiple) { finish([f]); return; }
    setShots((s) => [...s, f]);
  };
  const finish = (list = shots) => { stop(); if (list.length) onShots(list); onClose(); };

  return (
    <ERPModal open={open} onClose={() => { stop(); onClose(); }} title="กล้องในเว็บ" size="xl" zIndex={zIndex} hasUnsavedChanges={shots.length > 0}
      description="จัดแผ่นให้ขอบขนานกับเส้นกริด แล้วกดปุ่มกลมเพื่อถ่าย — ถ่ายต่อได้หลายรูป"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              className="h-9 px-3 text-sm rounded-lg border border-slate-200 hover:bg-slate-50"><Icon name="refresh" /> สลับกล้อง</button>
            <button type="button" onClick={() => setGrid((g) => !g)} aria-pressed={grid}
              className={`h-9 px-3 text-sm rounded-lg border ${grid ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 hover:bg-slate-50"}`}>เส้นกริด</button>
          </div>
          <button type="button" onClick={() => finish()} disabled={!shots.length}
            className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">เสร็จ ({shots.length} รูป)</button>
        </div>
      }>
      <div ref={boxRef} className="relative bg-black rounded-lg overflow-hidden flex items-center justify-center h-[62vh] min-h-[280px]">
        {/* กรอบภาพ = ขนาดภาพกล้องที่โชว์จริง (คำนวณจากสัดส่วนกล้อง × ขนาดกล่อง) → เส้นกริดทับภาพพอดี ไม่เลยไปที่ขอบดำ */}
        <div className="relative" style={shown ? { width: shown.w, height: shown.h } : { width: "100%", height: "100%" }}>
          <video ref={videoRef} playsInline muted className="w-full h-full object-contain" onLoadedMetadata={readDim} onResize={readDim}
            style={facing === "user" ? { transform: "scaleX(-1)" } : undefined} />
          {ready && grid && shown && (
            <div className="absolute inset-0 pointer-events-none">
              {[1, 2].map((i) => <span key={`v${i}`} className="absolute top-0 bottom-0 w-px bg-white/50" style={{ left: `${(i * 100) / 3}%` }} />)}
              {[1, 2].map((i) => <span key={`h${i}`} className="absolute left-0 right-0 h-px bg-white/50" style={{ top: `${(i * 100) / 3}%` }} />)}
              <span className="absolute border-2 border-dashed border-white/80 rounded" style={{ left: "8%", top: "8%", right: "8%", bottom: "8%" }} />
            </div>
          )}
        </div>
        {flash && <div className="absolute inset-0 bg-white/70" />}
        {err && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/90">{err}</div>}
        {!err && !ready && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">กำลังเปิดกล้อง…</div>}
        {ready && (
          <button type="button" onClick={() => void snap()} aria-label="ถ่ายรูป"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-white border-[5px] border-white/50 shadow-lg active:scale-95 transition" />
        )}
        {last && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={last} alt="" className="absolute bottom-4 right-4 w-14 h-14 object-cover rounded-lg border-2 border-white shadow" />
        )}
        {shots.length > 0 && <span className="absolute top-3 right-3 text-[12px] px-2 py-0.5 rounded-full bg-blue-600 text-white">{shots.length} รูป</span>}
      </div>
    </ERPModal>
  );
}
