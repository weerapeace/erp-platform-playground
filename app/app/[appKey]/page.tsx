"use client";

/**
 * เชลล์เดี่ยวกลาง (standalone) /app/<appKey>
 * เปิด "โมดูลใหญ่ (App)" ใด ๆ เป็นแอปเดี่ยวบนมือถือ — เห็นแค่เมนูของ App นั้น
 * reuse หน้า master กลาง (MasterPage) ผ่าน ShellPresentContext (ไม่ซ้อน sidebar)
 * หมายเหตุ: /app/china-pay มีหน้า custom เฉพาะ (route นั้นชนะ dynamic นี้)
 */
import { useEffect, useState } from "react";
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

type MenuItem = { label: string; href: string; icon: string | null; app_keys: string[]; is_active: boolean; show_in_sidebar: boolean; sort_order: number };
type AppGroup = { key: string; label: string; icon: string | null };

export default function StandaloneApp() {
  const appKey = String(useParams().appKey ?? "");
  const { user, ready } = useAuth();
  const [app, setApp] = useState<AppGroup | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    apiFetch("/api/menu/apps").then((r) => r.json()).then((j) => {
      setApp((j.data ?? []).find((x: AppGroup) => x.key === appKey) ?? null);
    }).catch(() => {});
    apiFetch("/api/menu").then((r) => r.json()).then((j) => {
      const its = ((j.data ?? []) as MenuItem[])
        .filter((m) => m.is_active && m.show_in_sidebar && (m.app_keys ?? []).includes(appKey))
        .sort((a, b) => a.sort_order - b.sort_order);
      setItems(its);
    }).catch(() => {});
  }, [appKey]);

  if (!ready) return <Center>กำลังโหลด…</Center>;
  if (!user) return (
    <Center>
      <div className="text-slate-500 mb-3">กรุณาเข้าสู่ระบบก่อนใช้งาน</div>
      <Link href={`/login?next=/app/${appKey}`} className="h-10 px-5 leading-10 bg-blue-600 text-white rounded-lg font-medium">เข้าสู่ระบบ</Link>
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
