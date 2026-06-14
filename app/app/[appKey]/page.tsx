"use client";

/**
 * เชลล์เดี่ยวกลาง (standalone) /app/<appKey>
 * เปิด "โมดูลใหญ่ (App)" ใด ๆ เป็นแอปเดี่ยวบนมือถือ — เห็นแค่เมนูของ App นั้น
 * reuse หน้า master กลาง (MasterPage) ผ่าน ShellPresentContext (ไม่ซ้อน sidebar)
 * หมายเหตุ: /app/china-pay มีหน้า custom เฉพาะ (route นั้นชนะ dynamic นี้)
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { ShellPresentContext } from "@/components/playground-shell";
import { PwaInstallButton } from "@/components/pwa-install-button";

const MasterPage = dynamic(() => import("@/components/master-page").then((m) => m.MasterPage), {
  ssr: false, loading: () => <div className="p-8 text-center text-slate-400 text-sm">กำลังโหลด…</div>,
});

type MenuItem = { label: string; href: string; icon: string | null; app_keys: string[]; is_active: boolean; show_in_sidebar: boolean; sort_order: number; permission_key: string | null };
type AppGroup = { key: string; label: string; icon: string | null; permission_key: string | null; default_href: string | null };

export default function StandaloneApp() {
  const appKey = String(useParams().appKey ?? "");
  const { user, ready, can, permsReady } = useAuth();
  const [app, setApp] = useState<AppGroup | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);   // มือถือ: sheet "เพิ่มเติม" (เมนูเกิน 5)
  const initedRef = useRef(false);   // ตั้งหน้าเริ่มต้น (default landing) แค่ครั้งแรก

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch("/api/menu/apps").then((r) => r.json()),
      apiFetch("/api/menu").then((r) => r.json()),
    ]).then(([aj, mj]) => {
      if (!alive) return;
      const ag = (aj.data ?? []).find((x: AppGroup) => x.key === appKey) ?? null;
      setApp(ag);
      const its = ((mj.data ?? []) as MenuItem[])
        .filter((m) => m.is_active && m.show_in_sidebar && (m.app_keys ?? []).includes(appKey)
          && (!m.permission_key || can(m.permission_key as Parameters<typeof can>[0])))
        .sort((a, b) => a.sort_order - b.sort_order);
      setItems(its);
      // หน้าเริ่มต้น (default landing) — เด้งเมนูที่ตั้งไว้ ครั้งแรกครั้งเดียว
      if (!initedRef.current && ag?.default_href) {
        const i = its.findIndex((m) => m.href === ag.default_href);
        if (i >= 0) setActive(i);
      }
      initedRef.current = true;
      setLoaded(true);
    }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [appKey, can]);

  if (!ready) return <Center>กำลังโหลด…</Center>;
  if (!user) return (
    <Center>
      <div className="text-slate-500 mb-3">กรุณาเข้าสู่ระบบก่อนใช้งาน</div>
      <Link href={`/login?next=/app/${appKey}`} className="h-10 px-5 leading-10 bg-blue-600 text-white rounded-lg font-medium">เข้าสู่ระบบ</Link>
    </Center>
  );

  // กั้นเข้าแอปตามสิทธิ์ — แอปตั้ง permission_key แล้ว user ไม่มีสิทธิ์ → เข้าไม่ได้ (กันพิมพ์ URL ตรง)
  if (loaded && permsReady && app?.permission_key && !can(app.permission_key as Parameters<typeof can>[0])) return (
    <Center>
      <div className="text-4xl mb-2">🔒</div>
      <div className="text-slate-700 font-medium mb-1">คุณไม่มีสิทธิ์เข้าแอปนี้</div>
      <div className="text-slate-400 text-sm mb-3">{app.label} · ต้องมีสิทธิ์ <code className="bg-slate-100 px-1 rounded">{app.permission_key}</code></div>
      <Link href="/apps" className="h-10 px-5 leading-10 bg-slate-100 text-slate-700 rounded-lg font-medium">← กลับหน้ารวมแอป</Link>
    </Center>
  );

  const cur = items[active];
  // เมนูที่เป็นตารางข้อมูล (/m/<entity>) → MasterPage · เมนูหน้า custom อื่น → โหลดหน้าจริงผ่าน iframe
  const isMasterItem = !!cur && cur.href.startsWith("/m/");
  const moduleKey = isMasterItem ? cur!.href.replace(/^\/m\//, "").split("?")[0] : null;

  // แถบล่าง (มือถือ): เกิน 5 เมนู → โชว์ 4 ตัวแรก + ปุ่ม "เพิ่มเติม" เปิด drawer เลือกที่เหลือ
  const hasMore = items.length > 5;
  const barItems = hasMore ? items.slice(0, 4) : items.slice(0, 5);
  const barCols = barItems.length + (hasMore ? 1 : 0);
  const onBar = active < barItems.length;   // เมนูที่กำลังเปิดอยู่ในแถบล่างไหม (ไม่งั้น highlight ปุ่มเพิ่มเติม)

  const goto = (i: number) => { setActive(i); setMoreOpen(false); };
  // หน้า custom โหลดผ่าน iframe → ส่ง embed=1 ให้ shell ในหน้านั้นซ่อน sidebar/แถบ App ของตัวเอง (กันเมนูซ้อน)
  const embedSrc = cur ? `${cur.href}${cur.href.includes("?") ? "&" : "?"}embed=1` : "";

  return (
    // h-dvh + flex column: header บน · เนื้อหาเต็มกว้าง · เมนูแบบพับ-ขยาย (iPad: ☰ drawer ซ้าย · มือถือ: แถบล่าง)
    <div className="h-[100dvh] flex flex-col bg-slate-100 overflow-hidden">
      <header className="flex-shrink-0 z-20 bg-gradient-to-r from-blue-700 to-indigo-600 text-white px-4 flex items-center justify-between"
        style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="py-3 flex items-center gap-2 w-full min-w-0">
          {/* ปุ่มพับ-ขยายเมนู (iPad/จอกว้าง) — มือถือใช้แถบล่างแทน */}
          {items.length > 0 && (
            <button onClick={() => setMoreOpen(true)} aria-label="เปิดเมนู"
              className="hidden md:flex items-center justify-center h-9 w-9 -ml-1 rounded-lg hover:bg-white/15 text-xl flex-shrink-0">☰</button>
          )}
          <div className="font-semibold text-lg truncate flex-1 min-w-0">{app?.icon ?? "🧩"} {app?.label ?? appKey}</div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <PwaInstallButton />
            <div className="text-xs opacity-90 hidden sm:block truncate max-w-[120px]">{user.name}</div>
          </div>
        </div>
      </header>

      {/* เนื้อหาเต็มกว้าง */}
      <main className="flex-1 min-w-0 flex flex-col min-h-0">
        {moduleKey ? (
          <div className="flex-1 overflow-y-auto">
            <ShellPresentContext.Provider value={true}>
              <MasterPage key={moduleKey} apiPath={moduleKey} moduleKey={moduleKey} title={cur!.label} icon={cur!.icon ?? "🧩"} />
            </ShellPresentContext.Provider>
          </div>
        ) : cur ? (
          // หน้า custom → แสดงหน้าจริงแบบ embed (ไม่มี sidebar ของ shell) เต็มพื้นที่ที่เหลือ
          <iframe key={embedSrc} src={embedSrc} title={cur.label} className="flex-1 w-full border-0" />
        ) : (
          <div className="flex-1 flex items-center justify-center p-10 text-center text-slate-300 text-sm">— ยังไม่มีเมนูใน App นี้ —</div>
        )}
      </main>

      {/* มือถือ: แถบเมนูล่าง (iPad ซ่อน เพราะใช้ ☰ drawer แทน) */}
      {items.length > 0 && (
        <nav className="md:hidden flex-shrink-0 bg-white border-t border-slate-200 grid z-20"
          style={{ gridTemplateColumns: `repeat(${barCols}, minmax(0,1fr))`, paddingBottom: "env(safe-area-inset-bottom)" }}>
          {barItems.map((it, i) => (
            <button key={it.href} onClick={() => goto(i)}
              className={`py-2.5 flex flex-col items-center gap-0.5 text-xs ${active === i ? "text-blue-700 font-semibold" : "text-slate-400"}`}>
              <span className="text-xl">{it.icon ?? "•"}</span>
              <span className="truncate max-w-[72px]">{it.label}</span>
            </button>
          ))}
          {hasMore && (
            <button onClick={() => setMoreOpen(true)}
              className={`py-2.5 flex flex-col items-center gap-0.5 text-xs ${!onBar ? "text-blue-700 font-semibold" : "text-slate-400"}`}>
              <span className="text-xl">☰</span>
              <span className="truncate max-w-[72px]">เพิ่มเติม</span>
            </button>
          )}
        </nav>
      )}

      {/* เมนูพับ-ขยาย (drawer) — มือถือ: sheet ขึ้นจากล่าง · iPad/จอกว้าง: แผงเลื่อนจากซ้าย */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end md:flex-row md:justify-start" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div onClick={(e) => e.stopPropagation()}
            className="relative bg-white overflow-y-auto rounded-t-2xl max-h-[70vh] md:rounded-none md:max-h-none md:h-full md:w-72 md:shadow-xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="sticky top-0 bg-white px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="font-semibold text-slate-800">{app?.icon ?? "🧩"} {app?.label ?? "เมนูทั้งหมด"}</div>
              <button onClick={() => setMoreOpen(false)} aria-label="ปิด" className="text-slate-400 text-xl leading-none px-2">✕</button>
            </div>
            <div className="p-2">
              {items.map((it, i) => (
                <button key={it.href} onClick={() => goto(i)}
                  className={`w-full px-3 py-3 rounded-lg text-left text-sm flex items-center gap-3 ${active === i ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>
                  <span className="text-xl flex-shrink-0">{it.icon ?? "•"}</span>
                  <span className="truncate">{it.label}</span>
                </button>
              ))}
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
