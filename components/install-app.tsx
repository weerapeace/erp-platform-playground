"use client";

/**
 * ติดตั้งแอป (ของกลาง) — ป๊อป "ติดตั้งแอป" ที่เปิดจากเมนู ⋯ ของหน้าไหนก็ได้
 *
 *   <InstallAppModal open onClose />     ป๊อป: ปุ่ม "ติดตั้งบนเครื่องนี้" + แผง QR/ลิงก์ติดตั้งบนเครื่องอื่น (DeviceQrPanel ตัวเดียวกับเมนูผู้ใช้)
 *   <InstallHereButton app goPath />     ปุ่มใหญ่ติดตั้งแอปที่เลือกบนเครื่องที่ใช้อยู่
 *   <InstallHereBanner ... />            การ์ดลอยในหน้าแอปเดี่ยว /app/<key> — เปิดมาจากปุ่มด้านบน (?install=1) ให้กดติดตั้งต่อ 1 ครั้ง
 *
 * ทำไมบางครั้งต้องกด 2 ครั้ง: เบราว์เซอร์ติดตั้งได้เฉพาะ "แอปของหน้าที่เปิดอยู่" (manifest ของหน้านั้น)
 *   หน้าปกติของระบบ (เช่น /master/work-board) ไม่ใช่หน้าของแอป "ผลิต" → ปุ่มพาไปหน้าแอปนั้นก่อน แล้วกดติดตั้งที่การ์ดอีกครั้ง
 *   อยู่ในแอปนั้นอยู่แล้ว = กดครั้งเดียวติดตั้งเลย · iPhone/iPad ติดตั้งจากปุ่มไม่ได้ (Apple ไม่อนุญาต) → บอกวิธี แชร์ → เพิ่มไปยังหน้าจอโฮม
 *   Samsung Internet → พาไปเปิดใน Chrome (ดู components/pwa-install-button)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { DeviceQrPanel, DEVICE_ICON, DEVICE_LABEL, installAppUrl, useViewportLayout, type AppLite, type DeviceLayout, type DeviceQrOpts } from "@/components/device-view";
import { IOS_INSTALL_HINT, SAMSUNG_INSTALL_HINT, UNSUPPORTED_INSTALL_HINT, openInChrome, usePwaInstall } from "@/components/pwa-install-button";

/** ข้อความที่ส่งจากหน้าใน iframe → เชลล์แอปเดี่ยว ให้เด้งติดตั้ง (เชลล์ฟังใน InstallHereBanner) */
export const PWA_INSTALL_MSG = "erp-pwa-install";

/** path ของหน้าต่างบนสุด (ในเชลล์แอปเดี่ยว หน้าจริงอยู่ใน iframe) */
function topPath(): string {
  try { return (window.top ?? window).location.pathname; } catch { return window.location.pathname; }
}
/** เปิดอยู่ในหน้าของแอปนี้แล้วไหม (/app/<key>) → ติดตั้งได้ในคลิกเดียว */
function inAppShell(appKey: string): boolean {
  const p = topPath();
  return p === `/app/${appKey}` || p.startsWith(`/app/${appKey}/`);
}

type HintKind = "ios" | "samsung" | "unsupported" | "installed" | "prompted" | null;
function HintBox({ kind, onChrome }: { kind: HintKind; onChrome?: () => void }) {
  if (!kind || kind === "prompted") return null;
  const text = kind === "ios" ? IOS_INSTALL_HINT : kind === "samsung" ? SAMSUNG_INSTALL_HINT : kind === "installed" ? "เปิดในโหมดแอปอยู่แล้ว — ติดตั้งบนเครื่องนี้แล้ว"
    : `${UNSUPPORTED_INSTALL_HINT} (ถ้าติดตั้งไว้แล้ว จะเห็นปุ่ม "เปิดในแอป" ท้ายช่องที่อยู่เว็บ)`;
  return (
    <div className="w-full space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[12px] leading-relaxed text-slate-600">
      <p>{text}</p>
      {kind === "samsung" && onChrome && (
        <button type="button" onClick={onChrome} className="h-9 w-full rounded-md bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700">เปิดใน Chrome แล้วกดติดตั้ง</button>
      )}
    </div>
  );
}

/** ปุ่มติดตั้งแอปที่เลือกบนเครื่องนี้ — อยู่ในแอปนั้นแล้ว = ติดตั้งทันที · ไม่ใช่ = พาไปหน้าแอปนั้น (?install=1) แล้วกดติดตั้งที่การ์ด */
export function InstallHereButton({ app, goPath }: { app: AppLite; goPath?: string }) {
  const pwa = usePwaInstall();
  const [hint, setHint] = useState<HintKind>(null);
  const [here, setHere] = useState(false);
  useEffect(() => { setHere(inAppShell(app.key)); setHint(null); }, [app.key]);
  const installedHere = pwa.installed && here;

  const go = () => {
    const url = `${installAppUrl(app.key, goPath)}&install=1`;
    try { (window.top ?? window).location.href = url; } catch { window.location.href = url; }
  };
  const click = async () => {
    if (pwa.isSamsung) { setHint("samsung"); return; }
    if (!here) { go(); return; }
    // ในเชลล์ของแอปนี้: หน้าต่างบนสุด = กดติดตั้งตรง ๆ · อยู่ใน iframe = ขอให้เชลล์เด้งติดตั้ง (การ์ดที่หัวแอป)
    if (window.top && window.top !== window) {
      try { window.top.postMessage({ type: PWA_INSTALL_MSG }, window.location.origin); setHint(null); } catch { go(); }
      return;
    }
    try { setHint(await pwa.install()); } catch { setHint("unsupported"); }
  };

  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <button type="button" onClick={() => void click()} disabled={installedHere}
        className={`flex h-11 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold ${installedHere ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
        <Icon name={installedHere ? "done" : "download"} />
        {installedHere ? `ติดตั้ง "${app.label}" บนเครื่องนี้แล้ว` : `ติดตั้ง "${app.label}" บนเครื่องนี้`}
      </button>
      {!installedHere && (
        <p className="text-center text-[11px] leading-snug text-slate-500">
          {pwa.isIOS ? "iPhone/iPad: จะพาไปหน้าแอป แล้วบอกวิธีเพิ่มไปยังหน้าจอโฮม"
            : here ? "กดแล้วเบราว์เซอร์จะถามยืนยันการติดตั้ง"
            : "จะพาไปหน้าแอปนี้ แล้วกด \"ติดตั้ง\" ที่การ์ดด้านล่างจออีกครั้ง (เบราว์เซอร์ติดตั้งได้จากหน้าของแอปเท่านั้น)"}
        </p>
      )}
      <HintBox kind={hint} onChrome={() => openInChrome(installAppUrl(app.key, goPath))} />
    </div>
  );
}

/** ป๊อปติดตั้งแอป — ติดตั้งบนเครื่องนี้ + QR/ลิงก์ติดตั้งบนเครื่องอื่น (แท็บเล็ต · มือถือ · คอม) */
export function InstallAppModal({ open, onClose, qr }: { open: boolean; onClose: () => void; qr?: DeviceQrOpts }) {
  const viewport = useViewportLayout();
  const [layout, setLayout] = useState<DeviceLayout>("tablet");
  useEffect(() => { if (open) setLayout(viewport); }, [open, viewport]);
  return (
    <ERPModal open={open} onClose={onClose} title="ติดตั้งแอป" size="sm" storageKey="install-app">
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full items-center gap-1 text-[12px] text-slate-500">
          <span className="shrink-0">เครื่องที่จะติดตั้ง:</span>
          <div className="flex flex-1 items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
            {(["tablet", "phone", "desktop"] as DeviceLayout[]).map((d) => (
              <button key={d} type="button" onClick={() => setLayout(d)}
                className={`h-8 flex-1 rounded px-2 text-xs font-medium transition ${layout === d ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{DEVICE_ICON[d]} {d === "desktop" ? "คอม" : DEVICE_LABEL[d]}</button>
            ))}
          </div>
        </div>
        <DeviceQrPanel layout={layout} {...qr} className="w-full" defaultTab="install"
          renderInstallHere={(app, goPath) => <InstallHereButton app={app} goPath={goPath} />} />
        <p className="text-center text-[11px] leading-snug text-slate-400">ติดตั้งบนเครื่องอื่น: สแกน QR หรือส่งลิงก์ไปเปิด (ต้องล็อกอินบนเครื่องนั้นครั้งแรก)</p>
      </div>
    </ERPModal>
  );
}

/**
 * การ์ดลอย "ติดตั้งแอปนี้บนเครื่องนี้" ในเชลล์แอปเดี่ยว — โผล่เมื่อเปิดมาด้วย ?install=1 (จากปุ่มด้านบน · เชลล์อ่านเองตอนเปิด ส่งมาเป็น autoShow)
 * หรือหน้าใน iframe ขอติดตั้ง (postMessage PWA_INSTALL_MSG) · ติดตั้งแล้ว/โหมดแอป = ไม่โผล่
 */
export function InstallHereBanner({ appLabel, iconSrc, autoShow = false }: { appLabel: string; iconSrc: string; autoShow?: boolean }) {
  const pwa = usePwaInstall();
  const [show, setShow] = useState(false);
  const [hint, setHint] = useState<HintKind>(null);
  const tryInstall = async () => {
    try { const r = await pwa.install(); setHint(r); if (r === "prompted") setShow(false); } catch { setHint("unsupported"); }
  };
  useEffect(() => {
    if (autoShow) setShow(true);
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as { type?: string } | null)?.type !== PWA_INSTALL_MSG) return;
      setShow(true);
      void tryInstall();   // คลิกในหน้า iframe นับเป็นการกดของหน้าต่างนี้ด้วย → ส่วนใหญ่เด้งกล่องติดตั้งได้เลย ไม่ได้ = กดที่การ์ด
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!show || pwa.installed) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[60] mx-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl sm:bottom-6">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconSrc} alt="" className="h-12 w-12 shrink-0 rounded-[22%] bg-white object-cover shadow" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-800">ติดตั้งแอป &ldquo;{appLabel}&rdquo;</div>
          <div className="text-[11px] leading-snug text-slate-500">{pwa.isIOS ? "กดปุ่มแชร์ของ Safari → เพิ่มไปยังหน้าจอโฮม" : "ได้ไอคอนบนหน้าจอ เปิดเหมือนแอป"}</div>
        </div>
        <button type="button" onClick={() => setShow(false)} aria-label="ปิด" className="h-8 w-8 shrink-0 rounded-lg text-xl leading-none text-slate-400 hover:bg-slate-100">×</button>
      </div>
      {!pwa.isIOS && (
        <button type="button" onClick={() => void (pwa.isSamsung ? setHint("samsung") : tryInstall())}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700">
          <Icon name="download" /> ติดตั้ง
        </button>
      )}
      <div className="mt-2"><HintBox kind={pwa.isIOS ? "ios" : hint} onChrome={() => openInChrome()} /></div>
    </div>
  );
}
