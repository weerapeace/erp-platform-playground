"use client";

/**
 * "ดูหน้านี้แบบ iPhone / iPad" (ของกลาง) — หน้าต่างลอย ใช้ได้ทุกหน้าในเชลล์เว็บ ไม่ต้องแก้ทีละหน้า
 *
 * ที่อยู่ปุ่ม: เมนูโปรไฟล์ (AccountMenu → "อุปกรณ์และแอป") · โหมดแอป /app/<key> มีชุด "มุมมองอุปกรณ์" ของตัวเอง
 * 2026-11-17 (เจ้าของสั่ง "กดแล้วเป็นหน้าต่างลอยขึ้นมา จะได้ดูเทียบกันไปได้ด้วย"):
 *   เดิมเป็นกรอบเต็มจอที่ทำให้หน้าหลักมืด → ตอนนี้เป็นหน้าต่างลอย (ของกลาง FloatingPanel autoSize) ไม่บังหน้า PC
 *   ลากย้ายได้ · ย่อเก็บได้ · ใช้หน้า PC ต่อได้ระหว่างเปิด
 *   - เลือก iPhone / iPad · หมุนแนวนอน/แนวตั้ง · ย่อกรอบ 50 / 75 / 100% (iPad สูงกว่าจอโน้ตบุ๊ก)
 *   - เปลี่ยนหน้าบน PC → กรอบเปลี่ยนตามเอง · ปุ่มรีโหลด
 *   - จำตำแหน่ง (FloatingPanel storageKey) + เครื่อง/แนว/ขนาดที่เลือก (localStorage ต่อเครื่อง)
 * ข้างในเป็น <iframe> ของ URL เดิม + ?embed=1 (เชลล์ซ่อนเมนู เหมือนเปิดเป็นแอปจริง)
 * กติกาขนาด (ล้วน ทดสอบได้) = lib/device-preview.ts
 *
 *   <DevicePreviewModal open onClose />   — ตัวหน้าต่าง (ใช้ในเมนูโปรไฟล์ · ชื่อเดิมคงไว้ไม่ให้ที่เรียกพัง)
 *   <DevicePreviewButton />               — ปุ่ม + หน้าต่างในตัว (เผื่อหน้าอื่นอยากวางปุ่มเอง)
 */
import { useEffect, useRef, useState } from "react";
import { DeviceQrPanel, type DeviceLayout } from "@/components/device-view";
import { FloatingPanel } from "@/components/floating-panel";
import { Icon } from "@/components/icon";
import {
  DEVICE_PREVIEW_SIZE, DEVICE_PREVIEW_ZOOMS, autoZoom, devicePreviewDims, parseDevicePreviewPrefs,
  type DevicePreviewDevice, type DevicePreviewPrefs,
} from "@/lib/device-preview";

const PREFS_KEY = "device-preview-window";

/**
 * อ่าน URL จาก window (ไม่ใช้ useSearchParams)
 * ⚠️ เหตุผล: ตัวนี้อยู่ในเชลล์ซึ่งครอบ "ทุกหน้า" — useSearchParams จะบังคับให้ทุกหน้าต้องมี <Suspense> ไม่งั้น build ไม่ผ่านทั้งระบบ
 */
function currentEmbedUrl(): string {
  const q = new URLSearchParams(window.location.search);
  q.delete("device");   // ลิงก์เก่าที่ติด ?device= ไม่ต้องส่งเข้ากรอบ (ในกรอบหน้าดูจอจริงของกรอบเอง)
  q.set("embed", "1");
  return `${window.location.pathname}?${q.toString()}`;
}

function loadPrefs(): DevicePreviewPrefs {
  try { return parseDevicePreviewPrefs(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null")); } catch { return parseDevicePreviewPrefs(null); }
}

const SEG = (on: boolean) => `h-7 whitespace-nowrap rounded-md px-2 text-xs ${on ? "bg-white font-medium text-slate-800 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`;
const BTN = "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50";

export function DevicePreviewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [prefs, setPrefsState] = useState<DevicePreviewPrefs>(() => parseDevicePreviewPrefs(null));
  const [qr, setQr] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const lastHref = useRef("");

  useEffect(() => {
    if (!open) return;
    setPrefsState(loadPrefs());
    setQr(false);
    lastHref.current = window.location.pathname + window.location.search;
    setUrl(currentEmbedUrl());
    // เปลี่ยนหน้าบน PC → กรอบตาม (Next เปลี่ยนหน้าด้วย pushState ไม่มีอีเวนต์ จึงเช็ก URL ทุก ~0.8 วิ — เบามาก)
    const t = window.setInterval(() => {
      const href = window.location.pathname + window.location.search;
      if (href !== lastHref.current) { lastHref.current = href; setUrl(currentEmbedUrl()); }
    }, 800);
    return () => window.clearInterval(t);
  }, [open]);

  const setPrefs = (p: Partial<DevicePreviewPrefs>) => setPrefsState((cur) => {
    const next = { ...cur, ...p };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ไม่มี storage */ }
    return next;
  });

  if (!open || !url) return null;
  const { w, h } = devicePreviewDims(prefs.device, prefs.landscape);
  // ยังไม่เคยเลือกขนาด = เลือกให้พอดีความสูงจอ
  const zoom = prefs.zoom ?? autoZoom(h, window.innerHeight);
  const sw = Math.round(w * zoom), sh = Math.round(h * zoom);
  const qrLayout: DeviceLayout = prefs.device === "iphone" ? "phone" : "tablet";
  const label = DEVICE_PREVIEW_SIZE[prefs.device].label;

  return (
    <FloatingPanel open onClose={onClose} title={`ดูแบบ ${label}`} autoSize storageKey="device-preview"
      width={sw + 40} height={sh + 110}>
      <div className="space-y-2 bg-slate-50 p-2">
        {/* แถบเครื่องมือ */}
        <div className="flex flex-wrap items-center gap-1.5" style={{ maxWidth: Math.max(sw + 16, 320) }}>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {(Object.keys(DEVICE_PREVIEW_SIZE) as DevicePreviewDevice[]).map((d) => (
              <button key={d} type="button" onClick={() => setPrefs({ device: d })} className={SEG(prefs.device === d)}>{DEVICE_PREVIEW_SIZE[d].label}</button>
            ))}
          </div>
          <button type="button" onClick={() => setPrefs({ landscape: !prefs.landscape })} className={BTN} title="หมุนจอ">
            {prefs.landscape ? "แนวนอน" : "แนวตั้ง"}</button>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5" title="ย่อกรอบ (ตัวหนังสือในกรอบเล็กลงตาม)">
            {DEVICE_PREVIEW_ZOOMS.map((z) => (
              <button key={z} type="button" onClick={() => setPrefs({ zoom: z })} className={SEG(Math.abs(zoom - z) < 0.01)}>{Math.round(z * 100)}%</button>
            ))}
          </div>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={BTN} title="โหลดหน้าในกรอบใหม่" aria-label="รีโหลด"><Icon value="i:refresh" /></button>
          <button type="button" onClick={() => setQr((v) => !v)} className={`${BTN} ${qr ? "border-blue-300 bg-blue-50 text-blue-700" : ""}`} title="QR เปิดหน้านี้บนเครื่องจริง" aria-label="QR"><Icon value="i:qrcode" /></button>
          <a href={url} target="_blank" rel="noreferrer" className={BTN} title="เปิดในแท็บใหม่" aria-label="เปิดในแท็บใหม่"><Icon value="i:external-link" /></a>
          <span className="ml-auto text-[10px] tabular-nums text-slate-400">{w}×{h}</span>
        </div>
        <div className="flex items-start gap-2">
          {/* กรอบเครื่อง — iframe ขนาดจริง แล้วย่อด้วย scale (หน้าในยังเห็นจอเท่าเครื่องจริง) */}
          <div className="shrink-0 bg-slate-800 p-2" style={{ borderRadius: prefs.device === "iphone" ? 28 : 18 }}>
            <div className="overflow-hidden bg-white" style={{ width: sw, height: sh, borderRadius: prefs.device === "iphone" ? 20 : 10 }}>
              <iframe key={reloadKey} src={url} title={`ดูแบบ ${label}`} className="block border-0 bg-white"
                style={{ width: w, height: h, transform: `scale(${zoom})`, transformOrigin: "0 0" }} />
            </div>
          </div>
          {qr && <div className="w-[220px] shrink-0"><DeviceQrPanel layout={qrLayout} /></div>}
        </div>
      </div>
    </FloatingPanel>
  );
}

export function DevicePreviewButton({ collapsed }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        title="ดูหน้านี้แบบ iPhone / iPad (หน้าต่างลอย)"
        className={`flex items-center gap-2.5 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors w-full ${collapsed ? "px-0 justify-center" : "px-2.5"}`}>
        <Icon value="i:device-mobile" />
        {!collapsed && <span className="flex-1 text-left leading-tight">ดูแบบ iPhone/iPad</span>}
      </button>
      <DevicePreviewModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
