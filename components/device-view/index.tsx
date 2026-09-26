"use client";

/**
 * Device View (ของกลาง) — ให้หน้า dashboard/บอร์ด "เลือกดูแบบ จอคอม / แท็บเล็ต / มือถือ" ได้
 *
 * ประกอบด้วย
 * - useViewportLayout()      : จอที่เปิดอยู่จริงเป็นแบบไหน (phone < 640 · tablet < 1024 · desktop)
 * - useDeviceMode()          : โหมดที่ผู้ใช้เลือก (auto/desktop/tablet/phone) — ผูกกับ URL `?device=` เพื่อให้
 *                              "ลิงก์/QR" พาไปเปิดโหมดเดียวกันบนเครื่องจริงได้
 * - <DeviceModeToggle>       : ปุ่มสลับ 🖥️ / 📟 / 📱 (กดตัวที่เลือกอยู่ซ้ำ = กลับเป็นอัตโนมัติ)
 * - <DevicePreviewFrame>     : กรอบจำลองขนาดเครื่อง (ตอนเลือกดูแบบมือถือ/แท็บเล็ตบนจอที่กว้างกว่า)
 *                              + แผง QR "สแกนเพื่อเปิดหน้านี้บนเครื่องจริง"
 *
 * วิธีใช้ในหน้า:
 *   const viewport = useViewportLayout();
 *   const { mode, setMode, layout } = useDeviceMode(viewport);
 *   ... ใช้ `layout` ตัดสินคลาส/จำนวนคอลัมน์ (ห้ามใช้ sm:/lg: ของ Tailwind สำหรับส่วนที่อยากให้พรีวิวตรง เพราะมันดูจอจริง ไม่ดูกรอบ)
 *   return <DevicePreviewFrame layout={layout} viewport={viewport} mode={mode}>{body}</DevicePreviewFrame>;
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { QrCode } from "@/components/qr-code";

export type DeviceLayout = "desktop" | "tablet" | "phone";
export type DeviceMode = "auto" | DeviceLayout;

export const DEVICE_PARAM = "device";
export const DEVICE_FRAME_WIDTH: Record<DeviceLayout, number> = { desktop: 0, tablet: 834, phone: 400 };
export const DEVICE_LABEL: Record<DeviceLayout, string> = { desktop: "จอคอม", tablet: "แท็บเล็ต", phone: "มือถือ" };
export const DEVICE_ICON: Record<DeviceLayout, string> = { desktop: "🖥️", tablet: "📟", phone: "📱" };

const PHONE_MAX = 639;
const TABLET_MAX = 1023;

function layoutOfWidth(w: number): DeviceLayout {
  if (w <= PHONE_MAX) return "phone";
  if (w <= TABLET_MAX) return "tablet";
  return "desktop";
}

/** จอที่เปิดอยู่จริง (อัปเดตเมื่อหมุนจอ/ย่อหน้าต่าง) — เริ่มที่ desktop กันกระพริบตอน SSR */
export function useViewportLayout(): DeviceLayout {
  const [layout, setLayout] = useState<DeviceLayout>("desktop");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => setLayout(layoutOfWidth(window.innerWidth));
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
  return layout;
}

function readModeFromUrl(): DeviceMode {
  if (typeof window === "undefined") return "auto";
  const v = new URLSearchParams(window.location.search).get(DEVICE_PARAM);
  return v === "desktop" || v === "tablet" || v === "phone" ? v : "auto";
}

/** โหมดที่เลือก (ผูก URL ?device=) + layout ที่ต้องเรนเดอร์จริง */
export function useDeviceMode(viewport: DeviceLayout): { mode: DeviceMode; setMode: (m: DeviceMode) => void; layout: DeviceLayout } {
  const [mode, setModeState] = useState<DeviceMode>("auto");
  useEffect(() => { setModeState(readModeFromUrl()); }, []);
  const setMode = useCallback((m: DeviceMode) => {
    setModeState(m);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (m === "auto") url.searchParams.delete(DEVICE_PARAM); else url.searchParams.set(DEVICE_PARAM, m);
    window.history.replaceState(null, "", url.toString());
  }, []);
  const layout = mode === "auto" ? viewport : mode;
  return { mode, setMode, layout };
}

/** ลิงก์สำหรับเปิดหน้านี้บนเครื่องจริงในโหมดที่เลือก (ตัด embed=1 ของเชลล์แอปเดี่ยว + ตัด ?open= ออก) */
export function deviceShareUrl(layout: DeviceLayout): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.delete("embed");
  url.searchParams.delete("open");
  url.searchParams.set(DEVICE_PARAM, layout);
  return url.toString();
}

/** ปุ่มสลับโหมด 🖥️ / 📟 / 📱 — compact = ไอคอนอย่างเดียว (ใช้บนจอเล็ก) */
export function DeviceModeToggle({ mode, viewport, onChange, compact = false, className = "" }: {
  mode: DeviceMode; viewport: DeviceLayout; onChange: (m: DeviceMode) => void; compact?: boolean; className?: string;
}) {
  const layout = mode === "auto" ? viewport : mode;
  return (
    <div className={`flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 ${className}`} role="group" aria-label="เลือกรูปแบบจอ">
      {(["desktop", "tablet", "phone"] as DeviceLayout[]).map((d) => {
        const active = layout === d;
        const pinned = mode === d;   // เลือกไว้เอง (ไม่ใช่อัตโนมัติ)
        return (
          <button key={d} type="button"
            onClick={() => onChange(pinned ? "auto" : d)}
            title={pinned ? `ดูแบบ${DEVICE_LABEL[d]} (กดซ้ำ = กลับเป็นอัตโนมัติ)` : `ดูแบบ${DEVICE_LABEL[d]}`}
            className={`h-8 rounded px-2 text-xs font-medium transition ${active ? (pinned ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800") : "text-slate-600 hover:bg-slate-50"}`}>
            {DEVICE_ICON[d]}{!compact && <span className="ml-1">{DEVICE_LABEL[d]}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** แผง QR + ลิงก์ (ของกลาง) — สแกนแล้วเปิดหน้านี้บนเครื่องจริงในโหมดเดียวกัน */
export function DeviceQrPanel({ layout, className = "" }: { layout: DeviceLayout; className?: string }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setUrl(deviceShareUrl(layout)); }, [layout]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard ไม่พร้อม */ }
  };
  return (
    <div className={`flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm ${className}`}>
      <div className="text-sm font-semibold text-slate-800">{DEVICE_ICON[layout]} เปิดบน{DEVICE_LABEL[layout]}</div>
      <QrCode text={url} size={168} className="border border-slate-100" alt={`QR เปิดหน้านี้บน${DEVICE_LABEL[layout]}`} />
      <div className="text-[11px] leading-snug text-slate-500">สแกน QR ด้วยกล้อง{DEVICE_LABEL[layout]}<br />จะเปิดหน้านี้ในโหมด{DEVICE_LABEL[layout]}ทันที</div>
      <div className="max-w-[200px] truncate font-mono text-[10px] text-slate-400" title={url}>{url.replace(/^https?:\/\//, "")}</div>
      <button type="button" onClick={copy} className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
        {copied ? "✓ คัดลอกแล้ว" : "🔗 คัดลอกลิงก์"}
      </button>
    </div>
  );
}

/**
 * กรอบจำลองเครื่อง — โชว์เฉพาะตอน "โหมดที่เลือกแคบกว่าจอจริง" (เช่น เปิดบนจอคอมแล้วเลือกดูแบบมือถือ)
 * ถ้าเปิดบนมือถือจริงในโหมดมือถือ → ไม่มีกรอบ ไม่มี QR (เรนเดอร์ children ตรง ๆ)
 */
export function DevicePreviewFrame({ layout, viewport, children }: { layout: DeviceLayout; viewport: DeviceLayout; children: ReactNode }) {
  const rank: Record<DeviceLayout, number> = { phone: 0, tablet: 1, desktop: 2 };
  const preview = rank[layout] < rank[viewport];
  const width = DEVICE_FRAME_WIDTH[layout];
  const frameStyle = useMemo(() => ({ width, maxWidth: "100%" }), [width]);
  if (!preview) return <>{children}</>;
  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-center gap-4 px-3 py-4 lg:flex-row lg:items-start lg:justify-center lg:px-6">
      <div className="shrink-0 overflow-hidden rounded-[2rem] border-[10px] border-slate-900 bg-slate-100 shadow-2xl" style={frameStyle} data-device-frame={layout}>
        <div className="max-h-[82vh] overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
      <DeviceQrPanel layout={layout} className="w-[232px] shrink-0 lg:sticky lg:top-20" />
    </div>
  );
}
