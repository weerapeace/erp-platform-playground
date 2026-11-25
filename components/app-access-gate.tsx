"use client";

/**
 * AppAccessGate — guard กลาง "ใครเข้าแอปนี้ได้" สำหรับ standalone shell (Payroll ฯลฯ)
 *
 * ใช้กฎเดียวกับ PlaygroundShell (blockedAppLabel): แอปถูกล็อกเมื่อ erp_app_groups.permission_key มีค่า
 * → ต้องมีสิทธิ์นั้นถึงเข้าได้ · admin มีทุกสิทธิ์ในชุด perms อยู่แล้ว
 *
 * ทำไมต้องมี: หน้า /payroll/* ใช้ PayrollShell (ไม่ใช่ PlaygroundShell) เลยไม่มี guard
 * → เดิมพนักงานพิมพ์ URL/กดจาก launcher เข้าได้ทั้งที่แอปล็อกไว้. ของกลางตัวนี้อุดช่องนั้น
 * (ฝั่ง API ยังมี guardApi กันข้อมูลหลุดอีกชั้น — อันนี้กันระดับ "เข้าหน้า")
 */
import { useEffect, useState } from "react";
import { useAuth, AccessDenied, type Permission } from "@/components/auth";
import { cachedGetJson } from "@/lib/shell-cache";
import type { AppGroup } from "@/components/playground-shell";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { navigateTop } from "@/lib/top-window";
import { useT, useLang } from "@/components/i18n";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { pathAllowed, type MyLock } from "@/lib/app-lock";
import { Icon } from "@/components/icon";

/** เช็คสิทธิ์เข้าแอป appKey — อิงล็อกของ erp_app_groups (ของกลางเดียวกับ PlaygroundShell) */
export function useAppGuard(appKey: string): { blocked: boolean; appLabel: string | null } {
  const { user, ready, can, permsReady } = useAuth();
  const [apps, setApps] = useState<AppGroup[] | null>(null);

  useEffect(() => {
    let alive = true;
    cachedGetJson<{ data?: AppGroup[] }>("/api/menu/apps")
      .then((j) => { if (alive) setApps(Array.isArray(j.data) ? (j.data as AppGroup[]) : []); })
      .catch(() => { if (alive) setApps([]); });
    return () => { alive = false; };
  }, []);

  // ยังไม่ login / สิทธิ์ DB ยังโหลดไม่เสร็จ / ยังไม่ได้รายชื่อแอป → ไม่บล็อก
  // (กันบล็อกพลาดตอนใช้ค่าสำรอง — ข้อมูลยังปลอดภัยที่ API guard)
  if (!user || !ready || !permsReady || apps === null) return { blocked: false, appLabel: null };

  const ag = apps.find((a) => a.key === appKey);
  if (!ag?.permission_key) return { blocked: false, appLabel: null };   // ไม่ล็อก = ทุกคนเข้าได้
  return { blocked: !can(ag.permission_key as Permission), appLabel: ag.label };
}

/** ห่อเนื้อหา — ถ้าไม่มีสิทธิ์เข้าแอปนี้ โชว์ AccessDenied แทน */
export function AppAccessGate({ appKey, children }: { appKey: string; children: React.ReactNode }) {
  const t = useT();
  const { blocked, appLabel } = useAppGuard(appKey);
  if (blocked) return <AccessDenied message={t(`คุณไม่มีสิทธิ์เข้าถึงแอป "${appLabel}" — ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์`, `You don't have access to the "${appLabel}" app — contact an admin if you need it`)} />;
  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔒 AppLockGate — ล็อกพนักงานให้อยู่ในแอปพนักงาน (รอบ 2 · lib/app-lock · docs/staff-apps.md)
//   ครอบทั้งเว็บที่ root layout · คนที่แอดมินติ๊ก "ล็อกไว้ในแอปนี้" เปิดหน้าที่ไม่อยู่ในแอป → หน้า "หน้านี้ไม่อยู่ในแอป X"
//   + ปุ่มกลับหน้าแอป + ปุ่มขอสิทธิ์จากแอดมิน · เปิด / หรือ /apps แล้วมีแอปเดียว = พาไปหน้าแอปเลย
//   ไม่ถูกล็อก (คนส่วนใหญ่ + แอดมิน) = ไม่มีผลอะไร · ด้านข้อมูลกันจริงที่ DB (erp_can) อีกชั้น
// ─────────────────────────────────────────────────────────────────────────────

const LOCK_CACHE = "applock:";

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname() ?? "/";
  const uid = user?.id ?? null;
  const [lock, setLock] = useState<MyLock | null>(null);

  useEffect(() => {
    if (!uid) { setLock(null); return; }
    let alive = true;
    // แคชในแท็บ 5 นาที (ไม่ยิงถามทุกครั้งที่เปิดหน้า) · แอดมินเปลี่ยนล็อก = มีผลกับข้อมูลทันทีที่ DB, หน้าเว็บตามภายใน 5 นาที
    try {
      const c = JSON.parse(sessionStorage.getItem(LOCK_CACHE + uid) ?? "null") as { v: MyLock; at: number } | null;
      if (c?.v) { setLock(c.v); if (Date.now() - c.at < 5 * 60_000) return () => { alive = false; }; }
    } catch { /* noop */ }
    apiFetch("/api/staff-apps/my-lock").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!alive || !j || j.error) return;
      const v: MyLock = { locked: !!j.locked, apps: j.apps ?? [], hrefs: j.hrefs ?? [] };
      setLock(v);
      try { sessionStorage.setItem(LOCK_CACHE + uid, JSON.stringify({ v, at: Date.now() })); } catch { /* noop */ }
    }).catch(() => { /* โหลดไม่ได้ = ไม่บล็อก (ข้อมูลยังกันที่ DB) */ });
    return () => { alive = false; };
  }, [uid]);

  const blocked = !!uid && !!lock?.locked && !pathAllowed(pathname, lock);
  // หน้าแรก/หน้ารวมแอป + มีแอปเดียว → พาไปแอปเลย (เปิดแอปจากไอคอนบนมือถือแล้วไม่ต้องกดต่อ)
  useEffect(() => {
    if (blocked && lock && lock.apps.length === 1 && (pathname === "/" || pathname === "/apps")) navigateTop(`/app/${lock.apps[0].key}`);
  }, [blocked, lock, pathname]);

  if (!blocked || !lock) return <>{children}</>;
  return <AppLockBlocked lock={lock} path={pathname} />;
}

function AppLockBlocked({ lock, path }: { lock: MyLock; path: string }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const name = (a: MyLock["apps"][number]) => (lang === "en" && a.label_en) || a.label;
  const first = lock.apps[0];
  const ask = async () => {
    const ok = await askConfirm({ title: t("ขอสิทธิ์เข้าหน้านี้?", "Request access to this page?"), message: t("ระบบจะแจ้งแอดมินให้เพิ่มหน้านี้เข้าแอปของคุณ", "Your admin will be notified to add this page to your app."), confirmText: t("ส่งคำขอ", "Send request") });
    if (!ok) return;
    try {
      const r = await apiFetch("/api/staff-apps/access-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, app_key: first?.key }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setSent(true);
      toast.success(t("ส่งคำขอให้แอดมินแล้ว", "Request sent to your admin"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ส่งไม่สำเร็จ", "Couldn't send")); }
  };
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-3xl text-slate-400 shadow-sm"><Icon name="lock" /></div>
      <h1 className="text-lg font-semibold text-slate-800">
        {lock.apps.length === 1 ? t(`หน้านี้ไม่อยู่ในแอป “${name(first)}”`, `This page isn't part of “${name(first)}”`) : t("หน้านี้ไม่อยู่ในแอปของคุณ", "This page isn't part of your apps")}
      </h1>
      <p className="max-w-sm text-sm text-slate-500">{t("คุณใช้ได้เฉพาะเมนูในแอปที่แอดมินตั้งให้ ถ้าต้องใช้หน้านี้ กดขอสิทธิ์ได้", "You can only use the menus in the app your admin set up. Ask for access if you need this page.")}</p>
      <code className="max-w-full truncate rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{path}</code>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {lock.apps.map((a) => (
          <button key={a.key} type="button" onClick={() => navigateTop(`/app/${a.key}`)} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">
            ← {t("กลับหน้าแอป", "Back to")} {name(a)}
          </button>
        ))}
        <button type="button" onClick={() => void ask()} disabled={sent} className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {sent ? t("ส่งคำขอแล้ว", "Request sent") : t("ขอสิทธิ์จากแอดมิน", "Ask admin for access")}
        </button>
      </div>
    </div>
  );
}
