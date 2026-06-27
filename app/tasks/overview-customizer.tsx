"use client";

// ============================================================
// Overview Customizer — แต่งหน้าภาพรวม "ของแต่ละคน" (per-user)
// Hero: ไล่สี / สีเดียว / รูปพื้นหลัง · การ์ด 4 ใบ: ไอคอน (emoji/รูป) + สี
// เก็บใน user_ui_prefs key=tasks_overview_theme (บันทึกอัตโนมัติ) · อัปรูปผ่าน /api/admin/upload (ต้อง files.upload)
// ============================================================

import { useState, useEffect } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";

export type CardKey = "all" | "mine" | "review" | "overdue";
export const CARD_KEYS: CardKey[] = ["all", "mine", "review", "overdue"];

export type HeroTheme = { mode: "gradient" | "solid" | "image"; color1: string; color2: string; imageUrl: string | null; title: string | null; subtitle: string | null; textColor: string };
export type CardTheme = { icon: string; iconUrl: string | null; color: string; bgUrl: string | null; label: string | null };
export type PageTheme = { mode: "none" | "color" | "image"; color: string; imageUrl: string | null };
export type OverviewTheme = { hero: HeroTheme; cards: Record<CardKey, CardTheme>; page: PageTheme };

export const DEFAULT_THEME: OverviewTheme = {
  hero: { mode: "gradient", color1: "#7c3aed", color2: "#4f46e5", imageUrl: null, title: null, subtitle: null, textColor: "#ffffff" },
  cards: {
    all: { icon: "📋", iconUrl: null, color: "slate", bgUrl: null, label: null },
    mine: { icon: "🙋", iconUrl: null, color: "violet", bgUrl: null, label: null },
    review: { icon: "🟡", iconUrl: null, color: "amber", bgUrl: null, label: null },
    overdue: { icon: "⚠️", iconUrl: null, color: "red", bgUrl: null, label: null },
  },
  page: { mode: "none", color: "#f8fafc", imageUrl: null },
};

// สีกล่องการ์ด (คลาส static — ไม่โดน purge) box=พื้น/ขอบ/ตัวอักษร · ring=กรอบเลือก · swatch=ปุ่มเลือกสี
export const CARD_COLORS: Record<string, { box: string; ring: string; swatch: string }> = {
  slate: { box: "bg-slate-50 border-slate-200 text-slate-700", ring: "ring-slate-400", swatch: "bg-slate-400" },
  violet: { box: "bg-violet-50 border-violet-200 text-violet-700", ring: "ring-violet-400", swatch: "bg-violet-500" },
  blue: { box: "bg-blue-50 border-blue-200 text-blue-700", ring: "ring-blue-400", swatch: "bg-blue-500" },
  indigo: { box: "bg-indigo-50 border-indigo-200 text-indigo-700", ring: "ring-indigo-400", swatch: "bg-indigo-500" },
  emerald: { box: "bg-emerald-50 border-emerald-200 text-emerald-700", ring: "ring-emerald-400", swatch: "bg-emerald-500" },
  amber: { box: "bg-amber-50 border-amber-200 text-amber-700", ring: "ring-amber-400", swatch: "bg-amber-500" },
  rose: { box: "bg-rose-50 border-rose-200 text-rose-700", ring: "ring-rose-400", swatch: "bg-rose-500" },
  red: { box: "bg-red-50 border-red-200 text-red-700", ring: "ring-red-400", swatch: "bg-red-500" },
  pink: { box: "bg-pink-50 border-pink-200 text-pink-700", ring: "ring-pink-400", swatch: "bg-pink-500" },
  teal: { box: "bg-teal-50 border-teal-200 text-teal-700", ring: "ring-teal-400", swatch: "bg-teal-500" },
};
const COLOR_NAMES = Object.keys(CARD_COLORS);

// รวมค่าที่เก็บไว้กับค่าเริ่มต้น (กันฟิลด์ขาด)
export function mergeTheme(v: unknown): OverviewTheme {
  const o = (v ?? {}) as Partial<OverviewTheme>;
  const cards = {} as Record<CardKey, CardTheme>;
  for (const k of CARD_KEYS) cards[k] = { ...DEFAULT_THEME.cards[k], ...(o.cards?.[k] ?? {}) };
  return { hero: { ...DEFAULT_THEME.hero, ...(o.hero ?? {}) }, cards, page: { ...DEFAULT_THEME.page, ...(o.page ?? {}) } };
}

// สไตล์พื้นหลัง Hero ตามธีม
export function heroStyle(h: HeroTheme): React.CSSProperties {
  if (h.mode === "image" && h.imageUrl) return { backgroundImage: `url(/api/r2-image?key=${encodeURIComponent(h.imageUrl)})`, backgroundSize: "cover", backgroundPosition: "center" };
  if (h.mode === "solid") return { background: h.color1 };
  return { background: `linear-gradient(135deg, ${h.color1}, ${h.color2})` };
}

// สไตล์พื้นหลังทั้งหน้า (page background)
export function pageStyle(p: PageTheme): React.CSSProperties {
  if (p.mode === "image" && p.imageUrl) return { backgroundImage: `url(/api/r2-image?key=${encodeURIComponent(p.imageUrl)})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" };
  if (p.mode === "color") return { background: p.color };
  return {};
}

const CARD_LABEL: Record<CardKey, string> = { all: "งานทั้งหมด", mine: "งานของฉัน", review: "รอตรวจ/อนุมัติ", overdue: "เกินกำหนด" };

// ===== ธีมสำเร็จรูป (preset) — กดปุ่มเดียวเปลี่ยนทั้งหน้า =====
function makePreset(c1: string, c2: string, pageColor: string | null, cardColors: [string, string, string, string]): OverviewTheme {
  return {
    hero: { ...DEFAULT_THEME.hero, mode: "gradient", color1: c1, color2: c2, textColor: "#ffffff" },
    cards: {
      all:     { ...DEFAULT_THEME.cards.all,     color: cardColors[0] },
      mine:    { ...DEFAULT_THEME.cards.mine,    color: cardColors[1] },
      review:  { ...DEFAULT_THEME.cards.review,  color: cardColors[2] },
      overdue: { ...DEFAULT_THEME.cards.overdue, color: cardColors[3] },
    },
    page: pageColor ? { mode: "color", color: pageColor, imageUrl: null } : { mode: "none", color: "#f8fafc", imageUrl: null },
  };
}

export type ThemePreset = { key: string; name: string; c1: string; c2: string; theme: OverviewTheme };
export const PRESETS: ThemePreset[] = [
  { key: "violet",   name: "ม่วงมินิมอล", c1: "#7c3aed", c2: "#4f46e5", theme: makePreset("#7c3aed", "#4f46e5", null,      ["slate", "violet", "amber", "red"]) },
  { key: "pastel",   name: "พาสเทล",       c1: "#f9a8d4", c2: "#a5b4fc", theme: makePreset("#f9a8d4", "#a5b4fc", "#fdf4ff", ["pink", "indigo", "amber", "rose"]) },
  { key: "ocean",    name: "โอเชียน",      c1: "#0ea5e9", c2: "#14b8a6", theme: makePreset("#0ea5e9", "#14b8a6", "#f0f9ff", ["blue", "teal", "amber", "rose"]) },
  { key: "sunset",   name: "ซันเซ็ต",      c1: "#fb7185", c2: "#f59e0b", theme: makePreset("#fb7185", "#f59e0b", "#fff7ed", ["rose", "amber", "violet", "red"]) },
  { key: "forest",   name: "ฟอเรสต์",      c1: "#10b981", c2: "#0d9488", theme: makePreset("#10b981", "#0d9488", "#f0fdf4", ["emerald", "teal", "amber", "rose"]) },
  { key: "graphite", name: "กราไฟต์",      c1: "#334155", c2: "#0f172a", theme: makePreset("#334155", "#0f172a", "#f1f5f9", ["slate", "blue", "amber", "red"]) },
];

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData(); fd.append("file", file); fd.append("folder", "overview-theme");
  const j = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then((r) => r.json());
  if (j.error || !j.r2_key) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
  return j.r2_key as string;
}

export function OverviewCustomizer({ open, theme, canUpload, onChange, onClose }: {
  open: boolean;
  theme: OverviewTheme;
  canUpload: boolean;
  onChange: (t: OverviewTheme) => void;   // อัปเดต + บันทึก (parent จัดการ)
  onClose: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // ธีมที่ผู้ใช้บันทึกเอง (เก็บใน user_ui_prefs key=tasks_overview_themes)
  const [saved, setSaved] = useState<{ name: string; theme: OverviewTheme }[]>([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!open) return;
    apiFetch("/api/user-prefs?key=tasks_overview_themes").then((r) => r.json())
      .then((j) => { if (j && !j.error && Array.isArray(j.value)) setSaved(j.value); }).catch(() => {});
  }, [open]);
  const persistSaved = (list: { name: string; theme: OverviewTheme }[]) => {
    setSaved(list);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "tasks_overview_themes", value: list }) });
  };
  const saveCurrent = () => {
    const name = newName.trim(); if (!name) return;
    persistSaved([...saved.filter((s) => s.name !== name), { name, theme }]);
    setNewName("");
  };

  const setHero = (p: Partial<HeroTheme>) => onChange({ ...theme, hero: { ...theme.hero, ...p } });
  const setCard = (k: CardKey, p: Partial<CardTheme>) => onChange({ ...theme, cards: { ...theme.cards, [k]: { ...theme.cards[k], ...p } } });
  const setPage = (p: Partial<PageTheme>) => onChange({ ...theme, page: { ...theme.page, ...p } });

  const doUpload = async (file: File, apply: (key: string) => void, tag: string) => {
    setBusy(tag); setErr(null);
    try { apply(await uploadImage(file)); } catch (e) { setErr(String(e)); } finally { setBusy(null); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title={t("🎨 แต่งหน้าภาพรวม (ของฉัน)", "🎨 Customize my overview")}
      footer={<>
        <button onClick={() => onChange(DEFAULT_THEME)} className="h-9 px-4 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("รีเซ็ตค่าเริ่มต้น", "Reset")}</button>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700">{t("เสร็จ", "Done")}</button>
      </>}>
      {err && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">⚠ {err}<button onClick={() => setErr(null)} className="text-red-400 hover:text-red-700">✕</button></div>}
      <p className="text-[11px] text-slate-400 mb-4">{t("ทุกการเปลี่ยนบันทึกอัตโนมัติ (เห็นผลทันที) · เป็นการแต่งของคุณคนเดียว ไม่กระทบคนอื่น", "Saves automatically (live) · personal to you")}</p>

      {/* ===== ธีมสำเร็จรูป (preset) ===== */}
      <section className="mb-5">
        <div className="text-sm font-semibold text-slate-700 mb-2">{t("ธีมสำเร็จรูป (กดเปลี่ยนทั้งหน้า)", "Preset themes (one-click)")}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => onChange(p.theme)} title={p.name}
              className="rounded-lg border border-slate-200 overflow-hidden text-left hover:border-violet-300 hover:shadow-sm transition">
              <div className="h-10" style={{ background: `linear-gradient(135deg, ${p.c1}, ${p.c2})` }} />
              <div className="px-2 py-1 text-xs font-medium text-slate-700">{p.name}</div>
            </button>
          ))}
        </div>
        {/* ธีมที่บันทึกเอง */}
        <div className="mt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("ตั้งชื่อธีมนี้แล้วบันทึก", "Name this theme to save")}
              className="h-8 px-2 text-sm border border-slate-200 rounded flex-1 min-w-[160px]" />
            <button onClick={saveCurrent} disabled={!newName.trim()} className="h-8 px-3 text-xs font-medium text-white bg-violet-600 rounded hover:bg-violet-700 disabled:opacity-40">💾 {t("บันทึกธีมของฉัน", "Save my theme")}</button>
          </div>
          {saved.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-[11px] text-slate-400">{t("ธีมของฉัน", "My themes")}:</span>
              {saved.map((s) => (
                <span key={s.name} className="inline-flex items-center gap-1 text-xs rounded-full border border-slate-200 bg-white pl-2.5 pr-1 py-0.5">
                  <button onClick={() => onChange(s.theme)} className="text-slate-700 hover:text-violet-700">{s.name}</button>
                  <button onClick={() => persistSaved(saved.filter((x) => x.name !== s.name))} className="text-slate-300 hover:text-red-500" title={t("ลบ", "Delete")}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== Hero ===== */}
      <section className="mb-5">
        <div className="text-sm font-semibold text-slate-700 mb-2">{t("แถบทักทาย (Hero)", "Greeting banner (Hero)")}</div>
        <div className="flex items-center gap-2 mb-3">
          {([["gradient", t("ไล่สี", "Gradient")], ["solid", t("สีเดียว", "Solid")], ["image", t("รูปพื้นหลัง", "Image")]] as const).map(([m, label]) => (
            <button key={m} onClick={() => setHero({ mode: m })} className={`h-8 px-3 text-sm rounded-lg border ${theme.hero.mode === m ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {/* พรีวิว */}
          <div className="h-16 w-40 rounded-lg border border-slate-200 flex items-center justify-center text-white text-xs font-medium shadow-inner" style={heroStyle(theme.hero)}>
            {theme.hero.mode === "image" && !theme.hero.imageUrl ? <span className="text-slate-400">{t("ยังไม่มีรูป", "No image")}</span> : t("ตัวอย่าง", "Preview")}
          </div>
          {theme.hero.mode !== "image" && (
            <label className="flex items-center gap-2 text-xs text-slate-600">{t("สีหลัก", "Color 1")}
              <input type="color" value={theme.hero.color1} onChange={(e) => setHero({ color1: e.target.value })} className="w-9 h-8 p-0 border border-slate-200 rounded cursor-pointer" /></label>
          )}
          {theme.hero.mode === "gradient" && (
            <label className="flex items-center gap-2 text-xs text-slate-600">{t("สีที่สอง", "Color 2")}
              <input type="color" value={theme.hero.color2} onChange={(e) => setHero({ color2: e.target.value })} className="w-9 h-8 p-0 border border-slate-200 rounded cursor-pointer" /></label>
          )}
          {theme.hero.mode === "image" && (
            canUpload ? (
              <div className="flex items-center gap-2">
                <label className={`h-8 px-3 leading-8 text-xs font-medium rounded cursor-pointer ${busy === "hero" ? "bg-slate-200 text-slate-400" : "bg-violet-600 text-white hover:bg-violet-700"}`}>
                  {busy === "hero" ? t("กำลังอัป…", "Uploading…") : t("⬆ อัปโหลดรูป", "⬆ Upload")}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy === "hero"}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f, (k) => setHero({ imageUrl: k }), "hero"); e.target.value = ""; }} /></label>
                {theme.hero.imageUrl && <button onClick={() => setHero({ imageUrl: null })} className="text-[11px] text-rose-500 hover:text-rose-700">{t("ลบรูป", "Remove")}</button>}
              </div>
            ) : <span className="text-[11px] text-amber-600">{t("ต้องมีสิทธิ์อัปโหลดไฟล์ถึงจะใส่รูปได้", "Need file-upload permission for images")}</span>
          )}
        </div>
        {/* ข้อความ + สีตัวอักษร Hero */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          <label className="text-xs text-slate-500">{t("ข้อความทักทาย (เว้นว่าง = ใช้ค่าเริ่มต้น)", "Greeting text (blank = default)")}
            <input value={theme.hero.title ?? ""} onChange={(e) => setHero({ title: e.target.value || null })} placeholder={t("เช่น สวัสดีทีมครีเอทีฟ 👋", "e.g. Hi creative team 👋")} className="mt-1 w-full h-8 px-2 text-sm border border-slate-200 rounded" /></label>
          <label className="text-xs text-slate-500">{t("ข้อความรอง (เว้นว่าง = สรุปงานอัตโนมัติ)", "Subtitle (blank = auto summary)")}
            <input value={theme.hero.subtitle ?? ""} onChange={(e) => setHero({ subtitle: e.target.value || null })} placeholder={t("เช่น ลุยงานวันนี้กันเลย!", "e.g. Let's get to work!")} className="mt-1 w-full h-8 px-2 text-sm border border-slate-200 rounded" /></label>
          <label className="flex items-center gap-2 text-xs text-slate-600">{t("สีตัวอักษร", "Text color")}
            <input type="color" value={theme.hero.textColor} onChange={(e) => setHero({ textColor: e.target.value })} className="w-9 h-8 p-0 border border-slate-200 rounded cursor-pointer" /></label>
        </div>
      </section>

      {/* ===== พื้นหลังทั้งหน้า ===== */}
      <section className="mb-5">
        <div className="text-sm font-semibold text-slate-700 mb-2">{t("พื้นหลังทั้งหน้า", "Page background")}</div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {([["none", t("ไม่มี", "None")], ["color", t("สีเดียว", "Solid")], ["image", t("รูปภาพ", "Image")]] as const).map(([m, label]) => (
            <button key={m} onClick={() => setPage({ mode: m })} className={`h-8 px-3 text-sm rounded-lg border ${theme.page.mode === m ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>
          ))}
          {theme.page.mode === "color" && (
            <label className="flex items-center gap-2 text-xs text-slate-600">{t("สี", "Color")}
              <input type="color" value={theme.page.color} onChange={(e) => setPage({ color: e.target.value })} className="w-9 h-8 p-0 border border-slate-200 rounded cursor-pointer" /></label>
          )}
          {theme.page.mode === "image" && (
            canUpload ? (
              <div className="flex items-center gap-2">
                <label className={`h-8 px-3 leading-8 text-xs font-medium rounded cursor-pointer ${busy === "page" ? "bg-slate-200 text-slate-400" : "bg-violet-600 text-white hover:bg-violet-700"}`}>
                  {busy === "page" ? t("กำลังอัป…", "Uploading…") : t("⬆ อัปโหลดรูป", "⬆ Upload")}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy === "page"}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f, (k) => setPage({ imageUrl: k }), "page"); e.target.value = ""; }} /></label>
                {theme.page.imageUrl && <button onClick={() => setPage({ imageUrl: null })} className="text-[11px] text-rose-500 hover:text-rose-700">{t("ลบรูป", "Remove")}</button>}
              </div>
            ) : <span className="text-[11px] text-amber-600">{t("ต้องมีสิทธิ์อัปโหลดไฟล์ถึงจะใส่รูปได้", "Need file-upload permission for images")}</span>
          )}
        </div>
        <p className="text-[11px] text-slate-400">{t("รูปพื้นหลังจะอยู่หลังการ์ด/ตาราง (มีฉากจางทับให้อ่านง่าย)", "Background sits behind cards/table (with a soft scrim for readability)")}</p>
      </section>

      {/* ===== Cards ===== */}
      <section>
        <div className="text-sm font-semibold text-slate-700 mb-2">{t("การ์ดสรุป (ไอคอน · รูปเต็ม · ชื่อ · สี)", "Summary cards (icon · full image · label · color)")}</div>
        <div className="space-y-2">
          {CARD_KEYS.map((k) => {
            const c = theme.cards[k];
            return (
              <div key={k} className={`flex flex-wrap items-center gap-2 p-2.5 rounded-lg border ${CARD_COLORS[c.color]?.box ?? CARD_COLORS.slate.box}`}>
                <div className="w-9 h-9 rounded-lg bg-white/70 border border-white flex items-center justify-center overflow-hidden shrink-0">
                  {c.bgUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={`/api/r2-image?key=${encodeURIComponent(c.bgUrl)}&w=120`} alt="" className="w-full h-full object-cover" />
                    : c.iconUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={`/api/r2-image?key=${encodeURIComponent(c.iconUrl)}`} alt="" className="w-7 h-7 object-contain" />
                    : <span className="text-lg">{c.icon}</span>}
                </div>
                <input value={c.label ?? ""} onChange={(e) => setCard(k, { label: e.target.value || null })} placeholder={t(CARD_LABEL[k], k)} className="text-sm font-medium w-28 shrink-0 h-7 px-1.5 border border-slate-200 rounded bg-white" title={t("ชื่อการ์ด (เว้นว่าง = ค่าเริ่มต้น)", "Card label (blank = default)")} />
                <input value={c.icon} onChange={(e) => setCard(k, { icon: e.target.value })} placeholder="emoji" className="w-12 h-7 px-1 text-center text-base border border-slate-200 rounded bg-white" title={t("ไอคอน emoji", "emoji icon")} />
                {canUpload && (
                  <label className={`h-7 px-2 leading-7 text-[11px] font-medium rounded cursor-pointer ${busy === `c:${k}` ? "bg-slate-200 text-slate-400" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    {busy === `c:${k}` ? "…" : t("⬆ ไอคอน", "⬆ Icon")}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy === `c:${k}`}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f, (key) => setCard(k, { iconUrl: key }), `c:${k}`); e.target.value = ""; }} /></label>
                )}
                {c.iconUrl && <button onClick={() => setCard(k, { iconUrl: null })} className="text-[11px] text-rose-500 hover:text-rose-700">×</button>}
                {canUpload && (
                  <label className={`h-7 px-2 leading-7 text-[11px] font-medium rounded cursor-pointer ${busy === `cb:${k}` ? "bg-slate-200 text-slate-400" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    {busy === `cb:${k}` ? "…" : (c.bgUrl ? t("เปลี่ยนรูปเต็ม", "Full") : t("⬆ รูปเต็ม", "⬆ Full"))}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy === `cb:${k}`}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f, (key) => setCard(k, { bgUrl: key }), `cb:${k}`); e.target.value = ""; }} /></label>
                )}
                {c.bgUrl && <button onClick={() => setCard(k, { bgUrl: null })} className="text-[11px] text-rose-500 hover:text-rose-700">{t("ลบรูปเต็ม", "× full")}</button>}
                <div className="flex items-center gap-1 ml-auto flex-wrap">
                  {COLOR_NAMES.map((name) => (
                    <button key={name} onClick={() => setCard(k, { color: name })} title={name}
                      className={`w-5 h-5 rounded-full ${CARD_COLORS[name].swatch} ${c.color === name ? "ring-2 ring-offset-1 ring-slate-500" : ""}`} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </ERPModal>
  );
}
