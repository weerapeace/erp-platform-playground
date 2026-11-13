"use client";

// ============================================================
// MenuPagePickerModal — ป๊อปเลือก "หน้าใน ERP" จากเมนูจริง (ของกลาง · ไม่ต้องพิมพ์ลิงก์เอง)
//
// รายการมาจากเมนูกลาง GET /api/menu + /api/menu/apps (แคชเดียวกับแถบเมนู lib/shell-cache → เปิดป๊อปแทบไม่ยิงเน็ตเพิ่ม)
// จัดกลุ่มตามแอป · ค้นชื่อหน้า / ลิงก์ / ชื่อแอป · กรองทีละแอป · กดแถว = เลือกเลย
// หน้าที่อยู่หลายแอป = โผล่ทุกแอป → เลือกจากแอปไหน ได้ชื่อแอปนั้น · ตรรกะล้วน + เทสต์: lib/menu-pages.ts
//
// ใช้:      <MenuPagePickerModal open={open} onClose={…} onPick={(p) => …} current={{ href, app }} />
//           p = { href, label, icon, app, appName, appIcon }
//           useMenuPages(enabled) = ข้อมูลเมนูชุดเดียวกัน (ไว้เช็กว่าหน้ายังอยู่ในเมนูไหม / ชื่อแอปล่าสุด)
// ใช้เมื่อ:  อยากให้ผู้ใช้ชี้ไปหน้าใดหน้าหนึ่งในระบบ (เช่น กล่อง "หน้าใน ERP" ในกระดาน flowchart)
// ห้ามใช้:  เพิ่ม/เอาเมนูออกจากแอป → แท็บ "เมนูและคนเห็น" (components/app-settings-panel) · ลิงก์ออกนอกระบบ → ช่องลิงก์ธรรมดา
// ไม่กรองตามสิทธิ์: โชว์ทุกหน้าที่เปิดอยู่ในเมนู — หน้าปลายทางตรวจสิทธิ์เองตอนเปิด · doc: docs/menu-page-picker.md
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { cachedGetJson } from "@/lib/shell-cache";
import { menuPageGroups, type MenuAppRow, type MenuPage, type MenuPageRow } from "@/lib/menu-pages";

export type { MenuPage } from "@/lib/menu-pages";

type MenuData = { menus: MenuPageRow[]; apps: MenuAppRow[] };
type Status = "idle" | "loading" | "ready" | "error";

/** เมนู + แอปทั้งระบบ (แคชเดียวกับแถบเมนู) — enabled=false = ยังไม่โหลด */
export function useMenuPages(enabled: boolean): MenuData & { status: Status; error: string | null; reload: () => void } {
  const [data, setData] = useState<MenuData>({ menus: [], apps: [] });
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loaded = useRef(false);
  useEffect(() => {
    if (!enabled || (loaded.current && tick === 0)) return;
    let alive = true;
    setStatus("loading"); setError(null);
    Promise.all([
      cachedGetJson<{ data?: MenuPageRow[]; error?: string | null }>("/api/menu"),
      cachedGetJson<{ data?: MenuAppRow[]; error?: string | null }>("/api/menu/apps"),
    ]).then(([m, a]) => {
      if (!alive) return;
      if (m?.error || a?.error) throw new Error(m?.error || a?.error || "");
      setData({ menus: Array.isArray(m?.data) ? m.data : [], apps: Array.isArray(a?.data) ? a.data : [] });
      loaded.current = true;
      setStatus("ready");
    }).catch((e) => {
      if (!alive) return;
      setError((e as Error)?.message || null);
      setStatus("error");
    });
    return () => { alive = false; };
  }, [enabled, tick]);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  return { ...data, status, error, reload };
}

export function MenuPagePickerModal({ open, onClose, onPick, current, title }: {
  open: boolean;
  onClose: () => void;
  onPick: (page: MenuPage) => void;
  /** หน้าที่เลือกอยู่ตอนนี้ (ไฮไลต์ให้) */
  current?: { href?: string | null; app?: string | null } | null;
  title?: string;
}) {
  const t = useT();
  const { menus, apps, status, error, reload } = useMenuPages(open);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<string | null>(null);   // กรองแอปเดียว (null = ทุกแอป)
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setQ(""); setOnly(null);
    const f = setTimeout(() => searchRef.current?.focus(), 80);   // ป๊อปกลางย้ายโฟกัสไปที่ตัวป๊อปตอนเปิด → รอแล้วค่อยวางเคอร์เซอร์ที่ช่องค้น
    return () => clearTimeout(f);
  }, [open]);

  const all = useMemo(() => menuPageGroups(menus, apps), [menus, apps]);
  const groups = useMemo(() => {
    const found = q.trim() ? menuPageGroups(menus, apps, q) : all;
    return only === null ? found : found.filter((g) => g.app === only);
  }, [menus, apps, all, q, only]);
  const total = groups.reduce((s, g) => s + g.pages.length, 0);

  const chip = (on: boolean) => `inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] ${on ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`;
  const isCur = (p: MenuPage) => !!current?.href && current.href === p.href && (current.app ?? "") === p.app;

  return (
    <ERPModal open={open} onClose={onClose} title={title ?? t("เลือกหน้าใน ERP", "Choose an ERP page")} size="lg" defaultExpanded={false} storageKey="menu-page-picker"
      description={t("รายการมาจากเมนูจริงของระบบ — กดหน้าที่ต้องการได้เลย", "Pages come from the real menu — tap one to choose it")}>
      <div className="space-y-2">
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("ค้นหาหน้า", "Search pages")}
          placeholder={t("ค้นชื่อหน้า ลิงก์ หรือชื่อแอป เช่น Design Dashboard", "Search page, link or app, e.g. Design Dashboard")}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-violet-400 focus:outline-none" />
        {status === "ready" && all.length > 1 && (
          <div className="flex max-h-[4.5rem] flex-wrap gap-1 overflow-y-auto">
            <button type="button" className={chip(only === null)} onClick={() => setOnly(null)}>{t("ทุกแอป", "All apps")}</button>
            {all.map((g) => (
              <button key={g.app || "-"} type="button" className={chip(only === g.app)} onClick={() => setOnly(only === g.app ? null : g.app)}>
                {g.appIcon ? <Icon value={g.appIcon} /> : <Icon value="i:apps" />}{g.appName}
              </button>
            ))}
          </div>
        )}

        {status === "error" ? <ErrorState title={t("โหลดรายการหน้าไม่สำเร็จ", "Could not load the pages")} hint={error ?? undefined} onRetry={reload} />
          : status !== "ready" ? <LoadingState className="py-10 text-sm" />
          : !total ? <EmptyState icon={<Icon value="i:search" />} className="p-8" title={q.trim() ? t("ไม่พบหน้าที่ตรงคำค้น", "No page matches") : t("ยังไม่มีหน้าในเมนู", "No pages in the menu yet")}
              hint={q.trim() ? t("ลองคำอื่น หรือกด \"ทุกแอป\"", "Try another word, or pick \"All apps\"") : undefined} />
          : (
            <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-200">
              {groups.map((g) => (
                <div key={g.app || "-"}>
                  <div className="sticky top-0 z-[1] flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[12px] font-semibold text-slate-600">
                    {g.appIcon ? <Icon value={g.appIcon} /> : <Icon value="i:apps" />}{g.appName}
                    <span className="font-normal text-slate-400">· {g.pages.length}</span>
                  </div>
                  {g.pages.map((p) => (
                    <button key={p.href} type="button" onClick={() => onPick(p)}
                      className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 ${isCur(p) ? "bg-violet-50" : "hover:bg-slate-50"}`}>
                      <span className="w-6 shrink-0 text-center text-[15px]">{p.icon ? <Icon value={p.icon} /> : <Icon value="i:link" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-slate-800">{p.label}</span>
                        <span className="block truncate font-mono text-[11px] text-slate-400">{p.href}</span>
                      </span>
                      {isCur(p) && <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-medium text-white">{t("เลือกอยู่", "Selected")}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        <p className="text-[11px] text-slate-500">{t("หน้าที่อยู่หลายแอปจะโผล่ทุกแอป — เลือกจากแอปไหน ก็ใช้ชื่อแอปนั้น", "Pages in several apps show under each — the app you pick it from is the one shown")}</p>
      </div>
    </ERPModal>
  );
}
