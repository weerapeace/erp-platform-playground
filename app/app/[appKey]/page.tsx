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

  // กว้าง: มือถือ = คอลัมน์แคบ (max-w-md) · iPad/จอกว้าง (md+) = เต็มเฟรม
  const frame = "w-full max-w-md md:max-w-none mx-auto bg-slate-50 min-h-screen flex flex-col shadow-sm";

  return (
    <div className="min-h-screen bg-slate-100">
      <div className={frame}>
        <header className="sticky top-0 z-20 bg-gradient-to-r from-blue-700 to-indigo-600 text-white px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-lg">{app?.icon ?? "🧩"} {app?.label ?? appKey}</div>
          <div className="flex items-center gap-2">
            <PwaInstallButton />
            <div className="text-xs opacity-90">{user.name}</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-24">
          {moduleKey ? (
            <ShellPresentContext.Provider value={true}>
              <MasterPage key={moduleKey} apiPath={moduleKey} moduleKey={moduleKey} title={cur!.label} icon={cur!.icon ?? "🧩"} />
            </ShellPresentContext.Provider>
          ) : cur ? (
            // หน้า custom (ไม่ใช่ตาราง เช่น App Launcher/Dashboard) → แสดงหน้าจริง
            <iframe key={cur.href} src={cur.href} title={cur.label}
              className="w-full border-0" style={{ height: "calc(100vh - 124px)" }} />
          ) : (
            <div className="p-10 text-center text-slate-300 text-sm">— ยังไม่มีเมนูใน App นี้ —</div>
          )}
        </main>

        {items.length > 0 && (
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md md:max-w-3xl bg-white border-t border-slate-200 grid z-20"
            style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, minmax(0,1fr))` }}>
            {items.slice(0, 5).map((it, i) => (
              <button key={it.href} onClick={() => setActive(i)}
                className={`py-2.5 flex flex-col items-center gap-0.5 text-xs ${active === i ? "text-blue-700 font-semibold" : "text-slate-400"}`}>
                <span className="text-xl">{it.icon ?? "•"}</span>
                <span className="truncate max-w-[72px]">{it.label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">{children}</div>;
}
