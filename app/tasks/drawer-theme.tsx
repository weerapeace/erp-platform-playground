"use client";

// ============================================================
// ธีม Drawer (ต่อคน) — แต่งหน้าตา drawer งาน/คอนเทนต์: พื้นหลัง · ขนาดเนื้อหา · สลับซ้าย-ขวา · ซ่อน/แสดงส่วน
// เก็บใน user_ui_prefs (key ต่อ drawer เช่น tasks_drawer_theme_task / _content) ผ่าน /api/user-prefs
// ใช้: const { theme, update } = useDrawerTheme("task"); ...<DrawerThemeButton theme update sections />
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";

export type DrawerTheme = { accent: string; bg: string | null; size: "sm" | "md" | "lg"; swap: boolean; hidden: string[] };
export const DEFAULT_DRAWER_THEME: DrawerTheme = { accent: "#7c3aed", bg: null, size: "md", swap: false, hidden: [] };

export function mergeDrawerTheme(v: unknown): DrawerTheme {
  const o = (v ?? {}) as Partial<DrawerTheme>;
  return { accent: o.accent ?? DEFAULT_DRAWER_THEME.accent, bg: o.bg ?? null, size: o.size ?? "md", swap: !!o.swap, hidden: Array.isArray(o.hidden) ? o.hidden : [] };
}
// ขนาดเนื้อหา → zoom (สเกลทั้ง drawer body แบบสัดส่วน · รองรับ Chromium)
export function drawerZoom(size: DrawerTheme["size"]): number { return size === "sm" ? 0.92 : size === "lg" ? 1.1 : 1; }
export const isHidden = (theme: DrawerTheme, key: string) => theme.hidden.includes(key);

export function useDrawerTheme(which: "task" | "content") {
  const prefKey = `tasks_drawer_theme_${which}`;
  const [theme, setTheme] = useState<DrawerTheme>(DEFAULT_DRAWER_THEME);
  useEffect(() => {
    let live = true;
    apiFetch(`/api/user-prefs?key=${prefKey}`).then((r) => r.json()).then((j) => { if (live && j && !j.error) setTheme(mergeDrawerTheme(j.value)); }).catch(() => {});
    return () => { live = false; };
  }, [prefKey]);
  const update = useCallback((patch: Partial<DrawerTheme>) => {
    setTheme((prev) => { const next = { ...prev, ...patch }; void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: prefKey, value: next }) }); return next; });
  }, [prefKey]);
  return { theme, update };
}

// ปุ่ม 🎨 + popover ปรับธีม drawer
export function DrawerThemeButton({ theme, update, sections }: { theme: DrawerTheme; update: (p: Partial<DrawerTheme>) => void; sections: { key: string; label: string }[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggleHidden = (key: string) => update({ hidden: theme.hidden.includes(key) ? theme.hidden.filter((x) => x !== key) : [...theme.hidden, key] });
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} title={t("แต่งหน้า drawer (ของฉัน)", "Customize drawer (yours)")} className="h-8 px-2 text-xs text-slate-400 hover:text-violet-600 rounded-md hover:bg-slate-50">🎨</button>
      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-[61] mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-3 text-left">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">🎨 {t("แต่งหน้า drawer", "Customize drawer")}</p>
              <button onClick={() => update({ ...DEFAULT_DRAWER_THEME })} className="text-[11px] text-slate-400 hover:text-violet-600">{t("รีเซ็ต", "Reset")}</button>
            </div>
            {/* ขนาดเนื้อหา */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-20">{t("ขนาดเนื้อหา", "Content size")}</span>
              {(["sm", "md", "lg"] as const).map((s) => (
                <button key={s} onClick={() => update({ size: s })} className={`h-7 px-2.5 text-xs rounded border ${theme.size === s ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{s === "sm" ? t("เล็ก", "S") : s === "lg" ? t("ใหญ่", "L") : t("กลาง", "M")}</button>
              ))}
            </div>
            {/* พื้นหลัง */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-20">{t("พื้นหลัง", "Background")}</span>
              <input type="color" value={theme.bg ?? "#ffffff"} onChange={(e) => update({ bg: e.target.value })} className="w-9 h-7 p-0 border border-slate-200 rounded cursor-pointer" />
              <button onClick={() => update({ bg: null })} className={`h-7 px-2.5 text-xs rounded border ${theme.bg === null ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{t("ขาว", "White")}</button>
            </div>
            {/* สีหลัก (แถบบน) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-20">{t("สีหลัก (แถบบน)", "Accent (bar)")}</span>
              <input type="color" value={theme.accent} onChange={(e) => update({ accent: e.target.value })} className="w-9 h-7 p-0 border border-slate-200 rounded cursor-pointer" />
            </div>
            {/* สลับซ้าย-ขวา */}
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={theme.swap} onChange={(e) => update({ swap: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />{t("สลับซ้าย-ขวา", "Swap left/right")}
            </label>
            {/* ซ่อน/แสดงส่วน */}
            {sections.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1">{t("แสดงส่วน (ติ๊ก = แสดง)", "Show sections (checked = shown)")}</p>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  {sections.map((s) => (
                    <label key={s.key} className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={!theme.hidden.includes(s.key)} onChange={() => toggleHidden(s.key)} className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600" />{s.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[11px] text-slate-400">{t("บันทึกอัตโนมัติ (ของคุณคนเดียว)", "Saves automatically (yours)")}</p>
          </div>
        </>
      )}
    </div>
  );
}
