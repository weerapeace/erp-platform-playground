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
import { tr } from "@/lib/lang";
import { KanbanSettingsControls } from "./kanban-settings";
import { useCreativeStatuses } from "./use-statuses";

export type CardKey = "all" | "mine" | "review" | "overdue";
export const CARD_KEYS: CardKey[] = ["all", "mine", "review", "overdue"];

export type HeroTheme = { mode: "gradient" | "solid" | "image"; color1: string; color2: string; imageUrl: string | null; title: string | null; subtitle: string | null; textColor: string; titleSize?: "sm" | "md" | "lg" | "xl"; align?: "left" | "center"; petUrl?: string | null; petLottieUrl?: string | null; petFrames?: string[] | null };
export type CardTheme = { icon: string; iconUrl: string | null; color: string; bgUrl: string | null; label: string | null };
export type PageTheme = { mode: "none" | "color" | "image"; color: string; imageUrl: string | null };
export type SectionsTheme = { shortcuts: boolean; campaigns: boolean; filters: boolean };
// มุมมองงานหลัก: Kanban การ์ด (ลากเปลี่ยนสถานะ) หรือ ตาราง · ปรับการจัดกลุ่ม + ข้อมูลบนการ์ดได้
export type KanbanGroupBy = "status" | "brand" | "priority" | "task_type";
export type KanbanView = "kanban" | "table" | "calendar";
export type KanbanTheme = { view: KanbanView; groupBy: KanbanGroupBy; cover: boolean; brand: boolean; assignee: boolean; due: boolean; priority: boolean; progress: boolean; brandBorder: boolean; sku?: boolean; taskNo?: boolean; taskType?: boolean; compact?: boolean };
export type CardAlign = "left" | "center" | "right";
export type AnimTheme = { hover?: boolean; entrance?: boolean; heroGradient?: boolean };
// สีสถานะ "ของฉัน" (per-user): key=status key → c1 (สีหลัก) + c2 (ไล่สี, เว้น=สีเดียว)
export type StatusColorMap = Record<string, { c1: string; c2?: string | null }>;
// PET แจ้งเตือน: เปิด/ปิด + เลือกว่าจะเด้งเตือนเมื่อมีงานแบบไหน + แต่งหน้าตา/ตำแหน่ง
export type PetCorner = "br" | "bl" | "tr" | "tl";
export type PetConfig = { notify: boolean; overdue: boolean; review: boolean; dueToday: boolean; newTasks: boolean; corner?: PetCorner; size?: number; greeting?: string | null; emojiHappy?: string; emojiAlert?: string; frameMs?: number };
export type FontScale = "sm" | "md" | "lg" | "xl";
export type Density = "compact" | "normal" | "spacious";
export type OverviewTheme = { hero: HeroTheme; cards: Record<CardKey, CardTheme>; page: PageTheme; show: SectionsTheme; accent: string; kanban: KanbanTheme; cardIconSize?: number; cardLabelSize?: number; cardValueSize?: number; cardAlign?: CardAlign; anim?: AnimTheme; statusColors?: StatusColorMap; fontFamily?: string; fontScale?: FontScale; density?: Density; cardValueColor?: string | null; cardLabelColor?: string | null; pet?: PetConfig };

// ===== ฟอนต์ทั้งหน้า (โหลด Google Fonts เฉพาะตอนเลือก) =====
export const OV_FONTS: { key: string; label: () => string; stack: string; google?: string }[] = [
  { key: "default", label: () => tr("ค่าเริ่มต้น", "Default"), stack: "" },
  { key: "sarabun", label: () => "Sarabun", stack: "'Sarabun', sans-serif", google: "Sarabun:wght@400;600;700" },
  { key: "prompt", label: () => "Prompt", stack: "'Prompt', sans-serif", google: "Prompt:wght@400;600;700" },
  { key: "kanit", label: () => "Kanit", stack: "'Kanit', sans-serif", google: "Kanit:wght@400;600;700" },
  { key: "mitr", label: () => "Mitr", stack: "'Mitr', sans-serif", google: "Mitr:wght@400;500;700" },
  { key: "ibmthai", label: () => "IBM Plex Thai", stack: "'IBM Plex Sans Thai', sans-serif", google: "IBM+Plex+Sans+Thai:wght@400;500;600" },
  { key: "serif", label: () => tr("ตัวมีหัว (Serif)", "Serif"), stack: "Georgia, 'Times New Roman', serif" },
  { key: "mono", label: () => tr("ตัวพิมพ์ดีด (Mono)", "Mono"), stack: "ui-monospace, 'Courier New', monospace" },
];
export function fontStack(key?: string): string { return OV_FONTS.find((f) => f.key === key)?.stack ?? ""; }
export function fontGoogleHref(key?: string): string | null {
  const g = OV_FONTS.find((f) => f.key === key)?.google;
  return g ? `https://fonts.googleapis.com/css2?family=${g}&display=swap` : null;
}
// ขนาดตัวอักษรทั้งหน้า (ใช้ zoom เพื่อให้ขยายทุกข้อความพร้อมกัน)
export const OV_ZOOM: Record<FontScale, number> = { sm: 0.92, md: 1, lg: 1.1, xl: 1.2 };
// ความหนาแน่น: ระยะห่างแนวตั้ง + ช่องไฟการ์ด + padding ในการ์ดสรุป
export const OV_DENSITY: Record<Density, { space: string; gap: string; cardPad: string }> = {
  compact: { space: "space-y-4", gap: "gap-2", cardPad: "p-3" },
  normal: { space: "space-y-6", gap: "gap-3", cardPad: "p-4" },
  spacious: { space: "space-y-8", gap: "gap-5", cardPad: "p-5" },
};

// สไตล์สีสถานะตามที่ผู้ใช้ตั้งเอง (ไล่สีถ้ามี c2) — คืน null ถ้าไม่ได้ตั้ง (ใช้สีเริ่มต้น)
export function ovStatusBg(theme: OverviewTheme, key: string): string | null {
  const c = theme.statusColors?.[key]; if (!c?.c1) return null;
  return c.c2 ? `linear-gradient(135deg, ${c.c1}, ${c.c2})` : c.c1;
}

export const DEFAULT_THEME: OverviewTheme = {
  hero: { mode: "gradient", color1: "#7c3aed", color2: "#4f46e5", imageUrl: null, title: null, subtitle: null, textColor: "#ffffff", titleSize: "lg", align: "left", petUrl: null, petLottieUrl: null, petFrames: null },
  cards: {
    all: { icon: "📋", iconUrl: null, color: "slate", bgUrl: null, label: null },
    mine: { icon: "🙋", iconUrl: null, color: "violet", bgUrl: null, label: null },
    review: { icon: "🟡", iconUrl: null, color: "amber", bgUrl: null, label: null },
    overdue: { icon: "⚠️", iconUrl: null, color: "red", bgUrl: null, label: null },
  },
  page: { mode: "none", color: "#f8fafc", imageUrl: null },
  show: { shortcuts: true, campaigns: true, filters: true },
  accent: "#7c3aed",   // สีหลัก (ปุ่ม/ไฮไลต์) ของหน้า
  kanban: { view: "kanban", groupBy: "status", cover: true, brand: true, assignee: true, due: true, priority: true, progress: true, brandBorder: false, sku: true, taskNo: true, taskType: true, compact: false },
  cardIconSize: 18,    // ขนาดไอคอนการ์ดสรุป (px)
  cardLabelSize: 14,   // ขนาดตัวอักษร "หัวข้อ" บนการ์ด (px)
  cardValueSize: 24,   // ขนาดตัวเลข "จำนวนงาน" บนการ์ด (px)
  cardAlign: "left",   // ตำแหน่งตัวอักษรบนการ์ด (ซ้าย/กลาง/ขวา)
  anim: { hover: false, entrance: false, heroGradient: false },
  statusColors: {},
  fontFamily: "default",
  fontScale: "md",
  density: "normal",
  cardValueColor: null,   // เว้น = สีตามชุดสีการ์ด
  cardLabelColor: null,
  pet: { notify: false, overdue: true, review: true, dueToday: true, newTasks: true, corner: "br", size: 64, greeting: null, emojiHappy: "🐥", emojiAlert: "🙀", frameMs: 400 },
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
  return { hero: { ...DEFAULT_THEME.hero, ...(o.hero ?? {}) }, cards, page: { ...DEFAULT_THEME.page, ...(o.page ?? {}) }, show: { ...DEFAULT_THEME.show, ...(o.show ?? {}) }, accent: (o.accent as string) ?? DEFAULT_THEME.accent, kanban: { ...DEFAULT_THEME.kanban, ...(o.kanban ?? {}) }, cardIconSize: (o.cardIconSize as number) ?? DEFAULT_THEME.cardIconSize, cardLabelSize: (o.cardLabelSize as number) ?? DEFAULT_THEME.cardLabelSize, cardValueSize: (o.cardValueSize as number) ?? DEFAULT_THEME.cardValueSize, cardAlign: (o.cardAlign as CardAlign) ?? DEFAULT_THEME.cardAlign, anim: { ...DEFAULT_THEME.anim, ...(o.anim ?? {}) }, statusColors: (o.statusColors as StatusColorMap) ?? {}, fontFamily: (o.fontFamily as string) ?? DEFAULT_THEME.fontFamily, fontScale: (o.fontScale as FontScale) ?? DEFAULT_THEME.fontScale, density: (o.density as Density) ?? DEFAULT_THEME.density, cardValueColor: (o.cardValueColor as string | null) ?? null, cardLabelColor: (o.cardLabelColor as string | null) ?? null, pet: { ...DEFAULT_THEME.pet!, ...(o.pet ?? {}) } };
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

const CARD_LABEL: Record<CardKey, () => string> = {
  all: () => tr("งานทั้งหมด", "All tasks"),
  mine: () => tr("งานของฉัน", "My tasks"),
  review: () => tr("รอตรวจ/อนุมัติ", "In review"),
  overdue: () => tr("เกินกำหนด", "Overdue"),
};

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
    show: { ...DEFAULT_THEME.show },
    accent: c1,   // สีหลักตามธีม
    kanban: { ...DEFAULT_THEME.kanban },
  };
}

export type ThemePreset = { key: string; name: () => string; c1: string; c2: string; theme: OverviewTheme };
export const PRESETS: ThemePreset[] = [
  { key: "violet",   name: () => tr("ม่วงมินิมอล", "Minimal Violet"), c1: "#7c3aed", c2: "#4f46e5", theme: makePreset("#7c3aed", "#4f46e5", null,      ["slate", "violet", "amber", "red"]) },
  { key: "pastel",   name: () => tr("พาสเทล", "Pastel"),       c1: "#f9a8d4", c2: "#a5b4fc", theme: makePreset("#f9a8d4", "#a5b4fc", "#fdf4ff", ["pink", "indigo", "amber", "rose"]) },
  { key: "ocean",    name: () => tr("โอเชียน", "Ocean"),      c1: "#0ea5e9", c2: "#14b8a6", theme: makePreset("#0ea5e9", "#14b8a6", "#f0f9ff", ["blue", "teal", "amber", "rose"]) },
  { key: "sunset",   name: () => tr("ซันเซ็ต", "Sunset"),      c1: "#fb7185", c2: "#f59e0b", theme: makePreset("#fb7185", "#f59e0b", "#fff7ed", ["rose", "amber", "violet", "red"]) },
  { key: "forest",   name: () => tr("ฟอเรสต์", "Forest"),      c1: "#10b981", c2: "#0d9488", theme: makePreset("#10b981", "#0d9488", "#f0fdf4", ["emerald", "teal", "amber", "rose"]) },
  { key: "graphite", name: () => tr("กราไฟต์", "Graphite"),      c1: "#334155", c2: "#0f172a", theme: makePreset("#334155", "#0f172a", "#f1f5f9", ["slate", "blue", "amber", "red"]) },
];

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData(); fd.append("file", file); fd.append("folder", "overview-theme");
  const j = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then((r) => r.json());
  if (j.error || !j.r2_key) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
  return j.r2_key as string;
}

// ตัวช่วย prompt สร้างรูป PET — พิมพ์ตัวการ์ตูนที่อยากได้ แล้วคัดลอก prompt ไปวางใน AI สร้างรูป
function PetPromptHelper() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("a chubby baby chick");
  const [copied, setCopied] = useState<number | null>(null);
  const base = subject.trim() || "a chubby baby chick";
  const prompts: { label: string; text: string }[] = [
    { label: t("ท่าปกติ (ลืมตา ยิ้ม)", "Idle (eyes open, smiling)"),
      text: `A cute mascot character, ${base}, friendly big smile, large sparkly eyes, arms down relaxed, simple flat vector sticker style, thick clean outlines, soft pastel colors, full body front view, centered, isolated on a fully transparent background, high quality, 512x512` },
    { label: t("ท่าขยับ (หลับตา โบกมือ) — สำหรับหลายรูป", "Motion (blink, waving) — for multi-frame"),
      text: `The SAME mascot (${base}), identical style and colors, but eyes closed (blinking) and both arms raised waving, full body front view, centered, isolated on a fully transparent background, 512x512` },
    { label: t("ท่าตกใจ (สำหรับหน้า alert)", "Alert face (worried)"),
      text: `The SAME mascot (${base}), identical style and colors, worried panicked expression, wide eyes, a sweat drop, holding a small red "!" alert sign, full body front view, centered, isolated on a fully transparent background, 512x512` },
  ];
  const copy = async (i: number, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500); } catch { /* clipboard ไม่ให้ */ }
  };
  return (
    <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
        <span>{open ? "▾" : "▸"}</span>💡 {t("ตัวช่วย: prompt สร้างรูป PET (คัดลอกได้)", "Helper: prompts to create a PET image (copyable)")}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <label className="block text-[11px] text-slate-500">{t("ตัวการ์ตูนที่อยากได้ (พิมพ์อังกฤษได้ผลดีกว่า)", "Character you want (English works best)")}
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="a chubby baby chick / a fluffy orange cat / a little robot" className="mt-1 w-full h-8 px-2 text-sm border border-slate-200 rounded bg-white" />
          </label>
          {prompts.map((p, i) => (
            <div key={i} className="rounded border border-slate-200 bg-white p-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-medium text-slate-600">{p.label}</span>
                <button onClick={() => copy(i, p.text)} className="h-6 px-2 text-[11px] font-medium rounded bg-violet-600 text-white hover:bg-violet-700 shrink-0">{copied === i ? t("คัดลอกแล้ว ✓", "Copied ✓") : t("คัดลอก prompt", "Copy prompt")}</button>
              </div>
              <textarea readOnly value={p.text} rows={2} onFocus={(e) => e.currentTarget.select()} className="w-full text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded px-2 py-1 resize-none" />
            </div>
          ))}
          <p className="text-[11px] text-slate-400">{t("วิธีใช้: คัดลอก → วางในแอปสร้างรูป AI (ChatGPT/DALL·E, Midjourney, Ideogram, Firefly) → ลบพื้นหลังให้โปร่งใสถ้าจำเป็น (remove.bg) → อัปที่ช่อง “หลายรูป” ด้านบน (2-3 ท่า = ขยับ)", "How to: copy → paste into an AI image tool → make the background transparent if needed (remove.bg) → upload to “Multi-frame” above (2-3 poses = animation)")}</p>
        </div>
      )}
    </div>
  );
}

export function OverviewCustomizer({ open, theme, canUpload, isAdmin, onChange, onClose }: {
  open: boolean;
  theme: OverviewTheme;
  canUpload: boolean;
  isAdmin?: boolean;
  onChange: (t: OverviewTheme) => void;   // อัปเดต + บันทึก (parent จัดการ)
  onClose: () => void;
}) {
  const t = useT();
  const { statuses } = useCreativeStatuses();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // ธีมที่ผู้ใช้บันทึกเอง (เก็บใน user_ui_prefs key=tasks_overview_themes)
  const [saved, setSaved] = useState<{ name: string; theme: OverviewTheme }[]>([]);
  const [newName, setNewName] = useState("");
  const [teamMsg, setTeamMsg] = useState<string | null>(null);

  // (แอดมิน) ตั้งธีมปัจจุบันเป็นค่าเริ่มต้นของทีม — เก็บ ui_config (global) คนที่ยังไม่เคยแต่งจะได้ธีมนี้
  const setTeamDefault = async () => {
    setTeamMsg(t("กำลังบันทึก…", "Saving…"));
    try {
      const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "tasks_overview_theme_default", value: theme }) });
      setTeamMsg((await r.json()).error ? t("บันทึกไม่สำเร็จ", "Failed") : t("ตั้งเป็นธีมทีมแล้ว ✓", "Set as team default ✓"));
    } catch { setTeamMsg(t("บันทึกไม่สำเร็จ", "Failed")); }
    setTimeout(() => setTeamMsg(null), 2500);
  };

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
  const setShow = (p: Partial<SectionsTheme>) => onChange({ ...theme, show: { ...theme.show, ...p } });
  const setKanban = (p: Partial<KanbanTheme>) => onChange({ ...theme, kanban: { ...theme.kanban, ...p } });
  const setAnim = (p: Partial<AnimTheme>) => onChange({ ...theme, anim: { ...theme.anim, ...p } });
  const setPet = (p: Partial<PetConfig>) => onChange({ ...theme, pet: { ...(theme.pet ?? DEFAULT_THEME.pet!), ...p } });
  // หลายรูป (เฟรมอนิเมชั่น): อัปหลายไฟล์→ต่อท้าย, สลับลำดับ, ลบ
  const addFrames = async (files: FileList) => {
    setBusy("frames"); setErr(null);
    try {
      const keys: string[] = [];
      for (const f of Array.from(files)) keys.push(await uploadImage(f));
      setHero({ petFrames: [...(theme.hero.petFrames ?? []), ...keys] });
    } catch (e) { setErr(String(e)); } finally { setBusy(null); }
  };
  const moveFrame = (i: number, dir: -1 | 1) => {
    const a = [...(theme.hero.petFrames ?? [])]; const j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; setHero({ petFrames: a });
  };
  const removeFrame = (i: number) => {
    const a = [...(theme.hero.petFrames ?? [])]; a.splice(i, 1); setHero({ petFrames: a });
  };
  const setStatusColor = (key: string, c: { c1: string; c2?: string | null } | null) => {
    const next = { ...(theme.statusColors ?? {}) }; if (c) next[key] = c; else delete next[key];
    onChange({ ...theme, statusColors: next });
  };

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
            <button key={p.key} onClick={() => onChange(p.theme)} title={p.name()}
              className="rounded-lg border border-slate-200 overflow-hidden text-left hover:border-violet-300 hover:shadow-sm transition">
              <div className="h-10" style={{ background: `linear-gradient(135deg, ${p.c1}, ${p.c2})` }} />
              <div className="px-2 py-1 text-xs font-medium text-slate-700">{p.name()}</div>
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
          {isAdmin && (
            <div className="flex items-center gap-2 mt-2">
              <button onClick={setTeamDefault} className="h-8 px-3 text-xs font-medium text-slate-700 border border-slate-200 rounded hover:bg-slate-50">🏢 {t("ตั้งธีมนี้เป็นค่าเริ่มต้นของทีม", "Set as team default")}</button>
              {teamMsg && <span className="text-[11px] text-emerald-600">{teamMsg}</span>}
              <span className="text-[11px] text-slate-400">{t("(คนที่ยังไม่เคยแต่งหน้าจะได้ธีมนี้)", "(new users get this theme)")}</span>
            </div>
          )}
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

      {/* ===== สีหลักของหน้า (accent) ===== */}
      <section className="mb-5">
        <div className="text-sm font-semibold text-slate-700 mb-1">{t("สีหลักของหน้า (ปุ่ม/ไฮไลต์)", "Page accent (buttons/highlights)")}</div>
        <div className="flex items-center gap-3">
          <input type="color" value={theme.accent} onChange={(e) => onChange({ ...theme, accent: e.target.value })} className="w-10 h-9 p-0 border border-slate-200 rounded cursor-pointer" />
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="px-2.5 py-1 rounded-lg text-white text-[11px] font-medium" style={{ background: theme.accent }}>{t("ตัวอย่างปุ่ม", "Button")}</span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-medium border" style={{ borderColor: theme.accent, color: theme.accent, background: theme.accent + "14" }}>{t("ตัวกรอง", "Chip")}</span>
          </span>
          <span className="text-[11px] text-slate-400">{t("ใช้กับแถบกรอง/ปุ่มลัด/ลิงก์บนหน้าภาพรวม", "Applies to filters/links on the overview")}</span>
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
        {/* ขนาด/ตำแหน่งหัวข้อ + ไอคอนลอย (Pet) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{t("ขนาดหัวข้อ", "Title size")}</span>
            {(["sm", "md", "lg", "xl"] as const).map((s) => (
              <button key={s} onClick={() => setHero({ titleSize: s })} className={`h-7 w-9 text-xs rounded border ${(theme.hero.titleSize ?? "lg") === s ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{s.toUpperCase()}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{t("ตำแหน่ง", "Align")}</span>
            {([["left", t("ซ้าย", "Left")], ["center", t("กลาง", "Center")]] as const).map(([a, lbl]) => (
              <button key={a} onClick={() => setHero({ align: a })} className={`h-7 px-2.5 text-xs rounded border ${(theme.hero.align ?? "left") === a ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{lbl}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{t("ไอคอนลอย (Pet)", "Floating pet")}</span>
            {canUpload ? (
              <label className={`h-7 px-2 leading-7 text-[11px] font-medium rounded cursor-pointer ${busy === "pet" ? "bg-slate-200 text-slate-400" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`} title={t("รองรับ GIF — ลอยมุมล่างขวาของแถบ Hero", "Supports GIF — floats at the hero's bottom-right")}>
                {busy === "pet" ? "…" : (theme.hero.petUrl ? t("เปลี่ยน", "Change") : t("⬆ อัปโหลด (GIF ได้)", "⬆ Upload (GIF ok)"))}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={busy === "pet"} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f, (k) => setHero({ petUrl: k }), "pet"); e.target.value = ""; }} /></label>
            ) : <span className="text-[11px] text-amber-600">{t("ต้องมีสิทธิ์อัปโหลด", "Need upload permission")}</span>}
            {theme.hero.petUrl && <button onClick={() => setHero({ petUrl: null })} className="text-[11px] text-rose-500 hover:text-rose-700">{t("ลบ", "Remove")}</button>}
          </div>
          {/* Lottie (ขยับลื่น ไฟล์เล็ก) — อัปโหลด .json หรือวางลิงก์ · ใช้แทนรูป/GIF ถ้าตั้งไว้ */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{t("Lottie (ขยับลื่น)", "Lottie (smooth)")}</span>
            {canUpload && (
              <label className={`h-7 px-2 leading-7 text-[11px] font-medium rounded cursor-pointer ${busy === "lottie" ? "bg-slate-200 text-slate-400" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`} title={t("อัปโหลดไฟล์ .json (ดาวน์โหลดฟรีจาก LottieFiles)", "Upload a .json (free from LottieFiles)")}>
                {busy === "lottie" ? "…" : (theme.hero.petLottieUrl ? t("เปลี่ยน", "Change") : t("⬆ อัปโหลด .json", "⬆ Upload .json"))}
                <input type="file" accept=".json,application/json" className="hidden" disabled={busy === "lottie"} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f, (k) => setHero({ petLottieUrl: k }), "lottie"); e.target.value = ""; }} />
              </label>
            )}
            <input value={(theme.hero.petLottieUrl && /^https?:/i.test(theme.hero.petLottieUrl)) ? theme.hero.petLottieUrl : ""} onChange={(e) => setHero({ petLottieUrl: e.target.value.trim() || null })} placeholder={t("หรือวางลิงก์ .json", "or paste .json URL")} className="h-7 px-2 text-[11px] border border-slate-200 rounded w-40" />
            {theme.hero.petLottieUrl && <button onClick={() => setHero({ petLottieUrl: null })} className="text-[11px] text-rose-500 hover:text-rose-700">{t("ลบ", "Remove")}</button>}
          </div>
          <p className="text-[11px] text-slate-400">{t("Lottie = อนิเมชั่นเวกเตอร์ ขยับลื่น ไฟล์เล็ก (ดาวน์โหลดฟรีที่ lottiefiles.com → Lottie JSON) · ถ้าตั้ง Lottie จะใช้แทนรูป/GIF", "Lottie = smooth vector animation, tiny file (free at lottiefiles.com → Lottie JSON) · overrides image/GIF when set")}</p>
          {/* หลายรูป (เฟรมอนิเมชั่น) — อัปหลาย PNG แล้วระบบสลับให้ขยับ */}
          <div className="pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">{t("หลายรูป (สลับให้ขยับ)", "Multi-frame (animate)")}</span>
              {canUpload ? (
                <label className={`h-7 px-2 leading-7 text-[11px] font-medium rounded cursor-pointer ${busy === "frames" ? "bg-slate-200 text-slate-400" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`} title={t("เลือกได้หลายรูปพร้อมกัน — ระบบจะสลับรูปเรียงซ้าย→ขวา", "Pick several at once — frames play left→right")}>
                  {busy === "frames" ? "…" : t("⬆ เพิ่มรูป (เลือกหลายรูปได้)", "⬆ Add frames (multi-select)")}
                  <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy === "frames"} onChange={(e) => { const fs = e.target.files; if (fs && fs.length) void addFrames(fs); e.target.value = ""; }} />
                </label>
              ) : <span className="text-[11px] text-amber-600">{t("ต้องมีสิทธิ์อัปโหลด", "Need upload permission")}</span>}
              {(theme.hero.petFrames?.length ?? 0) >= 2 && (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{t("ความเร็ว", "Speed")}</span>
                  <input type="range" min={150} max={1000} step={50} value={theme.pet?.frameMs ?? 400} onChange={(e) => setPet({ frameMs: Number(e.target.value) })} className="w-24 accent-violet-600" />
                  <span className="text-[11px] text-slate-400 w-12">{theme.pet?.frameMs ?? 400}ms</span>
                </span>
              )}
            </div>
            {(theme.hero.petFrames?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {(theme.hero.petFrames ?? []).map((k, i) => (
                  <div key={`${k}-${i}`} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/r2-image?key=${encodeURIComponent(k)}&w=120`} alt="" className="w-12 h-12 object-contain rounded border border-slate-200 bg-slate-50" />
                    <span className="absolute -top-1.5 -left-1.5 bg-slate-700 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{i + 1}</span>
                    <div className="flex items-center justify-center gap-0.5 mt-0.5">
                      <button onClick={() => moveFrame(i, -1)} disabled={i === 0} className="text-[11px] text-slate-400 hover:text-violet-600 disabled:opacity-30" title={t("เลื่อนซ้าย", "Move left")}>◀</button>
                      <button onClick={() => removeFrame(i)} className="text-[11px] text-rose-400 hover:text-rose-600" title={t("ลบ", "Remove")}>✕</button>
                      <button onClick={() => moveFrame(i, 1)} disabled={i === (theme.hero.petFrames?.length ?? 0) - 1} className="text-[11px] text-slate-400 hover:text-violet-600 disabled:opacity-30" title={t("เลื่อนขวา", "Move right")}>▶</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-1">{t("ใส่ 2 รูปขึ้นไป PET จะสลับรูปไปมา = ขยับ (เช่น ลืมตา/หลับตา, ยกมือขึ้น/ลง) · เรียงลำดับด้วย ◀ ▶ · ใช้แทน Lottie/รูปเดี่ยวถ้าตั้งไว้", "2+ frames make the pet animate (e.g. eyes open/closed) · reorder with ◀ ▶ · overrides Lottie/single image when set")}</p>
          </div>
        </div>
        <PetPromptHelper />
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

      {/* ===== ส่วนที่แสดงบนหน้า ===== */}
      <section className="mb-5">
        <div className="text-sm font-semibold text-slate-700 mb-2">{t("ส่วนที่แสดงบนหน้า", "Sections to show")}</div>
        <div className="flex flex-wrap gap-3">
          {([["shortcuts", t("ทางลัด", "Shortcuts")], ["filters", t("แถบกรอง (ประเภท/แบรนด์)", "Filter bar")], ["campaigns", t("แคมเปญที่กำลังทำ", "Active campaigns")]] as const).map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={theme.show[k]} onChange={(e) => setShow({ [k]: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />{label}
            </label>
          ))}
        </div>
      </section>

      {/* ===== มุมมองงานหลัก (Kanban / ตาราง) ===== */}
      <section className="mb-5">
        <div className="text-sm font-semibold text-slate-700 mb-2">{t("มุมมองงานหลัก", "Main task view")}</div>
        {/* เลือกแบบ Kanban / ตาราง */}
        <div className="flex items-center gap-2 mb-3">
          {([["kanban", t("📋 การ์ด Kanban", "📋 Kanban cards")], ["table", t("▦ ตาราง", "▦ Table")], ["calendar", t("🗓 ปฏิทิน", "🗓 Calendar")]] as const).map(([m, label]) => (
            <button key={m} onClick={() => setKanban({ view: m })} className={`h-8 px-3 text-sm rounded-lg border ${theme.kanban.view === m ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>
          ))}
        </div>
        {theme.kanban.view === "kanban" && (
          <KanbanSettingsControls cfg={theme.kanban} onChange={(k) => onChange({ ...theme, kanban: k })} />
        )}
      </section>

      {/* ===== อนิเมชั่น ===== */}
      <section className="mb-5">
        <div className="text-sm font-semibold text-slate-700 mb-2">{t("อนิเมชั่น", "Animations")}</div>
        <div className="flex flex-wrap gap-3">
          {([["hover", t("การ์ดเด้ง/ยกตอนชี้เมาส์", "Card lift on hover")], ["entrance", t("การ์ดค่อยๆ โผล่ตอนเปิดหน้า", "Cards fade in on load")], ["heroGradient", t("Hero ไล่สีขยับ", "Animated hero gradient")]] as const).map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={!!theme.anim?.[k]} onChange={(e) => setAnim({ [k]: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />{label}
            </label>
          ))}
        </div>
      </section>

      {/* ===== ฟอนต์ & ความหนาแน่น ===== */}
      <section className="mb-5">
        <div className="text-sm font-semibold text-slate-700 mb-2">{t("ฟอนต์ & ความหนาแน่น", "Font & density")}</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-xs text-slate-600">{t("ฟอนต์", "Font")}
            <select value={theme.fontFamily ?? "default"} onChange={(e) => onChange({ ...theme, fontFamily: e.target.value })}
              className="h-8 px-2 text-sm border border-slate-200 rounded bg-white" style={{ fontFamily: fontStack(theme.fontFamily) || undefined }}>
              {OV_FONTS.map((f) => <option key={f.key} value={f.key}>{f.label()}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{t("ขนาดตัวอักษร", "Text size")}</span>
            {(["sm", "md", "lg", "xl"] as const).map((s) => (
              <button key={s} onClick={() => onChange({ ...theme, fontScale: s })} className={`h-7 w-9 text-xs rounded border ${(theme.fontScale ?? "md") === s ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{s.toUpperCase()}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{t("ความหนาแน่น", "Density")}</span>
            {([["compact", t("แน่น", "Compact")], ["normal", t("ปกติ", "Normal")], ["spacious", t("โปร่ง", "Spacious")]] as const).map(([d, lbl]) => (
              <button key={d} onClick={() => onChange({ ...theme, density: d })} className={`h-7 px-2.5 text-xs rounded border ${(theme.density ?? "normal") === d ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{lbl}</button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">{t("ฟอนต์/ขนาด มีผลทั้งหน้าภาพรวม · ความหนาแน่น = ระยะห่างการ์ดและช่องไฟ", "Font/size apply to the whole overview · density = card spacing")}</p>
      </section>

      {/* ===== PET แจ้งเตือน ===== */}
      <section className="mb-5">
        <div className="text-sm font-semibold text-slate-700 mb-1">{t("PET แจ้งเตือน (ตัวการ์ตูนมุมแถบทักทาย)", "Pet alerts (mascot on the banner)")}</div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={!!theme.pet?.notify} onChange={(e) => setPet({ notify: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
          {t("เปิดให้ PET เด้งเตือน + พูดสรุปงาน + ป้ายตัวเลข", "Let the pet alert, speak, and show a count badge")}
        </label>
        {theme.pet?.notify && (
          <>
            <div className="flex flex-wrap gap-3 mt-2 pl-1">
              {([["overdue", t("งานเกินกำหนด", "Overdue")], ["dueToday", t("ครบกำหนดวันนี้", "Due today")], ["review", t("งานรอตรวจ/อนุมัติ", "In review")], ["newTasks", t("งานใหม่ที่เพิ่งมอบให้ฉัน", "New tasks for me")]] as const).map(([k, lbl]) => (
                <label key={k} className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={!!theme.pet?.[k]} onChange={(e) => setPet({ [k]: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />{lbl}
                </label>
              ))}
            </div>
            {/* มุม + ขนาด */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 pl-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">{t("มุมที่ลอย", "Corner")}</span>
                {([["tl", "↖"], ["tr", "↗"], ["bl", "↙"], ["br", "↘"]] as const).map(([cn, arrow]) => (
                  <button key={cn} onClick={() => setPet({ corner: cn })} className={`h-7 w-8 text-sm rounded border ${(theme.pet?.corner ?? "br") === cn ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{arrow}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{t("ขนาด", "Size")}</span>
                <input type="range" min={40} max={120} value={theme.pet?.size ?? 64} onChange={(e) => setPet({ size: Number(e.target.value) })} className="w-28 accent-violet-600" />
                <span className="text-xs text-slate-400 w-9">{theme.pet?.size ?? 64}px</span>
              </div>
            </div>
            {/* ข้อความทักทาย + หน้าตามอารมณ์ */}
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2 mt-2 pl-1">
              <label className="text-xs text-slate-500 flex-1 min-w-[200px]">{t("ข้อความตอนเคลียร์งานหมด (เว้น = ค่าเริ่มต้น)", "Message when all clear (blank = default)")}
                <input value={theme.pet?.greeting ?? ""} onChange={(e) => setPet({ greeting: e.target.value || null })} placeholder={t("เช่น เก่งมาก! พักก่อนได้เลย ☕", "e.g. Great job! Take a break ☕")} className="mt-1 w-full h-8 px-2 text-sm border border-slate-200 rounded" /></label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">{t("หน้าสบายดี", "Happy face")}
                <input value={theme.pet?.emojiHappy ?? "🐥"} onChange={(e) => setPet({ emojiHappy: e.target.value })} className="w-12 h-8 px-1 text-center text-base border border-slate-200 rounded" /></label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">{t("หน้าตกใจ", "Alert face")}
                <input value={theme.pet?.emojiAlert ?? "🙀"} onChange={(e) => setPet({ emojiAlert: e.target.value })} className="w-12 h-8 px-1 text-center text-base border border-slate-200 rounded" /></label>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">{t("หน้าสบายดี/ตกใจ ใช้เมื่อยังไม่ได้อัปโหลด GIF · อัปโหลดรูป/GIF เองได้ที่ส่วน “แถบทักทาย” ด้านบน · คลิก PET เพื่อดู/ปิดการแจ้งเตือน", "Happy/alert faces apply when no GIF is uploaded · upload your own in the banner section above · click the pet to toggle alerts")}</p>
          </>
        )}
      </section>

      {/* ===== สีสถานะ (ของฉัน) ===== */}
      <section className="mb-5">
        <div className="text-sm font-semibold text-slate-700 mb-1">{t("สีสถานะงาน (ของฉัน · ไล่สีได้)", "Status colors (yours · gradient)")}</div>
        <p className="text-[11px] text-slate-400 mb-2">{t("เปลี่ยนสีหัวคอลัมน์/ป้ายสถานะบนหน้านี้ · ติ๊กไล่สีเพื่อใส่สีที่สอง · เว้น = ใช้สีเริ่มต้น", "Recolor status columns/badges on this page · check gradient for a 2nd color · blank = default")}</p>
        <div className="space-y-1.5">
          {statuses.map((s) => {
            const c = theme.statusColors?.[s.key];
            const preview = ovStatusBg(theme, s.key);
            return (
              <div key={s.key} className="flex items-center gap-2 flex-wrap">
                <span className="h-4 w-6 rounded shrink-0 border border-slate-200" style={preview ? { background: preview } : undefined} />
                <span className="text-sm text-slate-600 w-28 truncate">{s.label}</span>
                <input type="color" value={c?.c1 ?? "#7c3aed"} onChange={(e) => setStatusColor(s.key, { c1: e.target.value, c2: c?.c2 ?? null })} className="w-8 h-7 p-0 border border-slate-200 rounded cursor-pointer" />
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={!!c?.c2} onChange={(e) => setStatusColor(s.key, { c1: c?.c1 ?? "#7c3aed", c2: e.target.checked ? "#ec4899" : null })} className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600" />{t("ไล่สี", "Gradient")}</label>
                {c?.c2 && <input type="color" value={c.c2} onChange={(e) => setStatusColor(s.key, { c1: c?.c1 ?? "#7c3aed", c2: e.target.value })} className="w-8 h-7 p-0 border border-slate-200 rounded cursor-pointer" />}
                {c && <button onClick={() => setStatusColor(s.key, null)} className="text-[11px] text-slate-300 hover:text-red-500" title={t("ใช้สีเริ่มต้น", "Use default")}>✕</button>}
              </div>
            );
          })}
          {statuses.length === 0 && <p className="text-xs text-slate-400">{t("ยังไม่มีสถานะ", "No statuses")}</p>}
        </div>
      </section>

      {/* ===== Cards ===== */}
      <section>
        <div className="text-sm font-semibold text-slate-700 mb-2">{t("การ์ดสรุป (ไอคอน · รูปเต็ม · ชื่อ · สี)", "Summary cards (icon · full image · label · color)")}</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-20">{t("ขนาดไอคอน", "Icon size")}</span>
            <input type="range" min={14} max={40} value={theme.cardIconSize ?? 18} onChange={(e) => onChange({ ...theme, cardIconSize: Number(e.target.value) })} className="w-28 accent-violet-600" />
            <span className="text-xs text-slate-400 w-9">{theme.cardIconSize ?? 18}px</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-20">{t("ขนาดตัวเลข", "Number size")}</span>
            <input type="range" min={16} max={48} value={theme.cardValueSize ?? 24} onChange={(e) => onChange({ ...theme, cardValueSize: Number(e.target.value) })} className="w-28 accent-violet-600" />
            <span className="text-xs text-slate-400 w-9">{theme.cardValueSize ?? 24}px</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-20">{t("ขนาดหัวข้อ", "Label size")}</span>
            <input type="range" min={11} max={22} value={theme.cardLabelSize ?? 14} onChange={(e) => onChange({ ...theme, cardLabelSize: Number(e.target.value) })} className="w-28 accent-violet-600" />
            <span className="text-xs text-slate-400 w-9">{theme.cardLabelSize ?? 14}px</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{t("ตำแหน่งตัวอักษร", "Text position")}</span>
            {([["left", t("ซ้าย", "Left")], ["center", t("กลาง", "Center")], ["right", t("ขวา", "Right")]] as const).map(([a, lbl]) => (
              <button key={a} onClick={() => onChange({ ...theme, cardAlign: a })} className={`h-7 px-2.5 text-xs rounded border ${(theme.cardAlign ?? "left") === a ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{lbl}</button>
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-slate-500">{t("สีตัวเลข", "Number color")}
              <input type="color" value={theme.cardValueColor ?? "#0f172a"} onChange={(e) => onChange({ ...theme, cardValueColor: e.target.value })} className="w-8 h-7 p-0 border border-slate-200 rounded cursor-pointer" />
              {theme.cardValueColor && <button onClick={() => onChange({ ...theme, cardValueColor: null })} className="text-[11px] text-slate-300 hover:text-red-500" title={t("ตามชุดสีการ์ด", "Follow card color")}>✕</button>}
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">{t("สีหัวข้อ", "Label color")}
              <input type="color" value={theme.cardLabelColor ?? "#334155"} onChange={(e) => onChange({ ...theme, cardLabelColor: e.target.value })} className="w-8 h-7 p-0 border border-slate-200 rounded cursor-pointer" />
              {theme.cardLabelColor && <button onClick={() => onChange({ ...theme, cardLabelColor: null })} className="text-[11px] text-slate-300 hover:text-red-500" title={t("ตามชุดสีการ์ด", "Follow card color")}>✕</button>}
            </label>
            <span className="text-[11px] text-slate-400">{t("(เว้น = สีตามชุดสีการ์ด)", "(blank = follow card color)")}</span>
          </div>
          <span className="text-[11px] text-slate-400 w-full">{t("💡 รูปเต็มแนะนำ ~400×400 · ไอคอน ~64×64", "💡 Full image ~400×400 · icon ~64×64")}</span>
        </div>
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
                <input value={c.label ?? ""} onChange={(e) => setCard(k, { label: e.target.value || null })} placeholder={CARD_LABEL[k]()} className="text-sm font-medium w-28 shrink-0 h-7 px-1.5 border border-slate-200 rounded bg-white" title={t("ชื่อการ์ด (เว้นว่าง = ค่าเริ่มต้น)", "Card label (blank = default)")} />
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
