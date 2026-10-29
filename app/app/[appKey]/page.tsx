"use client";

/**
 * เชลล์เดี่ยวกลาง (standalone) /app/<appKey>
 * เปิด "โมดูลใหญ่ (App)" ใด ๆ เป็นแอปเดี่ยวบนมือถือ — เห็นแค่เมนูของ App นั้น
 * reuse หน้า master กลาง (MasterPage) ผ่าน ShellPresentContext (ไม่ซ้อน sidebar)
 * หมายเหตุ: /app/china-pay มีหน้า custom เฉพาะ (route นั้นชนะ dynamic นี้)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { ShellPresentContext } from "@/components/playground-shell";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { InstallHereBanner } from "@/components/install-app";
import { appIconSrc } from "@/components/device-view";
import { NotificationBell } from "@/components/notification-bell";
import { LangToggle } from "@/components/i18n";
import { AccountMenu } from "@/components/account-menu";
import { appHeaderStyle } from "@/lib/app-header-theme";
import { GlobalSearch } from "@/components/global-search";
import { getSearchScope } from "@/lib/search-scopes";
import { useSearchHotkey } from "@/lib/search-hotkey";
import { useViewportLayout, useDeviceMode, DevicePreviewFrame, type DeviceLayout } from "@/components/device-view";
import { menuVisibleTo } from "@/lib/menu-audience";
import { applyAppOverrides, menuPlace, moreLabelOf } from "@/lib/app-menu-layout";
import { FloatingDropdown } from "@/components/floating-dropdown";

// ⚙️ ตั้งค่าแอป (แอดมิน) — ใครเห็นเมนูไหน + หน้าตั้งค่าเฉพาะแอป · โหลดเมื่อกดครั้งแรก
const AppSettingsPanel = dynamic(() => import("@/components/app-settings-panel").then((m) => m.AppSettingsPanel), { ssr: false });
const MasterPage = dynamic(() => import("@/components/master-page").then((m) => m.MasterPage), {
  ssr: false, loading: () => <div className="p-8 text-center text-slate-400 text-sm">กำลังโหลด…</div>,
});

type MenuItem = { id: string; label: string; href: string; icon: string | null; icon_url?: string | null; app_keys: string[]; is_active: boolean; show_in_sidebar: boolean; sort_order: number; permission_key: string | null; parent_id?: string | null; section?: string; audience?: unknown; app_overrides?: unknown };
// ไอคอนเมนู: รูปอัปโหลด (icon_url) > อิโมจิ
function MItemIcon({ it, cls }: { it: MenuItem; cls: string }) {
  if (it.icon_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/r2-image?key=${encodeURIComponent(it.icon_url)}&w=64`} alt="" className={`${cls} object-contain shrink-0`} />;
  }
  return <span className={`text-xl flex-shrink-0`}>{it.icon ?? "•"}</span>;
}
type AppGroup = { id?: string; menu_more_label?: string | null; key: string; label: string; icon: string | null; icon_url?: string | null; permission_key: string | null; default_href: string | null; theme_color?: string | null; theme_color2?: string | null; header_image?: string | null; header_style?: string | null };
// ไอคอนแอป: รูปอัปโหลด (icon_url) > emoji
function AppIcon({ app, size = 22 }: { app: AppGroup | null; size?: number }) {
  if (app?.icon_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/r2-image?key=${encodeURIComponent(app.icon_url)}&w=64`} alt="" className="rounded object-contain shrink-0" style={{ width: size, height: size }} />;
  }
  return <span className="shrink-0 leading-none" style={{ fontSize: size }}>{app?.icon ?? "🧩"}</span>;
}

export default function StandaloneApp() {
  const appKey = String(useParams().appKey ?? "");
  // 🔍 ค้นหา — ถ้าแอปนี้ประกาศ scope ไว้ (lib/search-scopes) จะค้นเฉพาะของแอป ไม่งั้นค้นรวม · "/" หรือ Ctrl+K
  const [searchOpen, setSearchOpen] = useState(false);
  useSearchHotkey(useCallback((open?: boolean) => setSearchOpen((v) => (open === undefined ? !v : open)), []));
  const searchScope = getSearchScope(appKey)?.key;
  const { user, ready, can } = useAuth();
  const [app, setApp] = useState<AppGroup | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [active, setActive] = useState(0);
  const [allItems, setAllItems] = useState<MenuItem[]>([]);   // เมนูทั้งหมดของแอป (ไม่กรองตามคนดู) — ใช้ในหน้าตั้งค่า
  const [settingsOn, setSettingsOn] = useState(false);          // ⚙️ เปิดหน้าตั้งค่าอยู่
  const [menuRev, setMenuRev] = useState(0);                    // บันทึกตั้งค่าแล้ว → โหลดเมนูใหม่ (ข้ามแคช)
  const [loaded, setLoaded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);   // เปิด drawer เมนูของแอป (☰ iPad / "เพิ่มเติม" มือถือ)
  const [openMenu, setOpenMenu] = useState<string | null>(null);   // เมนูแม่ที่กำลังกาง dropdown (แถบบน จอกว้าง)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);          // ปุ่มรวมเมนู "เพิ่มเติม ▾" (แถบบน จอกว้าง)
  const moreBtnRef = useRef<HTMLSpanElement>(null);
  const closeMoreMenu = useCallback(() => setMoreMenuOpen(false), []);
  const initedRef = useRef(false);   // ตั้งหน้าเริ่มต้น (default landing) แค่ครั้งแรก
  const [deepSrc, setDeepSrc] = useState<string | null>(null);   // หน้าลึกที่จำไว้ (กัน refresh เด้งหน้าแรก)
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // เปิดมาจากปุ่ม "ติดตั้งบนเครื่องนี้" (?install=1) → การ์ดติดตั้งเด้ง · อ่านตอนเปิดครั้งแรก (?go จะล้าง URL ทีหลัง)
  const [installAsk] = useState(() => { try { return new URLSearchParams(window.location.search).get("install") === "1"; } catch { return false; } });
  const lastSavedRef = useRef<string>("");
  const stripEmbed = (p: string) => p.replace(/([?&])embed=1(&?)/, (_m, p1, p2) => (p2 ? p1 : "")).replace(/[?&]$/, "");
  // มุมมองอุปกรณ์ (เมนูผู้ใช้ → 📟): เลือกแท็บเล็ต/มือถือบนจอคอม = ครอบเนื้อหาด้วยกรอบจำลอง (ของกลาง device-view, ผูก ?device=)
  // หน้าในอยู่ใน iframe กว้าง 834/400px → media query ของหน้านั้นทำงานเหมือนเครื่องจริง
  const viewport = useViewportLayout();
  const { mode: devMode, setMode: setDevMode, layout: devLayout } = useDeviceMode(viewport);
  const devRank: Record<DeviceLayout, number> = { phone: 0, tablet: 1, desktop: 2 };
  const devPreview = devRank[devLayout] < devRank[viewport];

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch(menuRev ? `/api/menu/apps?_=${menuRev}` : "/api/menu/apps").then((r) => r.json()),
      apiFetch(menuRev ? `/api/menu?_=${menuRev}` : "/api/menu").then((r) => r.json()),
    ]).then(([aj, mj]) => {
      if (!alive) return;
      const ag = (aj.data ?? []).find((x: AppGroup) => x.key === appKey) ?? null;
      setApp(ag);
      // เมนูของแอปนี้ เรียง/ตั้งชื่อตามที่แอปนี้ตั้งไว้ (↕️ จัดเรียง/ซ่อนเมนู — lib/app-menu-layout)
      const appRows = applyAppOverrides(((mj.data ?? []) as MenuItem[]).filter((m) => m.is_active && m.show_in_sidebar && (m.app_keys ?? []).includes(appKey)), appKey);
      setAllItems(appRows);
      // ซ่อนในแอปนี้ → ตัดออก (เมนูย่อยของเมนูที่ซ่อนหายตาม)
      const hiddenIds = new Set(appRows.filter((m) => menuPlace(m, appKey) === "hidden").map((m) => m.id));
      const its = appRows
        .filter((m) => !hiddenIds.has(m.id) && !(m.parent_id && hiddenIds.has(m.parent_id))
          && (!m.permission_key || can(m.permission_key as Parameters<typeof can>[0]))
          && menuVisibleTo(m.audience, user));   // 👁 ใครเห็นเมนูไหน (ตั้งที่ ⚙️ ตั้งค่า)
      setItems(its);
      // ครั้งแรกครั้งเดียว: คืนหน้าลึกที่จำไว้ (กัน refresh เด้งหน้าแรก) ไม่งั้นใช้ default landing
      if (!initedRef.current) {
        const saved = (() => { try { return sessionStorage.getItem(`appdeep:${appKey}`); } catch { return null; } })();
        const base = (h: string) => h.split("?")[0];
        const deepIdx = saved ? its.findIndex((m) => base(saved).startsWith(base(m.href))) : -1;
        // ลิงก์ลึกจาก URL `/app/<key>?go=/path` (เช่น QR "ติดตั้งเป็นแอป" ของ device-view) → เปิดเมนูที่ตรงกับ path นั้น (ตัวที่ href ยาวสุด = ตรงที่สุด)
        // มาก่อนหน้าที่จำไว้ · ล้าง ?go ออกจาก URL หลังใช้ (refresh แล้วไม่เด้งซ้ำ)
        const go = (() => { try { const g = new URLSearchParams(window.location.search).get("go"); return g && g.startsWith("/") && !g.startsWith("//") ? g : null; } catch { return null; } })();
        let goIdx = -1;
        if (go) its.forEach((m, i) => { const b = base(m.href); if (b !== "/" && base(go).startsWith(b) && (goIdx < 0 || b.length > base(its[goIdx].href).length)) goIdx = i; });
        if (go && goIdx >= 0) {
          setActive(goIdx); setDeepSrc(go); lastSavedRef.current = go;
          try { sessionStorage.setItem(`appdeep:${appKey}`, go); } catch { /* noop */ }
          try { window.history.replaceState(null, "", `/app/${appKey}`); } catch { /* noop */ }
        }
        else if (saved && deepIdx >= 0) { setActive(deepIdx); setDeepSrc(saved); lastSavedRef.current = saved; }
        else if (ag?.default_href) { const i = its.findIndex((m) => m.href === ag.default_href); if (i >= 0) setActive(i); }
      }
      initedRef.current = true;
      setLoaded(true);
    }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
    // ใช้ ready (boolean ที่ flip ครั้งเดียว) ไม่ใช่ can (อาจเปลี่ยน reference) เพื่อกัน fetch วนไม่จบ
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [appKey, ready, menuRev]);

  // จำหน้าลึกในกรอบ (iframe) ทุก 1.5วิ → refresh แล้วกลับมาหน้าเดิม (ฝั่ง browser ล้วน ไม่กิน CPU worker)
  useEffect(() => {
    const c = items[active];
    if (!c || c.href.startsWith("/m/")) return; // เฉพาะหน้า custom (ใช้ iframe)
    const id = setInterval(() => {
      try {
        const w = iframeRef.current?.contentWindow;
        if (!w) return;
        const path = stripEmbed(w.location.pathname + w.location.search);
        if (path && path !== lastSavedRef.current) { lastSavedRef.current = path; sessionStorage.setItem(`appdeep:${appKey}`, path); }
      } catch { /* ยังไม่พร้อม/อ่านไม่ได้ */ }
    }, 1500);
    return () => clearInterval(id);
  }, [appKey, active, items]);

  // ปิด dropdown เมนูแม่เมื่อคลิกนอกแถบเมนู (เว้นในแถบ/ใน dropdown เอง)
  useEffect(() => {
    if (!openMenu) return;
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-appmenu]")) setOpenMenu(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [openMenu]);

  if (!ready) return <AppLoading />;
  if (!user) return (
    <Center>
      <div className="text-slate-500 mb-3">กรุณาเข้าสู่ระบบก่อนใช้งาน</div>
      <Link href={`/login?next=/app/${appKey}`} className="h-10 px-5 leading-10 bg-blue-600 text-white rounded-lg font-medium">เข้าสู่ระบบ</Link>
    </Center>
  );

  // ยังโหลดเมนู/สิทธิ์ไม่เสร็จ → โชว์หน้าโหลด (กัน empty state "ยังไม่มีรายการ" เด้งแว้บตอนยังโหลดไม่จบ)
  if (!loaded) return <AppLoading label={app?.label} icon={app?.icon} />;

  // กั้นเข้าแอปตามสิทธิ์ — แอปตั้ง permission_key แล้ว user ไม่มีสิทธิ์ → เข้าไม่ได้ (กันพิมพ์ URL ตรง)
  if (app?.permission_key && !can(app.permission_key as Parameters<typeof can>[0])) return (
    <Center>
      <div className="text-4xl mb-2">🔒</div>
      <div className="text-slate-700 font-medium mb-1">คุณไม่มีสิทธิ์เข้าแอปนี้</div>
      <div className="text-slate-400 text-sm mb-3">{app.label} · ต้องมีสิทธิ์ <code className="bg-slate-100 px-1 rounded">{app.permission_key}</code></div>
      <Link href="/apps" className="h-10 px-5 leading-10 bg-slate-100 text-slate-700 rounded-lg font-medium">← กลับหน้ารวมแอป</Link>
    </Center>
  );

  const cur = items[active];
  const canAdmin = can("admin.users");
  const showSettings = settingsOn && canAdmin;
  const activeId = showSettings ? undefined : cur?.id;
  // ---- เมนูซ้อนชั้น (nested / dropdown) ----
  // เมนูหลัก = ไม่มีแม่ หรือแม่ไม่อยู่ในลิสต์ (เช่นแม่ถูกซ่อน) · ลูก = จัดตาม parent_id
  const idInList = new Set(items.map((it) => it.id));
  const topLevel = items.filter((it) => !it.parent_id || !idInList.has(it.parent_id));
  const kidsOf = (pid: string) => items.filter((it) => it.parent_id === pid);
  const gotoItem = (it: MenuItem) => goto(items.indexOf(it));
  // เมนูแม่กำลัง active ไหม (หน้าที่เปิดอยู่เป็นลูกของมัน)
  const isParentActive = (it: MenuItem) => activeId === it.id || kidsOf(it.id).some((k) => k.id === activeId);
  // จัดลูกเป็นกลุ่มตามหมวด (หัวข้อใน dropdown) — คงลำดับตาม sort_order
  const groupKids = (pid: string) => {
    const m = new Map<string, MenuItem[]>();
    for (const k of kidsOf(pid)) { const key = k.section || "อื่น ๆ"; const a = m.get(key) ?? []; a.push(k); m.set(key, a); }
    return [...m.entries()];
  };
  // เมนูที่เป็นตารางข้อมูล (/m/<entity>) → MasterPage · เมนูหน้า custom อื่น → โหลดหน้าจริงผ่าน iframe
  const isMasterItem = !!cur && cur.href.startsWith("/m/");
  const moduleKey = isMasterItem ? cur!.href.replace(/^\/m\//, "").split("?")[0] : null;

  // ↕️ เมนูบนแถบ vs รวมในปุ่ม "เพิ่มเติม ▾" (ตั้งที่ ⚙️ → จัดเรียง/ซ่อนเมนู — lib/app-menu-layout)
  const barTop = topLevel.filter((it) => menuPlace(it, appKey) !== "more");
  const moreTop = topLevel.filter((it) => menuPlace(it, appKey) === "more");
  const moreLabel = moreLabelOf(app);
  const inMoreActive = moreTop.some((it) => isParentActive(it));   // หน้าที่เปิดอยู่เป็นเมนูในปุ่มรวม → ไฮไลต์ปุ่ม + บอกชื่อหน้า
  // แถบล่าง (มือถือ): เมนูบนแถบก่อน · เกิน 5 หรือมีเมนูที่รวมไว้ → 4 ตัวแรก + ปุ่ม "เพิ่มเติม" เปิด drawer เลือกที่เหลือ
  const hasMore = barTop.length > 5 || moreTop.length > 0;
  const barItems = hasMore ? barTop.slice(0, 4) : barTop.slice(0, 5);
  const barCols = barItems.length + (hasMore ? 1 : 0);
  // เมนูที่กำลังเปิดอยู่ในแถบล่างไหม (นับลูกของเมนูแม่ด้วย) — ไม่งั้น highlight ปุ่มเพิ่มเติม
  const onBar = barItems.some((it) => it.id === activeId || kidsOf(it.id).some((k) => k.id === activeId));

  // กดเมนู → ไปหน้าหลักของเมนูนั้น (ล้างหน้าลึกที่จำไว้)
  const goto = (i: number) => { setSettingsOn(false); setActive(i); setDeepSrc(null); lastSavedRef.current = ""; try { sessionStorage.removeItem(`appdeep:${appKey}`); } catch { /* noop */ } setMoreOpen(false); };
  // หน้า custom โหลดผ่าน iframe → ส่ง embed=1 ให้ shell ในหน้านั้นซ่อน sidebar/แถบ App ของตัวเอง (กันเมนูซ้อน)
  // ถ้ามีหน้าลึกที่จำไว้และเป็นของเมนูนี้ → เปิดหน้าลึกนั้น (กัน refresh เด้งหน้าแรก)
  const baseHref = cur ? cur.href.split("?")[0] : "";
  const startHref = (deepSrc && cur && deepSrc.split("?")[0].startsWith(baseHref)) ? deepSrc : (cur?.href ?? "");
  const embedSrc = cur ? `${startHref}${startHref.includes("?") ? "&" : "?"}embed=1` : "";

  const closeDrawer = () => setMoreOpen(false);

  return (
    // h-dvh + flex column: header บน · เนื้อหาเต็มกว้าง · เมนูแบบพับ-ขยาย (iPad: ☰ drawer ซ้าย · มือถือ: แถบล่าง)
    <div className="h-[100dvh] flex flex-col bg-slate-100 overflow-hidden">
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} scope={searchScope} />
      <InstallHereBanner appLabel={app?.label ?? appKey} iconSrc={appIconSrc(app?.icon_url)} autoShow={installAsk} />
      <header className="relative flex-shrink-0 z-20 text-white px-3 sm:px-4"
        style={{ ...appHeaderStyle(app ?? {}), paddingTop: "env(safe-area-inset-top)" }}>
        <div className="py-2.5 flex items-center gap-2 w-full min-w-0">
          {/* ปุ่มเมนู (จอกว้าง) — ใช้ตอนเมนูเยอะ/มือถือใช้แถบล่าง */}
          {items.length > 0 && (
            <button onClick={() => setMoreOpen(true)} aria-label="เปิดเมนู"
              className="md:hidden flex items-center justify-center h-9 w-9 -ml-1 rounded-lg hover:bg-white/15 text-xl flex-shrink-0">☰</button>
          )}
          <AppIcon app={app} size={24} />
          <div className="font-semibold text-lg truncate flex-shrink-0 max-w-[40vw] md:max-w-none">{app?.label ?? appKey}</div>

          {/* เมนูเป็นแท็บบนแถบ (จอกว้าง) — เลื่อนได้ถ้าเยอะ · เมนูแม่กดเปิด dropdown */}
          {topLevel.length > 0 && (
            <nav data-appmenu className="hidden md:flex items-center gap-0.5 ml-2 overflow-x-auto scrollbar-hide flex-1 min-w-0">
              {barTop.map((it) => {
                const kids = kidsOf(it.id);
                if (kids.length === 0) {
                  return (
                    <button key={it.id} onClick={() => { setOpenMenu(null); gotoItem(it); }} title={it.label}
                      className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-sm whitespace-nowrap transition-colors ${activeId === it.id ? "bg-white/25 font-semibold" : "text-white/85 hover:bg-white/12"}`}>
                      <MItemIcon it={it} cls="w-4 h-4" /> {it.label}
                    </button>
                  );
                }
                const on = openMenu === it.id;
                return (
                  <button key={it.id} onClick={() => setOpenMenu(on ? null : it.id)} title={it.label}
                    className={`shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-sm whitespace-nowrap transition-colors ${on || isParentActive(it) ? "bg-white/25 font-semibold" : "text-white/85 hover:bg-white/12"}`}>
                    <MItemIcon it={it} cls="w-4 h-4" /> {it.label}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${on ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                );
              })}
              {/* ⋯ ปุ่มรวมเมนูที่ไม่ค่อยใช้ — กดแล้วเป็นรายการ (dropdown กลาง ลอยพ้นแถบที่เลื่อนได้) */}
              {moreTop.length > 0 && (
                <span ref={moreBtnRef} className="shrink-0 inline-flex">
                  <button onClick={() => { setOpenMenu(null); setMoreMenuOpen((v) => !v); }} title={`เมนูที่รวมไว้ใน “${moreLabel}”`}
                    className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-sm whitespace-nowrap transition-colors ${moreMenuOpen || inMoreActive ? "bg-white/25 font-semibold" : "text-white/85 hover:bg-white/12"}`}>
                    <span className="text-base leading-none">⋯</span> {moreLabel}
                    {inMoreActive && cur && <span className="font-normal text-white/80 max-w-[160px] truncate">· {cur.label}</span>}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${moreMenuOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </span>
              )}
              {/* ⚙️ ตั้งค่าแอปนี้ (แอดมิน) — ใครเห็นเมนูไหน + หน้าตั้งค่าเฉพาะแอป */}
              {canAdmin && (
                <button onClick={() => { setOpenMenu(null); setSettingsOn(true); }} title="ตั้งค่าแอปนี้ — ใครเห็นเมนูไหน"
                  className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-sm whitespace-nowrap transition-colors ${showSettings ? "bg-white/25 font-semibold" : "text-white/85 hover:bg-white/12"}`}>
                  ⚙️ ตั้งค่า
                </button>
              )}
            </nav>
          )}

          <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
            <button type="button" onClick={() => setSearchOpen(true)} aria-label="ค้นหา" title={searchScope ? "ค้นหาในแอปนี้ — กด / หรือ Ctrl+K" : "ค้นหา — กด / หรือ Ctrl+K"}
              className="h-9 px-2 flex items-center gap-1 rounded-lg hover:bg-white/15 text-white/90">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <kbd className="hidden md:inline text-[10px] font-mono border border-white/40 px-1 rounded">/</kbd>
            </button>
            <PwaInstallButton />
            <div className="text-white"><LangToggle /></div>
            <div className="text-white"><NotificationBell /></div>
            <AccountMenu onDark device={{
              mode: devMode, viewport, onChange: setDevMode,
              // QR: เปิดแอปนี้บนเครื่องจริง + พาไปหน้าที่กำลังดูอยู่ (?go=) · ติดตั้งเป็นแอป = แอปนี้เอง
              qr: typeof window === "undefined" ? undefined : (() => {
                const goPath = items[active] ? stripEmbed(deepSrc ?? items[active].href) : "";
                return { appKey, appLabel: app?.label ?? appKey, installGo: goPath || undefined, openUrl: `${window.location.origin}/app/${encodeURIComponent(appKey)}${goPath ? `?go=${encodeURIComponent(goPath)}` : ""}` };
              })(),
            }} />
          </div>
        </div>

        {/* dropdown เมนูแม่ (จอกว้าง) — โผล่ใต้แถบบน จัดลูกตามหัวข้อ (หมวด) */}
        {openMenu && (() => {
          const parent = items.find((it) => it.id === openMenu);
          if (!parent) return null;
          const groups = groupKids(openMenu);
          if (groups.length === 0) return null;
          return (
            <div data-appmenu className="hidden md:block absolute left-2 top-full mt-1 z-40 max-w-[92vw] bg-white rounded-xl shadow-xl border border-slate-200 p-2 text-slate-700">
              <div className="px-2 py-1 mb-0.5 text-xs font-semibold text-slate-400 flex items-center gap-1.5"><MItemIcon it={parent} cls="w-3.5 h-3.5" /> {parent.label}</div>
              <div className="flex gap-3 flex-wrap">
                {groups.map(([sec, ks]) => (
                  <div key={sec} className="min-w-[170px]">
                    {groups.length > 1 && <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 pt-1 pb-0.5">{sec}</div>}
                    {ks.map((k) => (
                      <button key={k.id} onClick={() => { setOpenMenu(null); gotoItem(k); }}
                        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-left transition-colors ${activeId === k.id ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-slate-50"}`}>
                        <MItemIcon it={k} cls="w-4 h-4" /> <span className="truncate">{k.label}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* รายการในปุ่มรวมเมนู "เพิ่มเติม ▾" — เมนูแม่โชว์เป็นหัวข้อ + ลูกเรียงใต้ */}
        <FloatingDropdown anchorRef={moreBtnRef} open={moreMenuOpen && moreTop.length > 0} onClose={closeMoreMenu} minWidth={220} maxWidth={360}>
          <div data-appmenu className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl">
            {moreTop.map((it) => {
              const kids = kidsOf(it.id);
              const entry = (m: MenuItem, sub = false) => (
                <button key={m.id} onClick={() => { setMoreMenuOpen(false); gotoItem(m); }}
                  className={`w-full flex items-center gap-2.5 ${sub ? "pl-6" : "px-2"} pr-2 py-1.5 rounded-lg text-sm text-left transition-colors ${activeId === m.id ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-slate-50"}`}>
                  <MItemIcon it={m} cls="w-4 h-4" /> <span className="truncate">{m.label}</span>
                </button>
              );
              if (!kids.length) return entry(it);
              return (
                <div key={it.id} className="pt-1">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 flex items-center gap-1.5"><MItemIcon it={it} cls="w-3.5 h-3.5" /> {it.label}</div>
                  {kids.map((k) => entry(k, true))}
                </div>
              );
            })}
          </div>
        </FloatingDropdown>
      </header>

      {/* เนื้อหาเต็มกว้าง */}
      <main className="flex-1 min-w-0 flex flex-col min-h-0">
        {showSettings ? (
          <AppSettingsPanel appKey={appKey} appLabel={app?.label ?? appKey} items={allItems}
            appId={app?.id} moreLabel={app?.menu_more_label} defaultHref={app?.default_href}
            onSaved={() => setMenuRev((n) => n + 1)} />
        ) : (() => {
          const content = (<>
        {moduleKey ? (
          <div className="flex-1 overflow-y-auto">
            <ShellPresentContext.Provider value={true}>
              <MasterPage key={moduleKey} apiPath={moduleKey} moduleKey={moduleKey} title={cur!.label} icon={cur!.icon ?? "🧩"} />
            </ShellPresentContext.Provider>
          </div>
        ) : cur ? (
          // หน้า custom → แสดงหน้าจริงแบบ embed (ไม่มี sidebar ของ shell) เต็มพื้นที่ที่เหลือ
          <iframe ref={iframeRef} key={cur.href} src={embedSrc} title={cur.label} className="flex-1 w-full border-0" />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center gap-2">
            <div className="text-4xl mb-1">🗂️</div>
            <div className="text-slate-600 font-medium">ยังไม่มีรายการใน {app?.label ?? "App"} นี้</div>
            <div className="text-slate-400 text-sm max-w-xs">เพิ่มเมนู/หน้าเข้ามาได้ที่ <span className="font-medium text-slate-500">ตั้งค่า → จัดการเมนู</span> แล้วเลือก App นี้</div>
            {can("admin.users") && (
              <Link href="/admin/menu" className="mt-2 h-9 px-4 leading-9 bg-blue-600 text-white rounded-lg text-sm font-medium">ไปจัดการเมนู</Link>
            )}
          </div>
        )}
          </>);
          if (!devPreview) return content;
          // โหมดแท็บเล็ต/มือถือบนจอคอม → กรอบจำลอง + QR ข้างกรอบ (ของกลาง) · กำหนดสูงให้ iframe/ตารางมีพื้นที่
          return (
            <div className="flex-1 min-h-0 overflow-y-auto bg-slate-100">
              <DevicePreviewFrame layout={devLayout} viewport={viewport} onExitPreview={() => setDevMode("auto")}
                qr={{ appKey, appLabel: app?.label ?? appKey, installGo: items[active] ? stripEmbed(deepSrc ?? items[active].href) : undefined }}>
                <div className="flex flex-col bg-white" style={{ height: "80vh" }}>{content}</div>
              </DevicePreviewFrame>
            </div>
          );
        })()}
      </main>

      {/* มือถือ: แถบเมนูล่าง (iPad ซ่อน เพราะใช้ ☰ drawer แทน) · เมนูแม่แตะ = เปิด drawer เลือกลูก */}
      {topLevel.length > 0 && (
        <nav className="md:hidden flex-shrink-0 bg-white border-t border-slate-200 grid z-20"
          style={{ gridTemplateColumns: `repeat(${barCols}, minmax(0,1fr))`, paddingBottom: "env(safe-area-inset-bottom)" }}>
          {barItems.map((it) => {
            const hasKids = kidsOf(it.id).length > 0;
            const act = it.id === activeId || (hasKids && kidsOf(it.id).some((k) => k.id === activeId));
            return (
              <button key={it.id} onClick={() => hasKids ? setMoreOpen(true) : gotoItem(it)}
                className={`py-2.5 flex flex-col items-center gap-0.5 text-xs ${act ? "text-blue-700 font-semibold" : "text-slate-400"}`}>
                <MItemIcon it={it} cls="w-6 h-6" />
                <span className="truncate max-w-[72px] flex items-center gap-0.5">{it.label}{hasKids && <span aria-hidden>▾</span>}</span>
              </button>
            );
          })}
          {hasMore && (
            <button onClick={() => setMoreOpen(true)}
              className={`py-2.5 flex flex-col items-center gap-0.5 text-xs ${!onBar ? "text-blue-700 font-semibold" : "text-slate-400"}`}>
              <span className="text-xl">☰</span>
              <span className="truncate max-w-[72px]">{moreLabel}</span>
            </button>
          )}
        </nav>
      )}

      {/* เมนูพับ-ขยาย (drawer) — มือถือ: sheet ขึ้นจากล่าง · iPad/จอกว้าง: แผงเลื่อนจากซ้าย */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end md:flex-row md:justify-start" onClick={closeDrawer}>
          <div className="absolute inset-0 bg-black/40" />
          <div onClick={(e) => e.stopPropagation()}
            className="relative bg-white flex flex-col rounded-t-2xl max-h-[80vh] md:rounded-none md:max-h-none md:h-full md:w-72 md:shadow-xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            {/* หัว — ชื่อแอป + ปิด (แอปเดี่ยว: โชว์เฉพาะเมนูของแอปนี้ ไม่มีทางออกไปแอปอื่น) */}
            <div className="flex-shrink-0 bg-white px-3 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-800 truncate px-1">{app?.icon ?? "🧩"} {app?.label ?? "เมนูทั้งหมด"}</div>
              <button onClick={closeDrawer} aria-label="ปิด" className="text-slate-400 text-xl leading-none px-2">✕</button>
            </div>

            {/* เนื้อหา — รายการเมนูของแอปนี้ (เมนูแม่โชว์เป็นหัวข้อ + ลูกย่อหน้าเข้า) · เมนูที่รวมไว้อยู่ใต้หัวข้อ "เพิ่มเติม" */}
            <div className="flex-1 overflow-y-auto p-2">
              {[...barTop, ...(moreTop.length ? [null] : []), ...moreTop].map((it) => {
                if (!it) return (
                  <div key="__more" className="mt-2 border-t border-slate-100 px-3 pt-3 pb-1 text-xs font-semibold text-slate-400">⋯ {moreLabel}</div>
                );
                const kids = kidsOf(it.id);
                if (kids.length === 0) return (
                  <button key={it.id} onClick={() => gotoItem(it)}
                    className={`w-full px-3 py-3 rounded-lg text-left text-sm flex items-center gap-3 ${activeId === it.id ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>
                    <MItemIcon it={it} cls="w-6 h-6" />
                    <span className="truncate">{it.label}</span>
                  </button>
                );
                return (
                  <div key={it.id} className="mt-1">
                    <div className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-400 flex items-center gap-2"><MItemIcon it={it} cls="w-4 h-4" /><span className="truncate">{it.label}</span></div>
                    {kids.map((k) => (
                      <button key={k.id} onClick={() => gotoItem(k)}
                        className={`w-full pl-8 pr-3 py-2.5 rounded-lg text-left text-sm flex items-center gap-3 ${activeId === k.id ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>
                        <MItemIcon it={k} cls="w-5 h-5" />
                        <span className="truncate">{k.label}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {canAdmin && (
                <button onClick={() => { setSettingsOn(true); closeDrawer(); }}
                  className={`mt-1 w-full px-3 py-3 rounded-lg text-left text-sm flex items-center gap-3 border-t border-slate-100 ${showSettings ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>
                  <span className="w-6 text-center text-lg">⚙️</span><span className="truncate">ตั้งค่า (ใครเห็นเมนูไหน)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">{children}</div>;
}

// หน้าโหลดของแอปเดี่ยว — ใช้ธีมเดียวกับ shell (header gradient) + ไอคอนแอปเด้งเบา ๆ + วงแหวนหมุน
// โชว์ระหว่างโหลด auth/เมนู/สิทธิ์ เพื่อไม่ให้ empty state เด้งแว้บ
function AppLoading({ label, icon }: { label?: string | null; icon?: string | null }) {
  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 overflow-hidden">
      {/* แถบหัวธีมเดียวกับแอปจริง → พอโหลดเสร็จเปลี่ยนแค่เนื้อหา (ลื่น ไม่กระพริบ) */}
      <header className="flex-shrink-0 bg-gradient-to-r from-blue-700 to-indigo-600 px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="py-3 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-white/15 flex items-center justify-center text-lg">{icon ?? "🧩"}</div>
          {label
            ? <div className="font-semibold text-lg text-white truncate">{label}</div>
            : <div className="h-5 w-36 rounded-md bg-white/20 animate-pulse" />}
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 animate-ping opacity-60" />
          <div className="absolute inset-0 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-3xl">{icon ?? "🧩"}</div>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
          กำลังเปิด{label ? ` ${label}` : "แอป"}…
        </div>
      </div>
    </div>
  );
}
