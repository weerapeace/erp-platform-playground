"use client";

// ============================================================
// ธีม Drawer (ต่อคน) — แต่งหน้าตา drawer งาน/คอนเทนต์: พื้นหลัง · ขนาดเนื้อหา · สลับซ้าย-ขวา · ซ่อน/แสดงส่วน
// เก็บใน user_ui_prefs (key ต่อ drawer เช่น tasks_drawer_theme_task / _content) ผ่าน /api/user-prefs
// ใช้: const { theme, update } = useDrawerTheme("task"); ...<DrawerThemeButton theme update sections />
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { uploadResizedImage } from "@/components/image-attach";
import { r2ImageUrl } from "@/lib/r2-image";
import { tr } from "@/lib/lang";
import { useT } from "@/components/i18n";

export type DrawerDensity = "compact" | "normal" | "spacious";
export type DrawerGradient = { from: string; to: string } | null;
export type DrawerTheme = {
  accent: string; accent2: string; accentGradient: boolean;   // สีหลัก (+คู่ไล่สีถ้าเปิด gradient)
  buttonColor: string | null; progressColor: string | null; dividerColor: string | null;   // แยกสีแต่ละส่วน (null = ใช้สีหลัก/ค่าเริ่มต้น)
  bg: string | null; bgImage: string | null; bgGradient: DrawerGradient;   // พื้นหลัง: สีเดียว / รูป / ไล่สี
  size: "sm" | "md" | "lg"; density: DrawerDensity; swap: boolean; hidden: string[]; order: string[]; collapsed: string[];
};
export const DEFAULT_DRAWER_THEME: DrawerTheme = {
  accent: "#7c3aed", accent2: "#ec4899", accentGradient: false,
  buttonColor: null, progressColor: null, dividerColor: null,
  bg: null, bgImage: null, bgGradient: null,
  size: "md", density: "normal", swap: false, hidden: [], order: [], collapsed: ["attach"],
};

export function mergeDrawerTheme(v: unknown): DrawerTheme {
  const o = (v ?? {}) as Partial<DrawerTheme>;
  return {
    accent: o.accent ?? DEFAULT_DRAWER_THEME.accent, accent2: o.accent2 ?? DEFAULT_DRAWER_THEME.accent2, accentGradient: !!o.accentGradient,
    buttonColor: o.buttonColor ?? null, progressColor: o.progressColor ?? null, dividerColor: o.dividerColor ?? null,
    bg: o.bg ?? null, bgImage: o.bgImage ?? null, bgGradient: o.bgGradient ?? null,
    size: o.size ?? "md", density: o.density ?? "normal", swap: !!o.swap, hidden: Array.isArray(o.hidden) ? o.hidden : [], order: Array.isArray(o.order) ? o.order : [],
    collapsed: Array.isArray(o.collapsed) ? o.collapsed : DEFAULT_DRAWER_THEME.collapsed,
  };
}
// พับ/กางส่วน (ต่อคน) — เก็บคีย์ที่ "พับอยู่"
export const isCollapsed = (theme: DrawerTheme, key: string) => theme.collapsed.includes(key);
export function toggleCollapsedList(theme: DrawerTheme, key: string): string[] {
  return theme.collapsed.includes(key) ? theme.collapsed.filter((x) => x !== key) : [...theme.collapsed, key];
}
// สีหลัก (ไล่สีถ้าเปิด) → ใช้กับปุ่ม/แถบ · helper คืนค่า CSS background (string)
export function accentCss(t: DrawerTheme): string { return t.accentGradient ? `linear-gradient(135deg, ${t.accent}, ${t.accent2})` : t.accent; }
export function btnBg(t: DrawerTheme): string { return t.buttonColor || accentCss(t); }
export function progressBg(t: DrawerTheme): string { return t.progressColor || accentCss(t); }
// สีเส้นแบ่ง (null = ใช้ค่าเริ่มต้นของ Tailwind ผ่าน class) → คืน undefined ให้ปล่อยตาม class
export function dividerColorOf(t: DrawerTheme): string | undefined { return t.dividerColor || undefined; }
// ชุดสีสำเร็จรูป
export const DRAWER_PRESETS: { name: string; name_en: string; accent: string; accent2: string; gradient: boolean }[] = [
  { name: "ม่วง", name_en: "Purple", accent: "#7c3aed", accent2: "#ec4899", gradient: true },
  { name: "ฟ้า", name_en: "Blue", accent: "#2563eb", accent2: "#06b6d4", gradient: true },
  { name: "เขียว", name_en: "Green", accent: "#059669", accent2: "#84cc16", gradient: true },
  { name: "ส้ม-แดง", name_en: "Orange-red", accent: "#ea580c", accent2: "#dc2626", gradient: true },
  { name: "ชมพู", name_en: "Pink", accent: "#db2777", accent2: "#fb7185", gradient: true },
  { name: "เทาเข้ม", name_en: "Dark gray", accent: "#334155", accent2: "#64748b", gradient: false },
];
// ลำดับส่วน (ของคนนั้น) ก่อน แล้วต่อด้วยส่วนที่ยังไม่ถูกจัดลำดับ — ส่วนใหม่ที่เพิ่มภายหลังจะไปต่อท้ายอัตโนมัติ
export function orderedKeys(theme: DrawerTheme, allKeys: string[]): string[] {
  const known = (theme.order ?? []).filter((k) => allKeys.includes(k));
  return [...known, ...allKeys.filter((k) => !known.includes(k))];
}
// ขนาดเนื้อหา → zoom (สเกลทั้ง drawer body แบบสัดส่วน · รองรับ Chromium)
export function drawerZoom(size: DrawerTheme["size"]): number { return size === "sm" ? 0.92 : size === "lg" ? 1.1 : 1; }
export const isHidden = (theme: DrawerTheme, key: string) => theme.hidden.includes(key);
// ระยะห่าง/ความแน่น → คลาส padding + space ของ pane
export function densityCls(d: DrawerDensity): string { return d === "compact" ? "p-3 space-y-3" : d === "spacious" ? "p-6 space-y-7" : "p-5 space-y-5"; }
// แยก padding / gap (สำหรับ pane ที่เป็น flex-col + จัดลำดับด้วย CSS order)
export function densityPad(d: DrawerDensity): string { return d === "compact" ? "p-3" : d === "spacious" ? "p-6" : "p-5"; }
export function densityGap(d: DrawerDensity): string { return d === "compact" ? "gap-3" : d === "spacious" ? "gap-7" : "gap-5"; }
// สไตล์พื้นหลัง drawer (รูป + ฉากขาวจางให้อ่านง่าย · หรือสีเดียว)
export function drawerBgStyle(theme: DrawerTheme): React.CSSProperties {
  if (theme.bgImage) { const u = r2ImageUrl(theme.bgImage); return u ? { backgroundImage: `linear-gradient(rgba(255,255,255,0.86),rgba(255,255,255,0.86)), url(${u})`, backgroundSize: "cover", backgroundAttachment: "local" } : {}; }
  if (theme.bgGradient) return { background: `linear-gradient(160deg, ${theme.bgGradient.from}, ${theme.bgGradient.to})` };
  return theme.bg ? { background: theme.bg } : {};
}

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
  const [bgBusy, setBgBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggleHidden = (key: string) => update({ hidden: theme.hidden.includes(key) ? theme.hidden.filter((x) => x !== key) : [...theme.hidden, key] });
  const moveSection = (key: string, dir: -1 | 1) => {
    const ord = orderedKeys(theme, sections.map((s) => s.key));
    const i = ord.indexOf(key); const j = i + dir;
    if (i < 0 || j < 0 || j >= ord.length) return;
    [ord[i], ord[j]] = [ord[j], ord[i]];
    update({ order: ord });
  };
  const labelOf = (key: string) => sections.find((s) => s.key === key)?.label ?? key;
  const onPickBg = async (file: File | null | undefined) => {
    if (!file) return;
    setBgBusy(true);
    try { const up = await uploadResizedImage(file, { folder: "drawer-bg", max: 1600 }); update({ bgImage: up.r2_key }); }
    catch { alert(t("อัปโหลดรูปไม่สำเร็จ", "Upload failed")); }
    finally { setBgBusy(false); }
  };
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
            {/* ความแน่น (ระยะห่าง) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-20">{t("ความแน่น", "Density")}</span>
              {(["compact", "normal", "spacious"] as const).map((d) => (
                <button key={d} onClick={() => update({ density: d })} className={`h-7 px-2.5 text-xs rounded border ${theme.density === d ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{d === "compact" ? t("แน่น", "Compact") : d === "spacious" ? t("โปร่ง", "Spacious") : t("ปกติ", "Normal")}</button>
              ))}
            </div>
            {/* ชุดสีสำเร็จรูป */}
            <div>
              <span className="text-xs text-slate-500">{t("ชุดสีสำเร็จรูป", "Presets")}</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {DRAWER_PRESETS.map((p) => (
                  <button key={p.name} onClick={() => update({ accent: p.accent, accent2: p.accent2, accentGradient: p.gradient, buttonColor: null, progressColor: null })} title={t(p.name, p.name_en)}
                    className="h-7 w-7 rounded-full border border-slate-200 hover:scale-110 transition-transform" style={{ background: p.gradient ? `linear-gradient(135deg, ${p.accent}, ${p.accent2})` : p.accent }} />
                ))}
              </div>
            </div>
            {/* สีหลัก + ไล่สี */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-20">{t("สีหลัก", "Accent")}</span>
              <input type="color" value={theme.accent} onChange={(e) => update({ accent: e.target.value })} className="w-9 h-7 p-0 border border-slate-200 rounded cursor-pointer" />
              {theme.accentGradient && <input type="color" value={theme.accent2} onChange={(e) => update({ accent2: e.target.value })} className="w-9 h-7 p-0 border border-slate-200 rounded cursor-pointer" />}
              <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer ml-auto"><input type="checkbox" checked={theme.accentGradient} onChange={(e) => update({ accentGradient: e.target.checked })} className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600" />{t("ไล่สี (ปุ่ม/แถบ)", "Gradient")}</label>
            </div>
            {/* แยกสี: ปุ่ม / แถบคืบหน้า / เส้นแบ่ง (ว่าง = ใช้สีหลัก) */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 w-20">{t("แยกสี", "Per-part")}</span>
              <ColorOpt label={t("ปุ่ม", "Btn")} value={theme.buttonColor} fallback={theme.accent} onChange={(c) => update({ buttonColor: c })} />
              <ColorOpt label={t("คืบหน้า", "Bar")} value={theme.progressColor} fallback={theme.accent} onChange={(c) => update({ progressColor: c })} />
              <ColorOpt label={t("เส้นแบ่ง", "Line")} value={theme.dividerColor} fallback="#e2e8f0" onChange={(c) => update({ dividerColor: c })} />
            </div>
            {/* พื้นหลัง: ขาว / สีเดียว / ไล่สี / รูป */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 w-20">{t("พื้นหลัง", "Background")}</span>
              <button onClick={() => update({ bg: null, bgImage: null, bgGradient: null })} className={`h-7 px-2.5 text-xs rounded border ${!theme.bg && !theme.bgImage && !theme.bgGradient ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{t("ขาว", "White")}</button>
              <input type="color" value={theme.bg ?? "#ffffff"} onChange={(e) => update({ bg: e.target.value, bgImage: null, bgGradient: null })} title={t("สีเดียว", "Solid")} className="w-9 h-7 p-0 border border-slate-200 rounded cursor-pointer" />
              <button onClick={() => update({ bgGradient: theme.bgGradient ?? { from: "#f5f3ff", to: "#fdf2f8" }, bgImage: null })} className={`h-7 px-2 text-xs rounded border ${theme.bgGradient ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{t("ไล่สี", "Gradient")}</button>
              <label className={`h-7 px-2 text-xs rounded border inline-flex items-center cursor-pointer ${theme.bgImage ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"} ${bgBusy ? "opacity-60 pointer-events-none" : ""}`}>
                {bgBusy ? "…" : t("รูป", "Image")}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { void onPickBg(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
            {theme.bgGradient && (
              <div className="flex items-center gap-2 pl-[5.5rem]">
                <input type="color" value={theme.bgGradient.from} onChange={(e) => update({ bgGradient: { from: e.target.value, to: theme.bgGradient!.to } })} className="w-9 h-7 p-0 border border-slate-200 rounded cursor-pointer" />
                <span className="text-xs text-slate-400">→</span>
                <input type="color" value={theme.bgGradient.to} onChange={(e) => update({ bgGradient: { from: theme.bgGradient!.from, to: e.target.value } })} className="w-9 h-7 p-0 border border-slate-200 rounded cursor-pointer" />
              </div>
            )}
            {/* สลับซ้าย-ขวา */}
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={theme.swap} onChange={(e) => update({ swap: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />{t("สลับซ้าย-ขวา", "Swap left/right")}
            </label>
            {/* ซ่อน/แสดง + เรียงลำดับส่วน (↑/↓) */}
            {sections.length > 0 && (() => {
              const ord = orderedKeys(theme, sections.map((s) => s.key));
              return (
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t("ส่วนต่างๆ — ติ๊ก=แสดง · ↑↓=เรียงลำดับ", "Sections — check=show · ↑↓=reorder")}</p>
                  <div className="space-y-0.5 max-h-52 overflow-y-auto">
                    {ord.map((key, idx) => (
                      <div key={key} className="flex items-center gap-1.5 text-xs text-slate-600 rounded hover:bg-slate-50 px-1 py-0.5">
                        <input type="checkbox" checked={!theme.hidden.includes(key)} onChange={() => toggleHidden(key)} className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 shrink-0" />
                        <span className="flex-1 truncate">{labelOf(key)}</span>
                        <button onClick={() => moveSection(key, -1)} disabled={idx === 0} title={t("ขึ้น", "Up")} className="h-5 w-5 flex items-center justify-center rounded text-slate-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-25 disabled:hover:bg-transparent">↑</button>
                        <button onClick={() => moveSection(key, 1)} disabled={idx === ord.length - 1} title={t("ลง", "Down")} className="h-5 w-5 flex items-center justify-center rounded text-slate-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-25 disabled:hover:bg-transparent">↓</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <p className="text-[11px] text-slate-400">{t("บันทึกอัตโนมัติ (ของคุณคนเดียว)", "Saves automatically (yours)")}</p>
          </div>
        </>
      )}
    </div>
  );
}

// สวอตช์สีต่อส่วน (ว่าง = ใช้สีหลัก/ค่าเริ่มต้น · มี ✕ ให้รีเซ็ตกลับ)
function ColorOpt({ label, value, fallback, onChange }: { label: string; value: string | null; fallback: string; onChange: (c: string | null) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <input type="color" value={value ?? fallback} onChange={(e) => onChange(e.target.value)} title={label} className={`w-8 h-7 p-0 border rounded cursor-pointer ${value ? "border-violet-300" : "border-slate-200 opacity-60"}`} />
      <span className="text-[10px] text-slate-400">{label}</span>
      {value && <button onClick={() => onChange(null)} title={tr("ใช้สีหลัก", "Use accent")} className="text-[10px] text-slate-300 hover:text-red-500 leading-none">✕</button>}
    </span>
  );
}
