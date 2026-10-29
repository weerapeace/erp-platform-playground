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
 * - <DeviceIframePreview>    : พรีวิว "ของจริง" — โหลดหน้าใน iframe ขนาดเครื่องจริง (เช่น IPAD_SIZE) แล้วย่อให้พอดีจอ
 *                              (useCanPreviewDevice / isInIframe กันครอบซ้ำ และไม่จำลองบนเครื่องจอสัมผัสจริง)
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
    // กันพลาด: บางเครื่อง/บางกรอบ (iframe, โหมดจำลองมือถือ) ความกว้างเปลี่ยนหลังโหลดโดยไม่ยิง resize
    // → ฟังจุดตัดจอด้วย matchMedia อีกชั้น + เช็กซ้ำหลังหน้าโหลดนิ่ง
    const mqs = [window.matchMedia(`(max-width: ${PHONE_MAX}px)`), window.matchMedia(`(max-width: ${TABLET_MAX}px)`)];
    mqs.forEach((m) => m.addEventListener("change", apply));
    const t = window.setTimeout(apply, 400);
    return () => {
      window.removeEventListener("resize", apply);
      mqs.forEach((m) => m.removeEventListener("change", apply));
      window.clearTimeout(t);
    };
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

/** iconSrc = รูปไอคอนที่เครื่องจะได้จริงตอนติดตั้ง (กติกาเดียวกับ /api/app-manifest + layout ของ /app/<key>) · customIcon = แอปตั้งไอคอนเองแล้ว */
export type AppLite = { key: string; label: string; icon: string | null; iconSrc: string; customIcon: boolean };
const SAFE_ICON_KEY = /^[a-zA-Z0-9._/-]+$/;
/** ไอคอนแอปที่ใช้ติดตั้ง: รูปที่อัปโหลด (R2) ถ้ามี ไม่งั้นไอคอนรวมของระบบ */
export function appIconSrc(iconUrl: string | null | undefined): string {
  return iconUrl && SAFE_ICON_KEY.test(iconUrl) ? `/api/r2-image?key=${encodeURIComponent(iconUrl)}` : "/icon-192.png";
}
const toAppLite = (a: { key: string; label: string; icon?: string | null; icon_url?: string | null }): AppLite =>
  ({ key: a.key, label: a.label, icon: a.icon ?? null, iconSrc: appIconSrc(a.icon_url), customIcon: !!(a.icon_url && SAFE_ICON_KEY.test(a.icon_url)) });

/**
 * แอปเดี่ยว (PWA) ที่มีหน้าปัจจุบันอยู่ในเมนู — จาก /api/menu + /api/menu/apps (แคชร่วมกับเชลล์ ไม่ยิงซ้ำ)
 * ใช้ทำ QR "ติดตั้งเป็นแอป": สแกน → /app/<key>?go=<หน้านี้> → กด 📲 ติดตั้งแอปที่หัวแอป
 */
export function useAppsForCurrentPage(): { apps: AppLite[]; preferred: string | null; all: AppLite[] } {
  const [apps, setApps] = useState<AppLite[]>([]);
  const [all, setAll] = useState<AppLite[]>([]);   // ทุกแอป (ใช้หาไอคอนของแอปที่เชลล์ส่งมาบังคับ)
  const [preferred, setPreferred] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let alive = true;
    const path = window.location.pathname;
    // ถ้าเปิดอยู่ในกรอบของแอปเดี่ยวอยู่แล้ว (/app/<key> ครอบ iframe) → เสนอแอปนั้นก่อน
    try { const m = window.top && window.top !== window ? window.top.location.pathname.match(/^\/app\/([^/?#]+)/) : null; if (m) setPreferred(m[1]); } catch { /* cross-origin */ }
    Promise.all([
      cachedGetJson<{ data?: { href: string; app_keys?: string[] | null; is_active?: boolean }[] }>("/api/menu"),
      cachedGetJson<{ data?: { key: string; label: string; icon?: string | null; icon_url?: string | null; is_active?: boolean }[] }>("/api/menu/apps"),
    ]).then(([mj, aj]) => {
      if (!alive) return;
      const base = (h: string) => h.split("?")[0];
      const rows = (mj.data ?? []).filter((m) => m.is_active !== false && base(m.href) !== "/" && path.startsWith(base(m.href)));
      rows.sort((a, b) => base(b.href).length - base(a.href).length);   // ตรงที่สุด (ยาวสุด) มาก่อน
      const keys = new Set(rows[0]?.app_keys ?? []);
      const active = (aj.data ?? []).filter((a) => a.is_active !== false);
      setAll(active.map(toAppLite));
      setApps(active.filter((a) => keys.has(a.key)).map(toAppLite));
    }).catch(() => { /* ไม่มีเมนู = ไม่มีปุ่มติดตั้ง */ });
    return () => { alive = false; };
  }, []);
  return { apps, preferred, all };
}

/** ตัวอย่าง "ไอคอนบนหน้าจอหลังติดตั้ง" — รูป/ชื่อเดียวกับที่เครื่องได้จริง (ชื่อยาวเกิน 12 ตัว Android ตัดเหลือ 12) */
export function HomeIconPreview({ app }: { app: AppLite }) {
  const shortName = app.label.length > 12 ? app.label.slice(0, 12) : app.label;
  const ghost = <span className="h-11 w-11 rounded-[22%] bg-white/60" aria-hidden />;
  return (
    <div className="w-full rounded-xl bg-gradient-to-b from-sky-100 to-indigo-100 px-3 pb-3 pt-2">
      <div className="mb-2 text-[10px] font-medium text-slate-500">หลังติดตั้ง ไอคอนบนหน้าจอจะเป็นแบบนี้</div>
      <div className="flex items-end justify-center gap-4">
        <span className="flex flex-col items-center gap-1">{ghost}<span className="h-2 w-8 rounded bg-white/60" /></span>
        <span className="flex flex-col items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={app.iconSrc} alt={`ไอคอนแอป ${app.label}`} className="h-14 w-14 rounded-[22%] bg-white object-cover shadow-md" />
          <span className="max-w-[5.5rem] truncate text-[11px] font-medium text-slate-800" title={app.label}>{shortName}</span>
        </span>
        <span className="flex flex-col items-center gap-1">{ghost}<span className="h-2 w-8 rounded bg-white/60" /></span>
      </div>
      {!app.customIcon && (
        <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[10px] leading-snug text-amber-700">
          แอปนี้ยังไม่ได้ตั้งไอคอนของตัวเอง → จะได้ไอคอนรวมของระบบ<br />(แอดมินตั้งได้ที่ จัดการเมนู → กด ✏️ ที่แอป → อัปโหลดไอคอน)
        </div>
      )}
    </div>
  );
}

/** ลิงก์ติดตั้งเป็นแอป: เปิดเชลล์แอปเดี่ยวแล้วเด้งมาหน้านี้ (?go=) — ในเชลล์มีปุ่ม 📲 ติดตั้งแอป */
export function installAppUrl(appKey: string, goPath?: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/app/${encodeURIComponent(appKey)}?go=${encodeURIComponent(goPath ?? window.location.pathname)}`;
}

/** ตัวเลือก QR เมื่อเรียกจากที่ที่รู้ลิงก์/แอปอยู่แล้ว (เช่น เชลล์แอปเดี่ยว /app/<key> ที่หน้าในอยู่ใน iframe) */
export type DeviceQrOpts = {
  openUrl?: string;      // ลิงก์ "เปิดหน้านี้" (ไม่ส่ง = เอาจาก URL ปัจจุบัน + ?device=)
  appKey?: string;       // บังคับแอปสำหรับ "ติดตั้งเป็นแอป" (ไม่ส่ง = หาจากเมนูที่มีหน้านี้)
  appLabel?: string;
  installGo?: string;    // path ที่จะเปิดหลังติดตั้ง (ไม่ส่ง = path ปัจจุบัน)
};
/** ส่วนเสริมของแผง (ป๊อปติดตั้งแอป components/install-app ใช้) */
type DeviceQrExtra = {
  defaultTab?: "open" | "install";   // แท็บที่เปิดมาก่อน (ไม่ส่ง = คอมเปิด "ติดตั้ง" · เครื่องอื่นเปิด "เปิดหน้านี้")
  /** ปุ่ม "ติดตั้งบนเครื่องนี้" ของแอปที่เลือก — วางใต้ชิปเลือกแอปในแท็บติดตั้ง (แทนปุ่มเปิดหน้าติดตั้งบนคอม) */
  renderInstallHere?: (app: AppLite, goPath?: string) => ReactNode;
};

/** แผง QR + ลิงก์ (ของกลาง) — แท็บ 1: สแกนเปิดหน้านี้บนเครื่องจริง · แท็บ 2: สแกนเพื่อติดตั้งเป็นแอป (PWA) บนเครื่อง
 *  layout = "desktop" (คอม): ไม่มี QR (คอมไม่สแกน) → ปุ่มเปิดหน้าติดตั้งบนคอมเครื่องนี้ + คัดลอกลิงก์ไปเปิดบนคอมเครื่องอื่น · เปิดมาที่แท็บติดตั้งก่อน */
export function DeviceQrPanel({ layout, className = "", openUrl: openUrlProp, appKey: appKeyProp, appLabel, installGo, defaultTab, renderInstallHere }: { layout: DeviceLayout; className?: string } & DeviceQrOpts & DeviceQrExtra) {
  const firstTab = defaultTab ?? (layout === "desktop" ? "install" : "open");
  const [tab, setTab] = useState<"open" | "install">(firstTab);
  useEffect(() => { setTab(firstTab); }, [firstTab]);
  const isDesktop = layout === "desktop";
  const [openUrl, setOpenUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const { apps: foundApps, preferred: foundPreferred, all: allApps } = useAppsForCurrentPage();
  // แอปที่ส่งมาบังคับ (จากเชลล์) ขึ้นก่อน แล้วค่อยแอปที่หาเจอจากเมนู · ไอคอนหาจากรายชื่อแอปทั้งหมด
  const apps = useMemo<AppLite[]>(() => {
    if (!appKeyProp || foundApps.some((a) => a.key === appKeyProp)) return foundApps;
    const forced = allApps.find((a) => a.key === appKeyProp) ?? { key: appKeyProp, label: appLabel ?? appKeyProp, icon: null, iconSrc: appIconSrc(null), customIcon: false };
    return [forced, ...foundApps];
  }, [foundApps, allApps, appKeyProp, appLabel]);
  const preferred = appKeyProp ?? foundPreferred;
  const [appKey, setAppKey] = useState<string | null>(null);
  useEffect(() => { setOpenUrl(openUrlProp ?? deviceShareUrl(layout)); }, [layout, openUrlProp]);
  useEffect(() => {
    if (apps.length === 0) { setAppKey(null); return; }
    setAppKey((k) => (k && apps.some((a) => a.key === k) ? k : (preferred && apps.some((a) => a.key === preferred) ? preferred : apps[0].key)));
  }, [apps, preferred]);
  const app = apps.find((a) => a.key === appKey) ?? null;
  const url = tab === "open" ? openUrl : (appKey ? installAppUrl(appKey, installGo) : "");
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

      {tab === "open" ? (isDesktop ? (
        <div className="w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-4 text-[11px] leading-snug text-slate-500">
          <div className="text-2xl mb-1">{DEVICE_ICON.desktop}</div>
          คัดลอกลิงก์ด้านล่างไปเปิดบนคอมเครื่องอื่น<br />จะเปิดหน้านี้ในมุมมองจอคอม
        </div>
      ) : (
        <>
          <QrCode text={url} size={168} className="border border-slate-100" alt={`QR เปิดหน้านี้บน${DEVICE_LABEL[layout]}`} logo={app?.customIcon ? app.iconSrc : null} />
          <div className="text-[11px] leading-snug text-slate-500">สแกน QR ด้วยกล้อง{DEVICE_LABEL[layout]}<br />จะเปิดหน้านี้ในโหมด{DEVICE_LABEL[layout]}ทันที</div>
        </>
      )) : apps.length === 0 ? (
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.iconSrc} alt="" className="mr-1 inline-block h-4 w-4 rounded-[22%] bg-white object-cover align-[-3px]" />{a.label}
                </button>
              ))}
            </div>
          )}
          {app && renderInstallHere && (
            <>
              {renderInstallHere(app, installGo)}
              <div className="flex w-full items-center gap-2 text-[11px] text-slate-400"><span className="h-px flex-1 bg-slate-200" />หรือติดตั้งบนเครื่องอื่น<span className="h-px flex-1 bg-slate-200" /></div>
            </>
          )}
          {isDesktop ? (
            <>
              {/* คอม: เปิดหน้าแอปเดี่ยวในแท็บใหม่ แล้วกดติดตั้งที่นั่น (manifest ของแอปนั้น = ได้ไอคอนแอปนั้น ไม่ใช่ทั้งระบบ) */}
              {!renderInstallHere && (
                <button type="button" disabled={!url} onClick={() => { if (url) window.open(url, "_blank", "noopener"); }}
                  className="h-10 w-full rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40">
                  {DEVICE_ICON.desktop} เปิดหน้าติดตั้งบนคอมเครื่องนี้ ↗
                </button>
              )}
              {app && <HomeIconPreview app={app} />}
              <div className="text-left text-[11px] leading-snug text-slate-500">
                <div className="mb-0.5 text-center font-semibold text-slate-700">ติดตั้งแอป &ldquo;{app?.label}&rdquo; บนคอม</div>
                1. กดปุ่มด้านบน (คอมเครื่องอื่น: คัดลอกลิงก์ไปเปิดใน Chrome / Edge)<br />
                2. กด <b>📲 ติดตั้งแอป</b> ที่หัวแอป หรือไอคอน <b>ติดตั้ง</b> ท้ายช่องที่อยู่เว็บ<br />
                &nbsp;&nbsp;&nbsp;(ไม่เห็นปุ่ม: เมนู ⋮ → &ldquo;ติดตั้งแอป&rdquo; · Mac Safari: ไฟล์ → &ldquo;เพิ่มไปที่ Dock&rdquo;)<br />
                3. ได้ไอคอนแอปบนเดสก์ท็อป / เมนู Start เปิดเป็นหน้าต่างแยก มาหน้านี้ได้เลย
              </div>
            </>
          ) : (
            <>
              {/* กลาง QR = ไอคอนแอป (แอปยังไม่ตั้งไอคอน = ใช้อีโมจิของแอปแทน) */}
              <QrCode text={url} size={168} className="border border-slate-100" alt={`QR ติดตั้งแอป ${app?.label ?? ""}`}
                logo={app?.customIcon ? app.iconSrc : null} logoText={app && !app.customIcon ? (app.icon ?? "📲") : null} />
              {app && <HomeIconPreview app={app} />}
              <div className="text-left text-[11px] leading-snug text-slate-500">
                <div className="mb-0.5 text-center font-semibold text-slate-700">ติดตั้งแอป &ldquo;{app?.label}&rdquo; บนเครื่อง</div>
                1. สแกน QR → เปิดในเบราว์เซอร์{DEVICE_LABEL[layout]}<br />
                2. กดปุ่ม <b>📲 ติดตั้งแอป</b> ที่หัวแอป<br />
                &nbsp;&nbsp;&nbsp;(iPhone/iPad: ปุ่มแชร์ → &ldquo;เพิ่มไปยังหน้าจอโฮม&rdquo;)<br />
                &nbsp;&nbsp;&nbsp;(มือถือ Samsung: ติดตั้งผ่าน <b>Chrome</b> — Samsung Internet จะโดน Google เตือนว่า &ldquo;Android เวอร์ชันเก่า&rdquo;)<br />
                3. ไอคอนแอปโผล่บนหน้าจอ เปิดแล้วมาหน้านี้ได้เลย
              </div>
            </>
          )}
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
export function DevicePreviewFrame({ layout, viewport, children, onExitPreview, qr }: { layout: DeviceLayout; viewport: DeviceLayout; children: ReactNode; onExitPreview?: () => void; qr?: DeviceQrOpts }) {
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
        <DeviceQrPanel layout={layout} {...qr} />
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

// ============================================================
// พรีวิว "ของจริง" ในกรอบเครื่อง — โหลดหน้า (src) ใน iframe ขนาดเท่าเครื่องจริง แล้วย่อทั้งกรอบให้พอดีจอ
//   ต่างจาก DevicePreviewFrame (ครอบ children ในหน้าเดียวกัน): ใน iframe เบรกพอยต์ / เมนู / แถบหัว ของทั้งหน้า
//   ทำงานเหมือนเปิดบนเครื่องนั้นจริง 100% และกดใช้งานในกรอบได้เลย
//   ⚠️ หน้าที่ถูกโหลดในกรอบต้องไม่ครอบกรอบซ้ำ — เช็กด้วย isInIframe()
// ============================================================

/** ขนาดจอ iPad (Air / 10.9–11") ตามที่ Safari เห็นจริง */
export const IPAD_SIZE = { landscape: { w: 1180, h: 820 }, portrait: { w: 820, h: 1180 } } as const;

/** หน้านี้ถูกเปิดอยู่ใน iframe (กรอบพรีวิว / เชลล์แอป / ป๊อปฝัง) หรือไม่ */
export function isInIframe(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.self !== window.top; } catch { return true; }
}

/** เครื่องนี้สมควรโชว์กรอบพรีวิวไหม — ไม่ใช่จอสัมผัส (iPad จริงไม่ต้องจำลอง) และไม่ได้อยู่ในกรอบอยู่แล้ว */
export function useCanPreviewDevice(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => { setOk(!isInIframe() && !window.matchMedia("(pointer: coarse)").matches); }, []);
  return ok;
}

export function DeviceIframePreview({ src, width, height, label, qr }: { src: string; width: number; height: number; label: string; qr?: DeviceQrOpts }) {
  const BEZEL = 20;   // ขอบเครื่อง 10px × 2
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!box) return;
    const fit = () => {
      const availW = box.clientWidth - 8;
      const availH = Math.max(360, window.innerHeight - Math.max(0, box.getBoundingClientRect().top) - 40);
      setScale(Math.min(1, availW / (width + BEZEL), availH / (height + BEZEL)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [box, width, height]);
  return (
    <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center">
      <div ref={setBox} className="flex w-full min-w-0 flex-1 flex-col items-center">
        <div className="mb-1.5 text-[11px] text-slate-500">{label} · {width}×{height}px{scale < 0.995 ? ` · ย่อเหลือ ${Math.round(scale * 100)}% ให้พอดีจอ` : ""}</div>
        <div style={{ width: (width + BEZEL) * scale, height: (height + BEZEL) * scale }}>
          <div className="origin-top-left overflow-hidden rounded-[1.75rem] border-[10px] border-slate-900 bg-white shadow-2xl"
            style={{ width: width + BEZEL, height: height + BEZEL, transform: `scale(${scale})` }} data-device-frame="iframe">
            <iframe src={src} title={label} className="block bg-white" style={{ width, height, border: 0 }} />
          </div>
        </div>
      </div>
      <div className="flex w-[232px] shrink-0 flex-col gap-2 lg:sticky lg:top-20">
        <DeviceQrPanel layout="tablet" {...qr} />
      </div>
    </div>
  );
}
