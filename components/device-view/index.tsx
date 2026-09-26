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
import { cachedGetJson } from "@/lib/shell-cache";

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

type AppLite = { key: string; label: string; icon: string | null };

/**
 * แอปเดี่ยว (PWA) ที่มีหน้าปัจจุบันอยู่ในเมนู — จาก /api/menu + /api/menu/apps (แคชร่วมกับเชลล์ ไม่ยิงซ้ำ)
 * ใช้ทำ QR "ติดตั้งเป็นแอป": สแกน → /app/<key>?go=<หน้านี้> → กด 📲 ติดตั้งแอปที่หัวแอป
 */
export function useAppsForCurrentPage(): { apps: AppLite[]; preferred: string | null } {
  const [apps, setApps] = useState<AppLite[]>([]);
  const [preferred, setPreferred] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let alive = true;
    const path = window.location.pathname;
    // ถ้าเปิดอยู่ในกรอบของแอปเดี่ยวอยู่แล้ว (/app/<key> ครอบ iframe) → เสนอแอปนั้นก่อน
    try { const m = window.top && window.top !== window ? window.top.location.pathname.match(/^\/app\/([^/?#]+)/) : null; if (m) setPreferred(m[1]); } catch { /* cross-origin */ }
    Promise.all([
      cachedGetJson<{ data?: { href: string; app_keys?: string[] | null; is_active?: boolean }[] }>("/api/menu"),
      cachedGetJson<{ data?: { key: string; label: string; icon?: string | null; is_active?: boolean }[] }>("/api/menu/apps"),
    ]).then(([mj, aj]) => {
      if (!alive) return;
      const base = (h: string) => h.split("?")[0];
      const rows = (mj.data ?? []).filter((m) => m.is_active !== false && base(m.href) !== "/" && path.startsWith(base(m.href)));
      rows.sort((a, b) => base(b.href).length - base(a.href).length);   // ตรงที่สุด (ยาวสุด) มาก่อน
      const keys = new Set(rows[0]?.app_keys ?? []);
      setApps((aj.data ?? []).filter((a) => a.is_active !== false && keys.has(a.key)).map((a) => ({ key: a.key, label: a.label, icon: a.icon ?? null })));
    }).catch(() => { /* ไม่มีเมนู = ไม่มีปุ่มติดตั้ง */ });
    return () => { alive = false; };
  }, []);
  return { apps, preferred };
}

/** ลิงก์ติดตั้งเป็นแอป: เปิดเชลล์แอปเดี่ยวแล้วเด้งมาหน้านี้ (?go=) — ในเชลล์มีปุ่ม 📲 ติดตั้งแอป */
export function installAppUrl(appKey: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/app/${encodeURIComponent(appKey)}?go=${encodeURIComponent(window.location.pathname)}`;
}

/** แผง QR + ลิงก์ (ของกลาง) — แท็บ 1: สแกนเปิดหน้านี้บนเครื่องจริง · แท็บ 2: สแกนเพื่อติดตั้งเป็นแอป (PWA) บนเครื่อง */
export function DeviceQrPanel({ layout, className = "" }: { layout: DeviceLayout; className?: string }) {
  const [tab, setTab] = useState<"open" | "install">("open");
  const [openUrl, setOpenUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const { apps, preferred } = useAppsForCurrentPage();
  const [appKey, setAppKey] = useState<string | null>(null);
  useEffect(() => { setOpenUrl(deviceShareUrl(layout)); }, [layout]);
  useEffect(() => {
    if (apps.length === 0) { setAppKey(null); return; }
    setAppKey((k) => (k && apps.some((a) => a.key === k) ? k : (preferred && apps.some((a) => a.key === preferred) ? preferred : apps[0].key)));
  }, [apps, preferred]);
  const app = apps.find((a) => a.key === appKey) ?? null;
  const url = tab === "open" ? openUrl : (appKey ? installAppUrl(appKey) : "");
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard ไม่พร้อม */ }
  };
  return (
    <div className={`flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm ${className}`}>
      <div className="flex w-full items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
        {([["open", `${DEVICE_ICON[layout]} เปิดหน้านี้`], ["install", "📲 ติดตั้งเป็นแอป"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`h-7 flex-1 rounded text-[11px] font-medium transition ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
        ))}
      </div>

      {tab === "open" ? (
        <>
          <QrCode text={url} size={168} className="border border-slate-100" alt={`QR เปิดหน้านี้บน${DEVICE_LABEL[layout]}`} />
          <div className="text-[11px] leading-snug text-slate-500">สแกน QR ด้วยกล้อง{DEVICE_LABEL[layout]}<br />จะเปิดหน้านี้ในโหมด{DEVICE_LABEL[layout]}ทันที</div>
        </>
      ) : apps.length === 0 ? (
        <div className="flex h-[168px] w-[168px] items-center justify-center rounded-lg border border-dashed border-slate-200 p-3 text-[11px] leading-snug text-slate-400">
          หน้านี้ยังไม่อยู่ในแอปเดี่ยวใด<br />(ตั้งได้ที่ จัดการเมนู → ใส่หน้านี้ในแอป)
        </div>
      ) : (
        <>
          {apps.length > 1 && (
            <div className="flex flex-wrap justify-center gap-1">
              {apps.map((a) => (
                <button key={a.key} type="button" onClick={() => setAppKey(a.key)}
                  className={`h-7 rounded-full border px-2.5 text-[11px] font-medium ${appKey === a.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                  {a.icon ? `${a.icon} ` : ""}{a.label}
                </button>
              ))}
            </div>
          )}
          <QrCode text={url} size={168} className="border border-slate-100" alt={`QR ติดตั้งแอป ${app?.label ?? ""}`} />
          <div className="text-left text-[11px] leading-snug text-slate-500">
            <div className="mb-0.5 text-center font-semibold text-slate-700">ติดตั้งแอป &ldquo;{app?.label}&rdquo; บนเครื่อง</div>
            1. สแกน QR → เปิดในเบราว์เซอร์{DEVICE_LABEL[layout]}<br />
            2. กดปุ่ม <b>📲 ติดตั้งแอป</b> ที่หัวแอป<br />
            &nbsp;&nbsp;&nbsp;(iPhone/iPad: ปุ่มแชร์ → &ldquo;เพิ่มไปยังหน้าจอโฮม&rdquo;)<br />
            3. ไอคอนแอปโผล่บนหน้าจอ เปิดแล้วมาหน้านี้ได้เลย
          </div>
        </>
      )}

      <div className="max-w-[210px] truncate font-mono text-[10px] text-slate-400" title={url}>{url.replace(/^https?:\/\//, "")}</div>
      <button type="button" onClick={copy} disabled={!url} className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
        {copied ? "✓ คัดลอกแล้ว" : "🔗 คัดลอกลิงก์"}
      </button>
    </div>
  );
}

/**
 * กรอบจำลองเครื่อง — โชว์เฉพาะตอน "โหมดที่เลือกแคบกว่าจอจริง" (เช่น เปิดบนจอคอมแล้วเลือกดูแบบมือถือ)
 * ถ้าเปิดบนมือถือจริงในโหมดมือถือ → ไม่มีกรอบ ไม่มี QR (เรนเดอร์ children ตรง ๆ)
 */
export function DevicePreviewFrame({ layout, viewport, children, onExitPreview }: { layout: DeviceLayout; viewport: DeviceLayout; children: ReactNode; onExitPreview?: () => void }) {
  const rank: Record<DeviceLayout, number> = { phone: 0, tablet: 1, desktop: 2 };
  const preview = rank[layout] < rank[viewport];
  const width = DEVICE_FRAME_WIDTH[layout];
  const frameStyle = useMemo(() => ({ width, maxWidth: "100%" }), [width]);
  if (!preview) return <>{children}</>;
  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-center gap-4 px-3 py-4 lg:flex-row lg:items-start lg:justify-center lg:px-6">
      {/* transform บนกรอบ → ปุ่มลอย (position: fixed) ของหน้าข้างในยึดกับกรอบเครื่อง ไม่หลุดไปมุมจอจริง */}
      <div className="shrink-0 overflow-hidden rounded-[2rem] border-[10px] border-slate-900 bg-slate-100 shadow-2xl [transform:translateZ(0)]" style={frameStyle} data-device-frame={layout}>
        <div className="max-h-[82vh] overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
      <div className="flex w-[232px] shrink-0 flex-col gap-2 lg:sticky lg:top-20">
        <DeviceQrPanel layout={layout} />
        {/* กลับมุมมองจอคอม — เผื่อหน้าที่ไม่มีปุ่มสลับจอในตัว (เช่น หน้ารายละเอียดแบบมือถือ) */}
        {onExitPreview && (
          <button type="button" onClick={onExitPreview} className="h-9 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            {DEVICE_ICON[viewport]} กลับมุมมอง{DEVICE_LABEL[viewport]}
          </button>
        )}
      </div>
    </div>
  );
}
