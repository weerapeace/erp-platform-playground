/**
 * 📚 Design Library — กฎกลาง (pure ไม่แตะ DB/React · เทสต์ lib/design-library.test.ts)
 *
 * แม่แบบกระเป๋า → "สูตร" (จุดบนรูป + สิ่งที่เลือกแต่ละจุด + ช่อง + ขนาด) → ใบสรุป PDF (เส้นชี้ + ตารางสรุป) + prompt 3 ชุดให้ GPT
 * ใช้ที่: API app/api/design-library/* (ตรวจ/ทำความสะอาดสูตรก่อนบันทึก) · หน้า components/design-library/* · หน้าพิมพ์ /print/design-library/[id]
 *
 * สิ่งที่เลือกในแต่ละจุด (Pick) เก็บ "สำเนา" ชื่อ/รหัส/รูป ณ ตอนเลือก → ใบสรุปเปิดย้อนหลังได้แม้ SKU/แผงถูกแก้ทีหลัง
 * สต็อกไม่เก็บ — ดึงสดตอนเปิด (API /api/design-library/stock)
 */

// ─── ชนิดข้อมูล ──────────────────────────────────────────────────────────────
export type ChoiceListKey = "category" | "hw_color" | "thread_color" | "pocket_type" | "rule";
export const CHOICE_LISTS: { key: ChoiceListKey; label: string; hint: string }[] = [
  { key: "category",     label: "หมวดที่เปลี่ยนได้", hint: "จุดบนรูปเลือกหมวดจากรายการนี้ · แต่ละหมวดเลือกจากแหล่งต่างกัน" },
  { key: "hw_color",     label: "สีอะไหล่",          hint: "เลือกครั้งเดียว ใช้กับอะไหล่ทุกชิ้นทั้งใบ" },
  { key: "thread_color", label: "สีด้าย (รหัสสี)",   hint: "ใส่รหัสสีด้ายจริง เช่น TH-402" },
  { key: "pocket_type",  label: "แบบช่อง",           hint: "ใช้ตอนวาดช่องหน้า/หลัง/ข้างใน" },
  { key: "rule",         label: "กฎห้ามคู่",          hint: "ถ้าเลือก A คู่กับ B ระบบเตือน (ไม่บล็อก)" },
];

/** แหล่งที่ใช้เลือกของหมวด */
export type CategorySource = "swatch" | "sku" | "color" | "logo" | "sku_text";
export const CATEGORY_SOURCES: { key: CategorySource; label: string }[] = [
  { key: "swatch",   label: "แผงผ้า" },
  { key: "sku",      label: "SKU" },
  { key: "color",    label: "รหัสสี (สีด้าย)" },
  { key: "logo",     label: "อัปโหลด / คลังโลโก้" },
  { key: "sku_text", label: "SKU หรือเขียนเอง" },
];

export type Choice = {
  id: string; list_key: ChoiceListKey; code: string; name: string; name_en: string | null; hex: string | null;
  config: Record<string, unknown>; sort_order: number; is_active: boolean;
};

export type Pick =
  | { kind: "swatch"; swatch_id: string; swatch_name: string; image_key: string | null; image_w: number | null; image_h: number | null;
      x: number; y: number; w: number; h: number; sku_id: string | null; code: string; name: string }
  | { kind: "sku"; sku_id: string; code: string; name: string; image_key: string | null }
  | { kind: "color"; code: string; name: string; hex: string | null }
  | { kind: "logo"; image_key: string; name: string; asset_id: string | null }
  | { kind: "text"; text: string }
  | { kind: "same_as_body" };

export type Pin = { id: string; x: number; y: number; cat: string; pick: Pick | null; note: string };
export type PocketBox = { id: string; x: number; y: number; w: number; h: number; type: string; note: string };
export type PanelKey = "front" | "back" | "inside_front" | "inside_back";
export const PANELS: { key: PanelKey; label: string; en: string; inside: boolean }[] = [
  { key: "front",        label: "ช่องหน้า (ด้านนอก)",  en: "front outer",       inside: false },
  { key: "back",         label: "ช่องหลัง (ด้านนอก)",  en: "back outer",        inside: false },
  { key: "inside_front", label: "ข้างใน · ฝั่งหน้า",    en: "inside front wall", inside: true },
  { key: "inside_back",  label: "ข้างใน · ฝั่งหลัง",    en: "inside back wall",  inside: true },
];
export type Size = { w: number; h: number; d: number; strap: number };
export type Spec = { size: Size; hw_color: string | null; pins: Pin[]; pockets: Record<PanelKey, PocketBox[]> };

export const DEFAULT_SIZE: Size = { w: 30, h: 35, d: 12, strap: 0 };
export const SIZE_LIMIT = { min: 1, max: 200 };
export const MAX_PINS = 40;
export const MAX_BOXES = 12;

// ─── ทำความสะอาด / ตรวจ ───────────────────────────────────────────────────────
const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const idOf = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : Math.random().toString(36).slice(2, 10));

export function cleanSize(v: unknown): Size {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const s = (k: keyof Size, d: number, lo: number) => r1(clamp(num(o[k], d), lo, SIZE_LIMIT.max));
  return { w: s("w", DEFAULT_SIZE.w, 1), h: s("h", DEFAULT_SIZE.h, 1), d: s("d", DEFAULT_SIZE.d, 0), strap: s("strap", 0, 0) };
}

export function cleanPick(v: unknown): Pick | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  switch (o.kind) {
    case "swatch": return {
      kind: "swatch", swatch_id: str(o.swatch_id, 40), swatch_name: str(o.swatch_name, 120), image_key: str(o.image_key, 300) || null,
      image_w: o.image_w == null ? null : num(o.image_w), image_h: o.image_h == null ? null : num(o.image_h),
      x: clamp(num(o.x), 0, 100), y: clamp(num(o.y), 0, 100), w: clamp(num(o.w, 1), 0.1, 100), h: clamp(num(o.h, 1), 0.1, 100),
      sku_id: str(o.sku_id, 40) || null, code: str(o.code, 80), name: str(o.name, 200),
    };
    case "sku": return str(o.sku_id, 40) ? { kind: "sku", sku_id: str(o.sku_id, 40), code: str(o.code, 80), name: str(o.name, 200), image_key: str(o.image_key, 300) || null } : null;
    case "color": return str(o.code, 40) ? { kind: "color", code: str(o.code, 40), name: str(o.name, 120), hex: /^#[0-9a-f]{6}$/i.test(String(o.hex ?? "")) ? String(o.hex) : null } : null;
    case "logo": return str(o.image_key, 300) ? { kind: "logo", image_key: str(o.image_key, 300), name: str(o.name, 200), asset_id: str(o.asset_id, 40) || null } : null;
    case "text": return str(o.text, 300) ? { kind: "text", text: str(o.text, 300) } : null;
    case "same_as_body": return { kind: "same_as_body" };
    default: return null;
  }
}

export function cleanBox(v: unknown, size: Size): PocketBox | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const w = r1(clamp(num(o.w, 5), 1, size.w)), h = r1(clamp(num(o.h, 5), 1, size.h));
  return { id: idOf(o.id), x: r1(clamp(num(o.x), 0, size.w - w)), y: r1(clamp(num(o.y), 0, size.h - h)), w, h, type: str(o.type, 40), note: str(o.note, 300) };
}

export function emptyPockets(): Record<PanelKey, PocketBox[]> { return { front: [], back: [], inside_front: [], inside_back: [] }; }

/** ทำสูตรให้ถูกรูปแบบเสมอ (ค่าแปลก/เกิน = ตัดทิ้ง/บีบให้อยู่ในช่วง) — ใช้ทั้งตอนบันทึก (API) และตอนเปิด (หน้า) */
export function cleanSpec(v: unknown): Spec {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const size = cleanSize(o.size);
  const pins = (Array.isArray(o.pins) ? o.pins : []).slice(0, MAX_PINS).map((p): Pin | null => {
    if (!p || typeof p !== "object") return null;
    const q = p as Record<string, unknown>;
    return { id: idOf(q.id), x: r1(clamp(num(q.x), 0, 100)), y: r1(clamp(num(q.y), 0, 100)), cat: str(q.cat, 40), pick: cleanPick(q.pick), note: str(q.note, 300) };
  }).filter((p): p is Pin => !!p);
  const raw = (o.pockets && typeof o.pockets === "object" ? o.pockets : {}) as Record<string, unknown>;
  const pockets = emptyPockets();
  for (const p of PANELS) {
    pockets[p.key] = (Array.isArray(raw[p.key]) ? (raw[p.key] as unknown[]) : []).slice(0, MAX_BOXES)
      .map((b) => cleanBox(b, size)).filter((b): b is PocketBox => !!b);
  }
  return { size, hw_color: str(o.hw_color, 40) || null, pins, pockets };
}

// ─── ชื่อ/รหัสของสิ่งที่เลือก ───────────────────────────────────────────────────
export function pickInfo(p: Pick | null, ctx?: { bodyPick?: Pick | null }): { code: string; name: string } {
  if (!p) return { code: "", name: "" };
  switch (p.kind) {
    case "swatch": return { code: p.code, name: p.name || p.swatch_name };
    case "sku":    return { code: p.code, name: p.name };
    case "color":  return { code: p.code, name: p.name };
    case "logo":   return { code: "LOGO", name: p.name || "โลโก้" };
    case "text":   return { code: "", name: p.text };
    case "same_as_body": {
      const b = ctx?.bodyPick && ctx.bodyPick.kind !== "same_as_body" ? pickInfo(ctx.bodyPick) : null;
      return { code: b?.code ?? "", name: b ? `ใช้วัสดุเดียวกับตัวกระเป๋า (${b.name})` : "ใช้วัสดุเดียวกับตัวกระเป๋า" };
    }
  }
}

export const skuIdOf = (p: Pick | null): string | null => (p && (p.kind === "sku" || p.kind === "swatch") ? p.sku_id : null);
/** SKU ทั้งหมดในสูตร (ดึงสต็อกสด) */
export function specSkuIds(spec: Spec): string[] { return [...new Set(spec.pins.map((p) => skuIdOf(p.pick)).filter((x): x is string => !!x))]; }
export const bodyPickOf = (spec: Spec): Pick | null => spec.pins.find((p) => p.cat === "body" && p.pick)?.pick ?? null;

export function categoryOf(choices: Choice[], code: string): Choice | undefined { return choices.find((c) => c.list_key === "category" && c.code === code); }
export function sourceOf(cat: Choice | undefined): CategorySource {
  const s = String(cat?.config?.source ?? "sku_text");
  return (CATEGORY_SOURCES.some((x) => x.key === s) ? s : "sku_text") as CategorySource;
}
/** หมวดนี้ใช้ "สีอะไหล่ทั้งใบ" ไหม (อะไหล่ / หมุดรอง) */
export const usesHwColor = (cat: Choice | undefined) => cat?.config?.hw === true;

// ─── กฎห้ามคู่ ────────────────────────────────────────────────────────────────
/** โทเคนของสูตร: "<หมวด>:<รหัส>" ทุกจุดที่เลือกแล้ว + "hw_color:<รหัสสีอะไหล่>" */
export function specTokens(spec: Spec): Set<string> {
  const out = new Set<string>();
  for (const p of spec.pins) { const c = pickInfo(p.pick).code; if (p.cat && c) out.add(`${p.cat}:${c}`.toUpperCase()); }
  if (spec.hw_color) out.add(`hw_color:${spec.hw_color}`.toUpperCase());
  return out;
}
export type RuleHit = { code: string; reason: string };
/** กฎ config = { a: "zip:ZP-5G", b: "hw_color:silver", reason } — ถ้าสูตรมีทั้ง a และ b = เตือน */
export function ruleHits(spec: Spec, choices: Choice[]): RuleHit[] {
  const t = specTokens(spec);
  return choices.filter((c) => c.list_key === "rule" && c.is_active).flatMap((c) => {
    const a = String(c.config?.a ?? "").trim().toUpperCase(), b = String(c.config?.b ?? "").trim().toUpperCase();
    if (!a || !b || !t.has(a) || !t.has(b)) return [];
    return [{ code: c.code, reason: String(c.config?.reason ?? "").trim() || c.name }];
  });
}

export type StockMap = Record<string, number>;
export type StockHit = { pinIndex: number; code: string; onHand: number };
/** จุดที่วัสดุหมด (≤ 0) หรือเหลือน้อย (< lowAt) */
export function stockHits(spec: Spec, stock: StockMap, lowAt = 10): { out: StockHit[]; low: StockHit[] } {
  const out: StockHit[] = [], low: StockHit[] = [];
  spec.pins.forEach((p, i) => {
    const id = skuIdOf(p.pick);
    if (!id || !(id in stock)) return;
    const h = { pinIndex: i, code: pickInfo(p.pick).code, onHand: stock[id] };
    if (h.onHand <= 0) out.push(h); else if (h.onHand < lowAt) low.push(h);
  });
  return { out, low };
}

// ─── Prompt (3 ชุด: 4 มุมรวมรูปเดียว · ข้างใน · คนสะพาย) ─────────────────────
export type PromptSet = { key: "grid4" | "inside" | "model"; title: string; text: string };
export const RENDER_VIEWS: { key: "grid4" | "inside" | "model" | "other"; label: string }[] = [
  { key: "grid4",  label: "4 มุม (หน้า หลัง ข้าง เอียง)" },
  { key: "inside", label: "ข้างใน" },
  { key: "model",  label: "คนสะพาย" },
  { key: "other",  label: "อื่น ๆ" },
];

const en = (c: Choice | undefined, fb: string) => (c?.name_en?.trim() || c?.name || fb);

function pocketsText(spec: Spec, choices: Choice[], inside: boolean): string {
  const parts: string[] = [];
  for (const p of PANELS.filter((x) => x.inside === inside)) {
    for (const b of spec.pockets[p.key]) {
      const t = choices.find((c) => c.list_key === "pocket_type" && c.code === b.type);
      parts.push(`${p.en} ${en(t, "pocket").toLowerCase()} pocket ${b.w}x${b.h} cm placed ${b.y} cm below the top edge and ${b.x} cm from the left edge${b.note ? ` (${b.note})` : ""}`);
    }
  }
  return parts.length ? parts.join("; ") : `no ${inside ? "inside" : "outer"} pockets`;
}

function partsText(spec: Spec, choices: Choice[]): string {
  const body = bodyPickOf(spec);
  const hw = choices.find((c) => c.list_key === "hw_color" && c.code === spec.hw_color);
  return spec.pins.map((p, i) => {
    if (!p.pick && !p.note) return "";
    const cat = categoryOf(choices, p.cat);
    const info = pickInfo(p.pick, { bodyPick: body });
    let s = `${en(cat, "Detail")}: ${info.name || "as noted"}`;
    if (info.code && p.pick?.kind !== "text") s += ` (${info.code})`;
    if (p.pick?.kind === "color" && p.pick.hex) s += ` color ${p.pick.hex}`;
    if (usesHwColor(cat) && hw) s += `, ${en(hw, hw.name)} finish`;
    if (p.note) s += ` - note: ${p.note}`;
    return `${s} [ref ${i + 1}]`;
  }).filter(Boolean).join("; ");
}

export function buildPrompts(tpl: { name: string; category?: string | null }, spec: Spec, choices: Choice[]): PromptSet[] {
  const { w, h, d, strap } = spec.size;
  const hw = choices.find((c) => c.list_key === "hw_color" && c.code === spec.hw_color);
  const bag = `${tpl.category?.trim() || "bag"} (${tpl.name}), size ${w} x ${h} x ${d} cm`;
  const parts = partsText(spec, choices);
  const base = `${bag}. ${parts ? parts + "." : ""}${hw ? ` All metal hardware in ${en(hw, hw.name)} finish.` : ""} Outer pockets: ${pocketsText(spec, choices, false)}.`;
  const ref = "Match the attached reference images exactly: numbers [ref N] match the numbered callouts in the attached PDF.";
  return [
    { key: "grid4", title: "4 มุมรวมรูปเดียว (หน้า · หลัง · ข้าง · เอียง)",
      text: `Create ONE image arranged as a 2x2 grid showing the SAME ${base} Top-left: front view. Top-right: back view. Bottom-left: side view showing the ${d} cm gusset. Bottom-right: three-quarter view. ${ref} Plain white background, soft studio light, photorealistic, identical color and texture in all 4 views, no text.` },
    { key: "inside", title: "ข้างใน",
      text: `Photorealistic top-down photo looking inside the open ${base} Inside pockets: ${pocketsText(spec, choices, true)}. Show the lining clearly. ${ref} Plain white background, soft light, no text.` },
    { key: "model", title: "คนสะพาย",
      text: `Lifestyle photo of a Thai female model wearing the ${base}${strap > 0 ? ` Carried with the long shoulder strap (${strap} cm).` : " Carried on the shoulder by the handle."} Neutral outfit, clean minimal backdrop, natural light, the bag clearly visible and true to the reference images.` },
  ];
}

// ─── ใบสรุป (HTML ให้ PrintFrame) ───────────────────────────────────────────────
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** รูปย่อของสิ่งที่เลือก (SVG ชิ้นเดียว — วางซ้อนใน SVG ใหญ่ได้) · img(key,w) = แปลง R2 key → URL */
export function pickThumbSvg(p: Pick | null, attrs: string, img: (key: string, w: number) => string, ctx: { bodyPick?: Pick | null; hwHex?: string | null; isHw?: boolean } = {}): string {
  const box = (inner: string) => `<svg ${attrs} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"><rect width="100" height="100" rx="6" fill="#f6f4ef"/>${inner}</svg>`;
  if (!p) return box(`<text x="50" y="56" text-anchor="middle" font-size="12" fill="#aaa">ยังไม่เลือก</text>`);
  if (p.kind === "same_as_body") return ctx.bodyPick && ctx.bodyPick.kind !== "same_as_body" ? pickThumbSvg(ctx.bodyPick, attrs, img) : box(`<text x="50" y="56" text-anchor="middle" font-size="12" fill="#888">ตามตัว</text>`);
  if (p.kind === "swatch" && p.image_key) {
    const iw = p.image_w || 1000, ih = p.image_h || 1000;
    const vb = `${(p.x / 100) * iw} ${(p.y / 100) * ih} ${(p.w / 100) * iw} ${(p.h / 100) * ih}`;
    return `<svg ${attrs} viewBox="${vb}" preserveAspectRatio="xMidYMid slice"><image href="${esc(img(p.image_key, 1600))}" x="0" y="0" width="${iw}" height="${ih}"/></svg>`;
  }
  if ((p.kind === "sku" || p.kind === "logo") && p.image_key) {
    const ring = ctx.isHw && ctx.hwHex ? `<rect x="2" y="2" width="96" height="96" rx="6" fill="none" stroke="${esc(ctx.hwHex)}" stroke-width="4"/>` : "";
    return box(`<image href="${esc(img(p.image_key, 400))}" x="4" y="4" width="92" height="92" preserveAspectRatio="xMidYMid meet"/>${ring}`);
  }
  if (p.kind === "color") return box(`<rect x="22" y="10" width="56" height="8" fill="#c8b48e"/><rect x="22" y="82" width="56" height="8" fill="#c8b48e"/><rect x="28" y="18" width="44" height="64" fill="${esc(p.hex ?? "#ccc")}"/>`);
  return box(`<text x="50" y="56" text-anchor="middle" font-size="12" fill="#666">${p.kind === "text" ? "เขียนเอง" : "ไม่มีรูป"}</text>`);
}

export type BriefInput = {
  template: { code: string; name: string; category: string | null; image_key: string | null; image_w: number | null; image_h: number | null; vector_image_key: string | null };
  recipe: { seq: number; name: string | null; note: string | null; created_by_name: string | null; updated_at: string };
  spec: Spec; choices: Choice[]; stock: StockMap; useVector: boolean;
  img: (key: string, w: number) => string;
  dateText: string;
};

/** ภาพเส้นชี้: รูปกระเป๋ากลาง + การ์ดรูปชิ้นส่วนซ้าย/ขวา (รูปใหญ่ให้ GPT เห็นชัด) */
export function calloutSvg(b: BriefInput): string {
  const { spec, template: t } = b;
  const key = b.useVector && t.vector_image_key ? t.vector_image_key : t.image_key;
  const iw = t.image_w || 1000, ih = t.image_h || 1000;
  const W = 1000, CARD = 120, GAP = 18, IMG_W = 520, IMG_X = (W - IMG_W) / 2;
  const imgH = IMG_W * (ih / iw);
  const L: number[] = [], R: number[] = [];
  spec.pins.forEach((p, i) => (p.x < 50 ? L : R).push(i));
  L.sort((a, c) => spec.pins[a].y - spec.pins[c].y); R.sort((a, c) => spec.pins[a].y - spec.pins[c].y);
  const rows = Math.max(L.length, R.length, 1);
  const H = Math.max(imgH + 40, rows * (CARD + GAP) + 20);
  const imgY = (H - imgH) / 2;
  const hw = b.choices.find((c) => c.list_key === "hw_color" && c.code === spec.hw_color);
  const body = bodyPickOf(spec);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" style="display:block">`;
  s += key ? `<image href="${esc(b.img(key, 1400))}" x="${IMG_X}" y="${imgY}" width="${IMG_W}" height="${imgH}" preserveAspectRatio="xMidYMid meet"/>` : `<rect x="${IMG_X}" y="${imgY}" width="${IMG_W}" height="${imgH}" fill="#f1efe8"/>`;
  const place = (arr: number[], side: "l" | "r") => arr.forEach((i, j) => {
    const p = spec.pins[i];
    const cat = categoryOf(b.choices, p.cat);
    const info = pickInfo(p.pick, { bodyPick: body });
    const top = (H - arr.length * (CARD + GAP)) / 2 + j * (CARD + GAP) + GAP / 2, cy = top + CARD / 2;
    const px = IMG_X + (p.x / 100) * IMG_W, py = imgY + (p.y / 100) * imgH;
    const thumbX = side === "l" ? 4 : W - 4 - CARD;
    const anchorX = side === "l" ? IMG_X - 6 : IMG_X + IMG_W + 6;
    const bend = side === "l" ? Math.max(IMG_X + 4, px - 40) : Math.min(IMG_X + IMG_W - 4, px + 40);
    s += `<path d="M${anchorX} ${cy} L${bend} ${cy} L${px} ${py}" fill="none" stroke="#E24B4A" stroke-width="2"/>`;
    s += pickThumbSvg(p.pick, `x="${thumbX}" y="${top}" width="${CARD}" height="${CARD}"`, b.img, { bodyPick: body, hwHex: hw?.hex, isHw: usesHwColor(cat) });
    const tx = side === "l" ? thumbX + CARD + 8 : thumbX - 8, an = side === "l" ? "start" : "end";
    const l1 = `${i + 1}. ${info.code || cat?.name || ""}`;
    const l2 = trunc(info.name || "", 22) + (usesHwColor(cat) && hw ? ` · ${hw.name}` : "");
    const l3 = p.note ? `Note. ${trunc(p.note, 24)}` : (cat?.name ?? "");
    s += `<text x="${tx}" y="${cy - 14}" text-anchor="${an}" font-size="15" font-weight="600" fill="#A32D2D">${esc(l1)}</text>`;
    s += `<text x="${tx}" y="${cy + 6}" text-anchor="${an}" font-size="14" fill="#A32D2D">${esc(l2)}</text>`;
    s += `<text x="${tx}" y="${cy + 26}" text-anchor="${an}" font-size="13" fill="#555">${esc(l3)}</text>`;
  });
  place(L, "l"); place(R, "r");
  spec.pins.forEach((p, i) => {
    const px = IMG_X + (p.x / 100) * IMG_W, py = imgY + (p.y / 100) * imgH;
    s += `<circle cx="${px}" cy="${py}" r="14" fill="#EF9F27" stroke="#412402" stroke-width="1.5"/><text x="${px}" y="${py + 5}" text-anchor="middle" font-size="14" fill="#412402">${i + 1}</text>`;
  });
  return s + "</svg>";
}

/** รูปช่องของ 1 ฝั่ง (กรอบกระเป๋า + กล่องช่องทุกกล่อง + ขนาด) */
export function pocketPanelSvg(spec: Spec, panel: PanelKey, choices: Choice[]): string {
  const W = Math.max(1, spec.size.w), H = Math.max(1, spec.size.h);
  const s = Math.min(200 / W, 220 / H), ox = (240 - W * s) / 2, oy = 22;
  let g = `<svg viewBox="0 0 240 ${oy + H * s + 10}" width="100%" xmlns="http://www.w3.org/2000/svg"><rect x="${ox}" y="${oy}" width="${W * s}" height="${H * s}" fill="#f4efe4" stroke="#999"/>`;
  g += `<text x="120" y="14" text-anchor="middle" font-size="11" fill="#555">${esc(PANELS.find((p) => p.key === panel)?.label ?? panel)} · ${W}×${H} ซม.</text>`;
  const boxes = spec.pockets[panel];
  if (!boxes.length) g += `<text x="120" y="${oy + (H * s) / 2}" text-anchor="middle" font-size="11" fill="#999">ไม่มีช่อง</text>`;
  boxes.forEach((b, i) => {
    const x = ox + b.x * s, y = oy + b.y * s, w = b.w * s, h = b.h * s;
    const t = choices.find((c) => c.list_key === "pocket_type" && c.code === b.type);
    g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(55,138,221,.15)" stroke="#185FA5" stroke-width="1.5"/>`;
    if (b.type === "zip") g += `<line x1="${x + 3}" y1="${y + 4}" x2="${x + w - 3}" y2="${y + 4}" stroke="#185FA5" stroke-dasharray="2 2"/>`;
    g += `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" font-size="10" fill="#0C447C">${i + 1}) ${b.w}×${b.h}</text>`;
    if (t && h > 22) g += `<text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" font-size="9" fill="#0C447C">${esc(t.name)}</text>`;
  });
  return g + "</svg>";
}

export function buildBriefHtml(b: BriefInput): string {
  const { spec, template: t, recipe: r } = b;
  const body = bodyPickOf(spec);
  const hw = b.choices.find((c) => c.list_key === "hw_color" && c.code === spec.hw_color);
  const rules = ruleHits(spec, b.choices);
  const st = stockHits(spec, b.stock);
  const prompts = buildPrompts(t, spec, b.choices);
  const warn = [...rules.map((x) => `กฎทีม: ${x.reason}`), ...st.out.map((x) => `จุด ${x.pinIndex + 1} ${x.code} หมดสต็อก`), ...st.low.map((x) => `จุด ${x.pinIndex + 1} ${x.code} เหลือน้อย (${x.onHand})`)];
  const rows = spec.pins.map((p, i) => {
    const cat = categoryOf(b.choices, p.cat);
    const info = pickInfo(p.pick, { bodyPick: body });
    const sid = skuIdOf(p.pick);
    const stock = sid && sid in b.stock ? (b.stock[sid] <= 0 ? `<span style="color:#A32D2D">หมด</span>` : b.stock[sid] < 10 ? `<span style="color:#854F0B">เหลือ ${b.stock[sid]}</span>` : `มี ${b.stock[sid].toLocaleString("th-TH")}`) : "—";
    return `<tr><td>${i + 1}</td><td>${esc(cat?.name ?? p.cat)}</td><td>${pickThumbSvg(p.pick, `width="56" height="56"`, b.img, { bodyPick: body, hwHex: hw?.hex, isHw: usesHwColor(cat) })}</td>
      <td><b>${esc(info.code)}</b> ${esc(info.name)}${usesHwColor(cat) && hw ? ` · สี${esc(hw.name)}` : ""}${p.pick?.kind === "color" && p.pick.hex ? ` · ${esc(p.pick.hex)}` : ""}</td><td>${esc(p.note)}</td><td>${stock}</td></tr>`;
  }).join("");
  const pocketCells = PANELS.map((p) => `<div class="pk">${pocketPanelSvg(spec, p.key, b.choices)}${spec.pockets[p.key].map((x, i) => {
    const tt = b.choices.find((c) => c.list_key === "pocket_type" && c.code === x.type);
    return `<div class="pkn">${i + 1}) ${esc(tt?.name ?? "")} ${x.w}×${x.h} ซม.${x.note ? ` · ${esc(x.note)}` : ""}</div>`;
  }).join("")}</div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.code)} สูตร ${r.seq}</title><style>
  @page { size: A4; margin: 10mm; }
  body { font-family: "Sarabun","Noto Sans Thai",sans-serif; color:#1f1f1f; margin:0; background:#fff; font-size:12px; line-height:1.5; }
  .doc { width: 190mm; margin: 0 auto; padding: 4mm 0; }
  .hd { display:flex; gap:10px; border-bottom:2px solid #1f1f1f; padding-bottom:6px; }
  .hd .t { font-size:18px; font-weight:700; letter-spacing:.5px; } .hd .r { margin-left:auto; text-align:right; color:#444; }
  h4 { font-size:13px; margin:14px 0 6px; border-bottom:1px solid #ddd; padding-bottom:3px; }
  .kv { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:8px; } .kv div { background:#f6f4ef; padding:5px 8px; border-radius:4px; } .kv b { display:block; font-size:13px; }
  .warn { margin-top:6px; padding:6px 8px; background:#FAEEDA; color:#633806; border-radius:4px; }
  table { width:100%; border-collapse:collapse; } td, th { padding:4px; border-bottom:1px solid #eee; vertical-align:middle; text-align:left; } th { color:#777; font-size:11px; font-weight:400; }
  .pks { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; } .pkn { font-size:10.5px; color:#444; }
  .pr { border:1px solid #e2e2e2; border-radius:4px; padding:6px 8px; margin-bottom:6px; break-inside:avoid; } .pr b { display:block; margin-bottom:2px; } .pr div { font-family: ui-monospace, Menlo, monospace; font-size:10.5px; color:#333; }
  .callout { break-inside: avoid; margin-top: 8px; }
  </style></head><body><div class="doc">
  <div class="hd"><div><div class="t">DESIGN BRIEF</div><div style="color:#666">ใบสรุปแบบสำหรับสร้างรูป</div></div>
  <div class="r">${esc(t.code)} · ${esc(t.name)} · สูตร #${r.seq}${r.name ? ` ${esc(r.name)}` : ""}<br>${esc(b.dateText)}${r.created_by_name ? ` · ผู้ทำ: ${esc(r.created_by_name)}` : ""}</div></div>
  <div class="callout">${calloutSvg(b)}</div>
  <div class="kv"><div>ขนาด (กว้าง×สูง×หนา)<b>${spec.size.w}×${spec.size.h}×${spec.size.d} ซม.</b></div><div>สายยาว<b>${spec.size.strap > 0 ? `${spec.size.strap} ซม.` : "ไม่มี"}</b></div>
  <div>สีอะไหล่ทั้งใบ<b>${esc(hw?.name ?? "—")}</b></div><div>จำนวนจุด<b>${spec.pins.length} จุด</b></div></div>
  ${warn.length ? `<div class="warn">${warn.map(esc).join("<br>")}</div>` : ""}
  ${r.note ? `<div style="margin-top:6px">หมายเหตุ: ${esc(r.note)}</div>` : ""}
  <h4>ตารางสรุป</h4><table><tr><th style="width:5%">#</th><th style="width:14%">หมวด</th><th style="width:12%">รูป</th><th>รหัส · ชื่อ</th><th style="width:24%">โน้ต</th><th style="width:11%">สต็อก</th></tr>${rows || `<tr><td colspan="6" style="color:#999">ยังไม่มีจุด</td></tr>`}</table>
  <h4>ช่อง</h4><div class="pks">${pocketCells}</div>
  <h4>Prompt สำหรับ GPT (แนบรูปเส้นชี้หน้านี้ไปด้วย · เลข [ref N] = เลขจุด)</h4>
  ${prompts.map((p, i) => `<div class="pr"><b>${i + 1}) ${esc(p.title)}</b><div>${esc(p.text)}</div></div>`).join("")}
  </div></body></html>`;
}
