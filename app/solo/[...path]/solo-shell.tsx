"use client";

/**
 * เชลล์ "แอปหน้าเดียว" /solo/<path> (กติกา lib/solo-page.ts)
 *   แถบบนบาง: ไอคอน + ชื่อหน้า · รีเฟรช · ติดตั้งแอป · ชื่อคนล็อกอิน
 *   เนื้อหา: หน้าจริงใน iframe (?embed=1 → PlaygroundShell ซ่อนเมนู/แถบแอป)
 *   กันออกนอกหน้า: ① ดักคลิกลิงก์ในกรอบ (ก่อน React/Next ได้รับ) ② ตรวจที่อยู่ในกรอบทุก 0.7 วิ (กันการพาไปด้วยโค้ด)
 *      → ไม่พาไป · เด้งแถบ "หน้านี้อยู่นอกแอป" + ปุ่มเปิดในเบราว์เซอร์
 *   ที่อยู่ลึกในหน้า (เช่น ?id=) สะท้อนขึ้นแถบที่อยู่ของแอป → รีเฟรชแล้วกลับมาที่เดิม
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AccessDenied, useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { InstallHereBanner, PWA_INSTALL_MSG } from "@/components/install-app";
import { usePwaInstall } from "@/components/pwa-install-button";
import { apiFetch } from "@/lib/api";
import { isInsideSolo, labelFromPath, matchMenuForPath, pagePathFromSegments, soloUrl, stripSearch } from "@/lib/solo-page";

type MenuLite = { href: string; label: string; icon: string | null; icon_url?: string | null; permission_key: string | null; is_active: boolean };

export function SoloShell() {
  const params = useParams();
  const pagePath = useMemo(() => pagePathFromSegments(params.path as string[] | undefined), [params.path]);
  const { user, ready, can, permsReady } = useAuth();
  const pwa = usePwaInstall();
  const [menu, setMenu] = useState<MenuLite | null>(null);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);   // ลิงก์ที่ออกนอกหน้า (รอถามเปิดในเบราว์เซอร์)
  const [nonce, setNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastOkRef = useRef<string>("");
  const [installAsk] = useState(() => { try { return new URLSearchParams(window.location.search).get("install") === "1"; } catch { return false; } });
  // ที่อยู่เริ่มต้นในกรอบ = หน้า + query ของแอป (ตัด install/embed) + embed=1
  const [startSrc] = useState(() => {
    if (!pagePath) return "";
    const q = new URLSearchParams(stripSearch(typeof window !== "undefined" ? window.location.search : ""));
    q.set("embed", "1");
    return `${pagePath}?${q.toString()}`;
  });

  useEffect(() => {
    let alive = true;
    apiFetch("/api/menu").then((r) => r.json()).then((j) => {
      if (!alive) return;
      const items = ((j.data ?? []) as MenuLite[]).filter((m) => m.is_active);
      setMenu(pagePath ? matchMenuForPath(items, pagePath) : null);
    }).catch(() => { /* ไม่มีเมนู = ใช้ชื่อจาก path */ }).finally(() => { if (alive) setMenuLoaded(true); });
    return () => { alive = false; };
  }, [pagePath]);

  // ชื่อแอปจาก manifest (สาธารณะ — ยังไม่ล็อกอินก็ได้ชื่อไทยจริง) · เมนูโหลดได้ทีหลัง = ใช้ชื่อเมนู
  const [publicName, setPublicName] = useState<string | null>(null);
  useEffect(() => {
    if (!pagePath) return;
    fetch(`/api/page-manifest${pagePath}`).then((r) => r.json()).then((j) => { if (typeof j?.name === "string") setPublicName(j.name); }).catch(() => undefined);
  }, [pagePath]);
  const label = menu?.label || publicName || (pagePath ? labelFromPath(pagePath) : "ERP");

  // สะท้อนที่อยู่ในกรอบขึ้นแถบที่อยู่ของแอป (ไม่รวม embed) → รีเฟรช/ติดตั้งแล้วกลับมาหน้าเดิม
  //   (สะท้อนเฉพาะ query ของหน้าหลัก เช่น ?id= · หน้าย่อยไม่สะท้อน กันตัวตนแอปเปลี่ยนเมื่อรีเฟรช)
  const mirror = useCallback((loc: Location) => {
    if (!pagePath || loc.pathname.replace(/\/+$/, "") !== pagePath) return;
    const next = soloUrl(pagePath, { search: loc.search });
    if (window.location.pathname + window.location.search !== next) window.history.replaceState(null, "", next);
  }, [pagePath]);

  // ② ตรวจที่อยู่ในกรอบเป็นระยะ — ออกนอกหน้า (เช่นโค้ดสั่ง router.push) = พากลับ + ถาม
  useEffect(() => {
    if (!pagePath) return;
    const t = setInterval(() => {
      const w = iframeRef.current?.contentWindow;
      if (!w) return;
      let loc: Location;
      try { loc = w.location; if (!loc.pathname || loc.href === "about:blank") return; } catch { return; }
      if (isInsideSolo(loc.pathname, pagePath)) {
        lastOkRef.current = loc.pathname + loc.search;
        mirror(loc);
        return;
      }
      setBlocked(loc.href);
      const back = lastOkRef.current || startSrc;
      try { w.location.replace(back.includes("embed=1") ? back : `${back}${back.includes("?") ? "&" : "?"}embed=1`); } catch { setNonce((n) => n + 1); }
    }, 700);
    return () => clearInterval(t);
  }, [pagePath, startSrc, mirror]);

  // ① ดักคลิกลิงก์ในกรอบ (capture ที่ document ของกรอบ → ทำงานก่อน React/Next Link)
  const onFrameLoad = useCallback(() => {
    if (!pagePath) return;
    let doc: Document | null = null;
    try { doc = iframeRef.current?.contentDocument ?? null; } catch { return; }
    if (!doc || (doc as Document & { __soloGuard?: boolean }).__soloGuard) return;
    (doc as Document & { __soloGuard?: boolean }).__soloGuard = true;
    doc.addEventListener("click", (e) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented) return;
      let u: URL;
      try { u = new URL(a.href, doc!.location.href); } catch { return; }
      if (!/^https?:$/.test(u.protocol)) return;                     // mailto:/tel: ปล่อยตามปกติ
      if (u.origin !== window.location.origin) {                      // เว็บนอก (เช่น Google Drive) → แท็บใหม่ ไม่ทับแอป
        if (a.target !== "_blank") { e.preventDefault(); e.stopPropagation(); window.open(u.href, "_blank", "noopener"); }
        return;
      }
      if (isInsideSolo(u.pathname, pagePath)) return;                 // ยังอยู่ในหน้านี้ (เช่น ?id=) = ไปได้
      e.preventDefault(); e.stopPropagation();
      setBlocked(u.href);
    }, true);
  }, [pagePath]);

  if (!pagePath) return <Center><div className="text-slate-500">ไม่พบหน้านี้</div></Center>;
  if (!ready) return <Center><div className="text-slate-400">กำลังเปิด…</div></Center>;
  if (!user) return (
    <Center>
      <div className="mb-3 text-slate-500">กรุณาเข้าสู่ระบบก่อนใช้งาน &ldquo;{label}&rdquo;</div>
      <Link href={`/login?next=${encodeURIComponent(soloUrl(pagePath))}`} className="h-10 rounded-lg bg-blue-600 px-5 font-medium leading-10 text-white">เข้าสู่ระบบ</Link>
    </Center>
  );
  if (menuLoaded && permsReady && menu?.permission_key && !can(menu.permission_key as Parameters<typeof can>[0])) {
    return <AccessDenied message={`คุณไม่มีสิทธิ์ใช้ "${label}"`} />;
  }

  const iconSrc = `/api/page-icon${pagePath}?s=192`;
  return (
    <div className="flex h-[100dvh] flex-col bg-white pt-[env(safe-area-inset-top)]">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 px-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconSrc} alt="" className="h-7 w-7 rounded-lg" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{label}</span>
        <button type="button" title="รีเฟรช" aria-label="รีเฟรช" onClick={() => { try { iframeRef.current?.contentWindow?.location.reload(); } catch { setNonce((n) => n + 1); } }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><Icon name="refresh" /></button>
        {!pwa.installed && (
          <button type="button" onClick={() => window.postMessage({ type: PWA_INSTALL_MSG }, window.location.origin)}
            className="hidden h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 sm:inline-flex">
            <Icon name="download" /> ติดตั้งแอป
          </button>
        )}
        <span className="hidden max-w-[10rem] truncate text-xs text-slate-500 sm:inline">{user.name}</span>
      </header>

      {blocked && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Icon name="warning" />
          <span className="min-w-0 flex-1">หน้านี้อยู่นอกแอป &ldquo;{label}&rdquo; — แอปนี้เปิดได้แค่หน้าเดียว</span>
          <button type="button" onClick={() => { window.open(blocked.replace(/([?&])embed=1(&|$)/, "$1").replace(/[?&]$/, ""), "_blank", "noopener"); setBlocked(null); }}
            className="rounded-md bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-700">เปิดในเบราว์เซอร์</button>
          <button type="button" onClick={() => setBlocked(null)} className="rounded-md px-2 py-1 text-amber-700 hover:bg-amber-100">ปิด</button>
        </div>
      )}

      <iframe ref={iframeRef} key={nonce} src={startSrc} title={label} onLoad={onFrameLoad} className="w-full flex-1 border-0" />

      <InstallHereBanner appLabel={label} iconSrc={iconSrc} autoShow={installAsk} />
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[100dvh] flex-col items-center justify-center p-6 text-center">{children}</div>;
}
