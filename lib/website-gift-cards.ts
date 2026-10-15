/**
 * 🎴 การ์ดของขวัญ (เว็บร้าน) — ของกลาง ใช้ร่วม: ฝั่งเซิร์ฟเวอร์ (ตรวจตอนสั่ง) · ERP ตั้งค่า/ดูออเดอร์/หน้าพิมพ์
 * มิเรอร์ที่เว็บร้าน: src/lib/gift-cards.ts (ชนิด + ตัววาดการ์ดต้องตรงกัน — แก้ที่นี่ต้องแก้ที่นั่นด้วย)
 *
 * ตั้งค่าร้าน = store_settings key "gift_cards" (JSON ก้อนเดียว · lib/website-gift-cards-db.ts อ่าน/เขียน)
 *   ขนาดการ์ด (มม. · ปรับทีหลังได้) · ลายการ์ดของร้าน (รูปพื้นหลัง R2 + สีตัวหนังสือ + พื้นที่ข้อความ)
 *   โอกาส + ไอเดียข้อความ · ความยาวข้อความ · ให้ไม่ระบุผู้ส่งได้ไหม · แบบตัวหนังสือที่เปิด
 * การ์ดในออเดอร์ = store_orders.gift_card {design, font, occasion, to, from, anon, printedAt, printedBy} + ข้อความที่ gift_message
 *
 * ตัววาด giftCardHtml(): ขนาดทุกอย่างเป็น % / cqw (ตามความกว้างการ์ด) → HTML เดียวใช้ได้ทั้งพรีวิวเล็กบนจอและพิมพ์ขนาดจริง (มม.)
 */

export type GiftFontKey = "hand" | "cute" | "clean";
export type GiftCardArea = "full" | "center" | "bottom" | "top" | "left" | "right";
export type GiftCardSizePreset = "a6" | "a7" | "card" | "square" | "custom";

export interface GiftCardDesign {
  id: string;
  name: string;
  /** รูปลายการ์ด (R2) — ไม่มี = พื้นสีเรียบ */
  imageKey: string | null;
  bg: string;
  color: string;
  /** ช่วงที่วางข้อความ — เว้นที่ให้ลวดลายบนรูป */
  area: GiftCardArea;
  align: "center" | "left";
  enabled: boolean;
}

export interface GiftCardOccasion {
  id: string;
  label: string;
  messages: string[];
}

export interface GiftCardConfig {
  size: { preset: GiftCardSizePreset; w: number; h: number };
  maxChars: number;
  maxLines: number;
  allowAnon: boolean;
  fonts: GiftFontKey[];
  designs: GiftCardDesign[];
  occasions: GiftCardOccasion[];
}

/** การ์ดในออเดอร์ (ข้อความอยู่ gift_message) */
export interface OrderGiftCard {
  design: string;
  font: GiftFontKey;
  occasion: string | null;
  to: string;
  from: string;
  anon: boolean;
  printedAt: string | null;
  printedBy: string | null;
}

export const GIFT_FONTS: { key: GiftFontKey; label: string; family: string; scale: number }[] = [
  { key: "hand", label: "ลายมือ", family: "'Charm', cursive", scale: 1.15 },
  { key: "cute", label: "น่ารัก", family: "'Itim', sans-serif", scale: 1 },
  { key: "clean", label: "เรียบ", family: "'Sarabun', sans-serif", scale: 0.95 },
];
/** ฟอนต์ทั้ง 3 แบบ (Google Fonts) — หน้าที่วาดการ์ดต้องโหลด */
export const GIFT_FONTS_HREF = "https://fonts.googleapis.com/css2?family=Charm:wght@400;700&family=Itim&family=Sarabun:wght@400;500&display=swap";

export const GIFT_SIZE_PRESETS: { key: GiftCardSizePreset; label: string; w: number; h: number }[] = [
  { key: "a6", label: "A6 (14.8 × 10.5 ซม.)", w: 148, h: 105 },
  { key: "a7", label: "A7 (10.5 × 7.4 ซม.)", w: 105, h: 74 },
  { key: "card", label: "นามบัตร (9 × 5.5 ซม.)", w: 90, h: 55 },
  { key: "square", label: "จัตุรัส (10 × 10 ซม.)", w: 100, h: 100 },
  { key: "custom", label: "กำหนดเอง", w: 148, h: 105 },
];

export const GIFT_AREAS: { key: GiftCardArea; label: string }[] = [
  { key: "full", label: "เต็มการ์ด" },
  { key: "center", label: "กลาง (เว้นขอบกว้าง)" },
  { key: "bottom", label: "ครึ่งล่าง" },
  { key: "top", label: "ครึ่งบน" },
  { key: "left", label: "ครึ่งซ้าย" },
  { key: "right", label: "ครึ่งขวา" },
];

/** ระยะเว้นของพื้นที่ข้อความ (% ของการ์ด) [บน, ขวา, ล่าง, ซ้าย] */
const AREA_INSET: Record<GiftCardArea, [number, number, number, number]> = {
  full: [8, 8, 8, 8],
  center: [18, 16, 18, 16],
  bottom: [50, 8, 7, 8],
  top: [7, 8, 50, 8],
  left: [8, 50, 8, 7],
  right: [8, 7, 8, 50],
};

export const DEFAULT_GIFT_DESIGN: GiftCardDesign = {
  id: "plain",
  name: "การ์ดเรียบ",
  imageKey: null,
  bg: "#FFFDF8",
  color: "#3F3A33",
  area: "full",
  align: "center",
  enabled: true,
};

export const DEFAULT_GIFT_CARDS: GiftCardConfig = {
  size: { preset: "a6", w: 148, h: 105 },
  maxChars: 200,
  maxLines: 6,
  allowAnon: true,
  fonts: ["hand", "cute", "clean"],
  designs: [DEFAULT_GIFT_DESIGN],
  occasions: [
    { id: "bday", label: "วันเกิด", messages: ["สุขสันต์วันเกิดนะ ขอให้ปีนี้เป็นปีที่ดีที่สุด", "HBD! ขอให้มีความสุขมาก ๆ สุขภาพแข็งแรง ได้ทุกอย่างที่หวัง"] },
    { id: "anniv", label: "ครบรอบ", messages: ["ขอบคุณที่อยู่ด้วยกันมาตลอด รักวันนี้มากกว่าเมื่อวาน", "ครบรอบอีกปี อยากอยู่ด้วยกันไปอีกนาน ๆ"] },
    { id: "thanks", label: "ขอบคุณ", messages: ["ขอบคุณสำหรับทุกอย่างนะ เป็นกำลังใจให้เสมอ", "ของเล็ก ๆ แทนคำขอบคุณจากใจ"] },
    { id: "congrats", label: "ยินดีด้วย", messages: ["ยินดีด้วยกับความสำเร็จ ภูมิใจในตัวเธอมาก", "ยินดีด้วยกับงานใหม่ ขอให้ราบรื่นนะ"] },
  ],
};

// ─── ทำความสะอาดค่าที่ตั้ง (ไม่เชื่อ JSON ที่ส่งมา) ───

const R2_KEY = /^[a-zA-Z0-9._/-]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9-]{1,40}$/;
const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const clampInt = (v: unknown, d: number, lo: number, hi: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const idOf = (v: unknown, fallback: string) => {
  const s = String(v ?? "").trim().toLowerCase();
  return ID.test(s) ? s : fallback;
};

export function normalizeGiftCards(raw: unknown): GiftCardConfig {
  let r = raw;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      r = null;
    }
  }
  if (!r || typeof r !== "object") return structuredClone(DEFAULT_GIFT_CARDS);
  const o = r as Record<string, unknown>;
  const d = DEFAULT_GIFT_CARDS;

  const sz = (o.size ?? {}) as Record<string, unknown>;
  const preset = pick(sz.preset, GIFT_SIZE_PRESETS.map((p) => p.key), d.size.preset);
  const pre = GIFT_SIZE_PRESETS.find((p) => p.key === preset)!;
  const size =
    preset === "custom"
      ? { preset, w: clampInt(sz.w, pre.w, 50, 210), h: clampInt(sz.h, pre.h, 50, 210) }
      : { preset, w: pre.w, h: pre.h };

  const seen = new Set<string>();
  const designs: GiftCardDesign[] = [];
  for (const [i, x] of (Array.isArray(o.designs) ? o.designs : []).slice(0, 24).entries()) {
    const dd = (x ?? {}) as Record<string, unknown>;
    let id = idOf(dd.id, `d${i + 1}`);
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    const img = typeof dd.imageKey === "string" && R2_KEY.test(dd.imageKey.trim()) ? dd.imageKey.trim().slice(0, 300) : null;
    designs.push({
      id,
      name: str(dd.name, 40) || `ลาย ${i + 1}`,
      imageKey: img,
      bg: typeof dd.bg === "string" && HEX.test(dd.bg) ? dd.bg.toUpperCase() : DEFAULT_GIFT_DESIGN.bg,
      color: typeof dd.color === "string" && HEX.test(dd.color) ? dd.color.toUpperCase() : DEFAULT_GIFT_DESIGN.color,
      area: pick(dd.area, GIFT_AREAS.map((a) => a.key), "full"),
      align: dd.align === "left" ? "left" : "center",
      enabled: dd.enabled !== false,
    });
  }

  const oseen = new Set<string>();
  const occasions: GiftCardOccasion[] = [];
  for (const [i, x] of (Array.isArray(o.occasions) ? o.occasions : []).slice(0, 12).entries()) {
    const oo = (x ?? {}) as Record<string, unknown>;
    const label = str(oo.label, 30);
    if (!label) continue;
    let id = idOf(oo.id, `o${i + 1}`);
    while (oseen.has(id)) id = `${id}-${i}`;
    oseen.add(id);
    const msgs = (Array.isArray(oo.messages) ? oo.messages : [])
      .map((m) => String(m ?? "").replace(/\r/g, "").trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 8);
    occasions.push({ id, label, messages: msgs });
  }

  const fonts = (Array.isArray(o.fonts) ? o.fonts : d.fonts).filter((f): f is GiftFontKey => GIFT_FONTS.some((g) => g.key === f));

  return {
    size,
    maxChars: clampInt(o.maxChars, d.maxChars, 30, 300),
    maxLines: clampInt(o.maxLines, d.maxLines, 2, 12),
    allowAnon: o.allowAnon !== false,
    fonts: fonts.length ? [...new Set(fonts)] : [...d.fonts],
    designs: designs.length ? designs : [{ ...DEFAULT_GIFT_DESIGN }],
    occasions: Array.isArray(o.occasions) ? occasions : structuredClone(d.occasions),
  };
}

export const enabledDesigns = (cfg: GiftCardConfig) => cfg.designs.filter((d) => d.enabled);

// ─── ตรวจการ์ดที่ลูกค้าส่งมาตอนสั่ง (บอกว่าผิดอะไร ไม่เดาค่าให้) ───

export const cardLines = (message: string) => (message ? message.split("\n").length : 0);

export function normalizeOrderCard(
  raw: unknown,
  cfg: GiftCardConfig,
  message: string
): { ok: true; card: OrderGiftCard | null } | { ok: false; error: string } {
  const r = (raw ?? null) as Record<string, unknown> | null;
  if (message.length > cfg.maxChars) return { ok: false, error: `ข้อความบนการ์ดยาวเกิน ${cfg.maxChars} ตัวอักษร` };
  if (cardLines(message) > cfg.maxLines) return { ok: false, error: `ข้อความบนการ์ดเกิน ${cfg.maxLines} บรรทัด` };
  if (!r || typeof r !== "object") return { ok: true, card: null };
  const designs = enabledDesigns(cfg);
  const design = designs.find((d) => d.id === String(r.design ?? ""));
  if (!design) return { ok: false, error: "ลายการ์ดที่เลือกร้านปิดไปแล้ว — เลือกลายการ์ดใหม่อีกครั้ง" };
  const font = cfg.fonts.includes(r.font as GiftFontKey) ? (r.font as GiftFontKey) : null;
  if (!font) return { ok: false, error: "แบบตัวหนังสือบนการ์ดใช้ไม่ได้แล้ว — เลือกใหม่อีกครั้ง" };
  const occ = String(r.occasion ?? "");
  const anon = cfg.allowAnon && r.anon === true;
  return {
    ok: true,
    card: {
      design: design.id,
      font,
      occasion: cfg.occasions.some((o) => o.id === occ) ? occ : null,
      to: str(r.to, 60),
      from: anon ? "" : str(r.from, 60),
      anon,
      printedAt: null,
      printedBy: null,
    },
  };
}

/** การ์ดที่เก็บในออเดอร์ → รูปแบบเดียวกันเสมอ (ข้อมูลเก่า/เพี้ยน = null) */
export function readOrderCard(raw: unknown): OrderGiftCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.design !== "string") return null;
  return {
    design: r.design,
    font: GIFT_FONTS.some((f) => f.key === r.font) ? (r.font as GiftFontKey) : "clean",
    occasion: typeof r.occasion === "string" ? r.occasion : null,
    to: str(r.to, 60),
    from: str(r.from, 60),
    anon: r.anon === true,
    printedAt: typeof r.printedAt === "string" ? r.printedAt : null,
    printedBy: typeof r.printedBy === "string" ? r.printedBy : null,
  };
}

// ─── ตัววาดการ์ด (HTML string · หน่วย % / cqw ตามความกว้างการ์ด) ───

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** ขนาดตัวหนังสือข้อความ (มม.) ตามพื้นที่ว่างกับความยาวข้อความ — ยาวขึ้นตัวเล็กลงเอง */
export function cardFontMm(cfg: GiftCardConfig, design: Pick<GiftCardDesign, "area">, message: string, font: GiftFontKey): number {
  const [t, r, b, l] = AREA_INSET[design.area];
  const aw = cfg.size.w * (1 - (l + r) / 100);
  const ah = cfg.size.h * (1 - (t + b) / 100) * 0.72; // เหลือที่ให้ "ถึง" / "จาก"
  const chars = Math.max(message.length, 12) + cardLines(message) * 10;
  const scale = GIFT_FONTS.find((f) => f.key === font)?.scale ?? 1;
  return Math.min(9, Math.max(2.4, Math.sqrt((aw * ah) / chars) * 0.55)) * scale;
}

export interface GiftCardContent {
  to: string;
  from: string;
  message: string;
  font: GiftFontKey;
}

/**
 * การ์ด 1 ใบ เป็น HTML (ห่อด้วย .gc ที่ container-type: inline-size) — วางในกล่องกว้างเท่าไหร่ก็ได้ สัดส่วนตามขนาดการ์ด
 * imgUrl = ลิงก์รูปลายการ์ด (ฝั่งที่เรียกแปลง R2 key เป็นลิงก์เอง) · ไม่มีข้อความ = placeholder จาง ๆ
 */
export function giftCardHtml(cfg: GiftCardConfig, design: GiftCardDesign, c: GiftCardContent, imgUrl: string | null, placeholder = ""): string {
  const [t, r, b, l] = AREA_INSET[design.area];
  const fam = GIFT_FONTS.find((f) => f.key === c.font)?.family ?? GIFT_FONTS[2].family;
  const cqw = (mm: number) => `${((mm / cfg.size.w) * 100).toFixed(3)}cqw`;
  const msgMm = cardFontMm(cfg, design, c.message, c.font);
  const sideMm = msgMm * 0.82;
  // url('…') ใช้ฟันหนูเดี่ยว — style อยู่ใน attribute ที่ครอบด้วยฟันหนูคู่
  const bg = imgUrl ? `${design.bg} url('${imgUrl.replace(/['"()\s]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))}') center / cover no-repeat` : design.bg;
  const ta = design.align === "left" ? "left" : "center";
  const msg = c.message.trim()
    ? escHtml(c.message.trim())
    : placeholder
      ? `<span style="opacity:.45">${escHtml(placeholder)}</span>`
      : "";
  return `<div class="gc" style="container-type:inline-size;width:100%;aspect-ratio:${cfg.size.w}/${cfg.size.h};position:relative;overflow:hidden;background:${bg};color:${design.color};font-family:${fam};-webkit-print-color-adjust:exact;print-color-adjust:exact"><div style="position:absolute;top:${t}%;right:${r}%;bottom:${b}%;left:${l}%;display:flex;flex-direction:column;gap:${cqw(1.5)}">${
    c.to.trim() ? `<div style="font-size:${cqw(sideMm)};line-height:1.3;text-align:left">ถึง ${escHtml(c.to.trim())}</div>` : ""
  }<div style="flex:1;display:flex;align-items:center;justify-content:${ta === "center" ? "center" : "flex-start"};text-align:${ta};font-size:${cqw(msgMm)};line-height:1.45;white-space:pre-line;overflow-wrap:anywhere">${msg}</div>${
    c.from.trim() ? `<div style="font-size:${cqw(sideMm)};line-height:1.3;text-align:right">— ${escHtml(c.from.trim())}</div>` : ""
  }</div></div>`;
}

// ─── หน้าพิมพ์ (ERP /print/gift-cards) ───

export type GiftPrintMode = "sheet" | "single";

/**
 * A4 แนวตั้ง วางการ์ดได้กี่ใบ (ขอบ 8 มม. เผื่อเครื่องพิมพ์ · ช่องตัด 4 มม.) — 0 = ใหญ่เกิน A4
 * ลองหมุนการ์ด 90° ด้วย ถ้าวางได้มากกว่า (rotate=true · ตัดแล้วได้การ์ดเหมือนเดิม) เช่น นามบัตร 8 → 9 ใบ
 * ⚠️ A6 ได้แค่ 2 ใบ/แผ่น — 4 ใบพอดีเป๊ะต้องพิมพ์ไร้ขอบ ซึ่งเครื่องพิมพ์ทั่วไปทำไม่ได้
 */
export function sheetGrid(cfg: GiftCardConfig): { cols: number; rows: number; rotate: boolean } {
  const gap = 4;
  const fit = (w: number, h: number) => ({
    cols: Math.max(0, Math.floor((210 - 16 + gap) / (w + gap))),
    rows: Math.max(0, Math.floor((297 - 16 + gap) / (h + gap))),
  });
  const a = fit(cfg.size.w, cfg.size.h);
  const b = fit(cfg.size.h, cfg.size.w);
  return b.cols * b.rows > a.cols * a.rows ? { ...b, rotate: true } : { ...a, rotate: false };
}

/**
 * เอกสารพิมพ์การ์ดหลายใบ (HTML ทั้งหน้า) — ส่งให้ PrintFrame / printReportHtmlInNewWindow ของกลาง
 * sheet = เรียงบน A4 มีเส้นประให้ตัด · single = 1 ใบต่อแผ่น กระดาษขนาดการ์ด (เครื่องพิมพ์การ์ด/กระดาษตัดแล้ว)
 */
export function giftCardsPrintHtml(cfg: GiftCardConfig, cards: string[], mode: GiftPrintMode, title = "การ์ดของขวัญ"): string {
  const { w, h } = cfg.size;
  const g = sheetGrid(cfg);
  const useSheet = mode === "sheet" && g.cols > 0 && g.rows > 0;
  const per = useSheet ? g.cols * g.rows : 1;
  const pages: string[][] = [];
  for (let i = 0; i < cards.length; i += per) pages.push(cards.slice(i, i + per));
  const css = useSheet
    ? g.rotate
      ? `@page{size:A4 portrait;margin:0}.pg{width:210mm;height:297mm;padding:8mm;display:grid;grid-template-columns:repeat(${g.cols},${h}mm);grid-auto-rows:${w}mm;gap:4mm;justify-content:center;align-content:start;break-after:page}.cell{position:relative;width:${h}mm;height:${w}mm;outline:0.25mm dashed #b8b8b8}.cell>.rot{position:absolute;left:0;top:0;width:${w}mm;height:${h}mm;transform-origin:0 0;transform:translate(${h}mm,0) rotate(90deg)}`
      : `@page{size:A4 portrait;margin:0}.pg{width:210mm;height:297mm;padding:8mm;display:grid;grid-template-columns:repeat(${g.cols},${w}mm);grid-auto-rows:${h}mm;gap:4mm;justify-content:center;align-content:start;break-after:page}.cell{width:${w}mm;height:${h}mm;outline:0.25mm dashed #b8b8b8}`
    : `@page{size:${w}mm ${h}mm;margin:0}.pg{width:${w}mm;height:${h}mm;break-after:page}.cell{width:${w}mm;height:${h}mm}`;
  const body = pages.length
    ? pages.map((p) => `<div class="pg">${p.map((c) => (useSheet && g.rotate ? `<div class="cell"><div class="rot">${c}</div></div>` : `<div class="cell">${c}</div>`)).join("")}</div>`).join("")
    : `<p style="padding:20mm;font-family:sans-serif;color:#94a3b8;text-align:center">ไม่มีการ์ดที่ต้องพิมพ์</p>`;
  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/><title>${escHtml(title)}</title><link rel="stylesheet" href="${GIFT_FONTS_HREF}"/><style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}@media screen{body{background:#e2e8f0;padding:6mm 0}.pg{background:#fff;margin:0 auto 6mm;box-shadow:0 1px 4px rgba(0,0,0,.15)}}.pg:last-child{break-after:auto}${css}</style></head><body>${body}</body></html>`;
}
