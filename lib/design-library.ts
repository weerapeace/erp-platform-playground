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
export type ChoiceListKey = "bag_type" | "category" | "hw_color" | "thread_color" | "pocket_type" | "rule";
export const CHOICE_LISTS: { key: ChoiceListKey; label: string; hint: string }[] = [
  { key: "bag_type",     label: "ประเภทกระเป๋า",     hint: "รหัส = ตัวนำหน้ารหัสแม่แบบ (เช่น HANB → HANB-001) · ชื่ออังกฤษใช้ใน prompt (เช่น Handbag)" },
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
/** หูกระเป๋า (ซม.) · drop = ความสูงหูจากปากกระเป๋า · gap = ระยะห่างโคนหู 2 ข้าง · total = ความยาวรวมตัดจริง (0 = ให้ระบบประมาณ) · count 0 = ไม่มีหู */
export type Handle = { drop: number; w: number; gap: number; count: number; total: number };
/**
 * ชุดสี — สูตรเดียวแตกได้หลายสี · "สีหลัก" = ของที่เลือกในจุดของสูตรเอง (pins[].pick + hw_color)
 * ชุดสีอื่นเก็บเฉพาะจุดที่ต่างจากสีหลัก (picks[pinId]) · ไม่มีใน picks = เหมือนสีหลัก · hw_color null = สีอะไหล่เหมือนสีหลัก
 */
export type Colorway = { id: string; name: string; hw_color: string | null; picks: Record<string, Pick | null> };
export type Spec = { size: Size; handle: Handle; hw_color: string | null; pins: Pin[]; pockets: Record<PanelKey, PocketBox[]>; colorways: Colorway[] };
export const MAX_COLORWAYS = 8;
export const MAIN_COLORWAY_LABEL = "สีหลัก";

export const DEFAULT_SIZE: Size = { w: 30, h: 35, d: 12, strap: 0 };
export const DEFAULT_HANDLE: Handle = { drop: 18, w: 3, gap: 12, count: 2, total: 0 };
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

export function cleanHandle(v: unknown): Handle {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const s = (k: keyof Handle, d: number) => r1(clamp(num(o[k], d), 0, SIZE_LIMIT.max));
  return { drop: s("drop", DEFAULT_HANDLE.drop), w: s("w", DEFAULT_HANDLE.w), gap: s("gap", DEFAULT_HANDLE.gap), count: Math.round(clamp(num(o.count, DEFAULT_HANDLE.count), 0, 4)), total: s("total", 0) };
}

/** ความยาวหูรวม (ซม.) — ใส่เองใช้ค่านั้น · ไม่ใส่ = ประมาณเป็นครึ่งวงรี (กว้าง = ระยะห่างโคนหู · สูง = ความสูงหู) + ส่วนเย็บติดตัว 4 ซม. × 2 */
export function handleLength(h: Handle): number {
  if (h.total > 0) return h.total;
  const a = h.gap / 2, b = h.drop;
  if (a <= 0 && b <= 0) return 0;
  const half = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))) / 2;   // ครึ่งเส้นรอบวงรี (สูตร Ramanujan)
  return Math.round((half + 8) * 2) / 2;
}

/** ความยาวแบบ 2 หน่วยสำหรับใบสรุป/prompt เช่น "30 cm (11.8 in)" */
export const bothUnits = (cm: number) => `${r1(cm)} cm (${r1(cm / 2.54)} in)`;

/** รหัสแม่แบบถัดไปของตัวนำหน้า เช่น HANB + [HANB-001, HANB-003] → HANB-004 (เลขสูงสุด + 1 · 3 หลัก) */
export function nextTemplateCode(prefix: string, codes: string[]): string {
  const p = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "BAG";
  const re = new RegExp(`^${p}-(\\d+)$`);
  const max = codes.reduce((m, c) => { const x = re.exec(String(c).toUpperCase()); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `${p}-${String(max + 1).padStart(3, "0")}`;
}

/** ประเภทกระเป๋าของแม่แบบ (template.category = รหัสประเภท) — ไม่ตรงรายการ = null (แม่แบบเก่าที่พิมพ์ทรงเอง) */
export const bagTypeOf = (choices: Choice[], category: string | null | undefined) =>
  choices.find((c) => c.list_key === "bag_type" && category && c.code.toUpperCase() === category.trim().toUpperCase()) ?? null;

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
  return { size, handle: cleanHandle(o.handle), hw_color: str(o.hw_color, 40) || null, pins, pockets, colorways: cleanColorways(o.colorways, pins) };
}

/** ชุดสี: ตัดจุดที่ไม่มีแล้วทิ้ง · ชื่อว่าง = "สี N" · id ซ้ำ = ทิ้งตัวหลัง */
export function cleanColorways(v: unknown, pins: Pin[]): Colorway[] {
  const pinIds = new Set(pins.map((p) => p.id));
  const seen = new Set<string>();
  return (Array.isArray(v) ? v : []).slice(0, MAX_COLORWAYS).flatMap((c): Colorway[] => {
    if (!c || typeof c !== "object") return [];
    const i = seen.size;   // ลำดับหลังตัดตัวเสียทิ้ง → ชื่อตั้งต้น "สี N" ไม่ข้ามเลข
    const o = c as Record<string, unknown>;
    const id = idOf(o.id);
    if (seen.has(id)) return [];
    seen.add(id);
    const raw = (o.picks && typeof o.picks === "object" ? o.picks : {}) as Record<string, unknown>;
    const picks: Record<string, Pick | null> = {};
    for (const [pid, pk] of Object.entries(raw)) if (pinIds.has(pid)) picks[pid] = cleanPick(pk);
    return [{ id, name: str(o.name, 60) || `สี ${i + 2}`, hw_color: str(o.hw_color, 40) || null, picks }];
  });
}

/** สูตรตามชุดสีที่เลือก (null/ไม่พบ = สีหลัก) — ใช้ต่อกับ prompt / ใบสรุป / สต็อก ได้ทันทีเพราะหน้าตาเป็น Spec เดิม */
export function applyColorway(spec: Spec, colorwayId: string | null | undefined): Spec {
  const cw = colorwayId ? spec.colorways.find((c) => c.id === colorwayId) : null;
  if (!cw) return spec;
  return {
    ...spec,
    hw_color: cw.hw_color ?? spec.hw_color,
    pins: spec.pins.map((p) => (p.id in cw.picks ? { ...p, pick: cw.picks[p.id] } : p)),
  };
}

export const colorwayLabel = (spec: Spec, colorwayId: string | null | undefined) =>
  (colorwayId && spec.colorways.find((c) => c.id === colorwayId)?.name) || MAIN_COLORWAY_LABEL;

/** ตั้งของของ 1 จุดในชุดสี (pick = undefined → กลับไปเหมือนสีหลัก) · ชุดสีหลัก (null) = แก้ที่จุดตรง ๆ */
export function setColorwayPick(spec: Spec, colorwayId: string | null, pinId: string, pick: Pick | null | undefined): Spec {
  if (!colorwayId) return { ...spec, pins: spec.pins.map((p) => (p.id === pinId ? { ...p, pick: pick ?? null } : p)) };
  return {
    ...spec,
    colorways: spec.colorways.map((c) => {
      if (c.id !== colorwayId) return c;
      const picks = { ...c.picks };
      if (pick === undefined) delete picks[pinId]; else picks[pinId] = pick;
      return { ...c, picks };
    }),
  };
}

/** SKU ทั้งหมดในสูตร รวมทุกชุดสี (ดึงสต็อกสดครั้งเดียว) */
export function allSkuIds(spec: Spec): string[] {
  return [...new Set([...specSkuIds(spec), ...spec.colorways.flatMap((c) => Object.values(c.picks).map(skuIdOf))].filter((x): x is string => !!x))];
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

// ─── เทียบ 2 สูตร (ข้ามแม่แบบได้ · จับคู่ตามหมวด ไม่ใช่ตามตำแหน่งจุด) ───────────
export type CompareSide = { spec: Spec; choices: Choice[]; template: { code: string; name: string; category?: string | null } };
export type CompareRow = {
  group: "ทั่วไป" | "ขนาด" | "หู" | "วัสดุ" | "ช่อง";
  label: string; a: string; b: string; same: boolean;
  /** แถววัสดุ: ของที่เลือก (ไว้โชว์รูปย่อ) */
  picksA?: (Pick | null)[]; picksB?: (Pick | null)[]; cat?: string;
};

const lenText = (cm: number) => (cm > 0 ? `${r1(cm)} ซม.` : "—");

/** ของที่เลือกในหมวดหนึ่ง (หลายจุดหมวดเดียวกัน = หลายตัว) + ข้อความเทียบ (รหัส/ชื่อ เรียงตามจุด) */
function categoryPicks(spec: Spec, cat: string): { picks: (Pick | null)[]; text: string } {
  const body = bodyPickOf(spec);
  const pins = spec.pins.filter((p) => p.cat === cat);
  const text = pins.map((p) => { const i = pickInfo(p.pick, { bodyPick: body }); return [i.code, i.name].filter(Boolean).join(" · ") || "ยังไม่เลือก"; }).join(" / ");
  return { picks: pins.map((p) => p.pick), text: text || "—" };
}

function pocketSummary(spec: Spec, panel: PanelKey, choices: Choice[]): string {
  const boxes = spec.pockets[panel];
  if (!boxes.length) return "ไม่มี";
  return boxes.map((b) => `${choices.find((c) => c.list_key === "pocket_type" && c.code === b.type)?.name ?? "ช่อง"} ${r1(b.w)}×${r1(b.h)}`).join(", ");
}

export function compareRecipes(A: CompareSide, B: CompareSide): CompareRow[] {
  const rows: CompareRow[] = [];
  const push = (group: CompareRow["group"], label: string, a: string, b: string, extra: Partial<CompareRow> = {}) =>
    rows.push({ group, label, a, b, same: a === b, ...extra });
  const typeName = (s: CompareSide) => bagTypeOf(s.choices, s.template.category)?.name ?? s.template.category ?? "—";
  push("ทั่วไป", "แม่แบบ", `${A.template.code} · ${A.template.name}`, `${B.template.code} · ${B.template.name}`);
  push("ทั่วไป", "ประเภท", typeName(A), typeName(B));
  const hwName = (s: CompareSide) => s.choices.find((c) => c.list_key === "hw_color" && c.code === s.spec.hw_color)?.name ?? "—";
  push("ทั่วไป", "สีอะไหล่ทั้งใบ", hwName(A), hwName(B));
  for (const [k, l] of [["w", "กว้าง"], ["h", "สูง"], ["d", "หนา"], ["strap", "สายยาว"]] as const) push("ขนาด", l, lenText(A.spec.size[k]), lenText(B.spec.size[k]));
  const hd = (s: Spec) => s.handle;
  push("หู", "จำนวนหู", `${hd(A.spec).count} หู`, `${hd(B.spec).count} หู`);
  if (hd(A.spec).count > 0 || hd(B.spec).count > 0) {
    for (const [k, l] of [["drop", "ความสูงหู"], ["w", "ความกว้างหู"], ["gap", "ระยะห่างหู"]] as const) push("หู", l, lenText(hd(A.spec)[k]), lenText(hd(B.spec)[k]));
    push("หู", "ความยาวรวมหู", lenText(handleLength(hd(A.spec))), lenText(handleLength(hd(B.spec))));
  }
  // หมวด: เรียงตามลำดับในตัวเลือก (ใช้ตัวเลือกฝั่ง A ก่อน แล้วเติมหมวดที่มีแต่ฝั่ง B)
  const order = [...A.choices, ...B.choices].filter((c) => c.list_key === "category").sort((x, y) => x.sort_order - y.sort_order).map((c) => c.code);
  const used = new Set([...A.spec.pins, ...B.spec.pins].map((p) => p.cat).filter(Boolean));
  const cats = [...new Set([...order.filter((c) => used.has(c)), ...used])];
  for (const cat of cats) {
    const a = categoryPicks(A.spec, cat), b = categoryPicks(B.spec, cat);
    const name = categoryOf(A.choices, cat)?.name ?? categoryOf(B.choices, cat)?.name ?? cat;
    push("วัสดุ", name, a.text, b.text, { picksA: a.picks, picksB: b.picks, cat });
  }
  for (const p of PANELS) push("ช่อง", p.label, pocketSummary(A.spec, p.key, A.choices), pocketSummary(B.spec, p.key, B.choices));
  return rows;
}

// ─── Prompt (3 ชุด: 4 มุมรวมรูปเดียว · ข้างใน · คนสะพาย) ─────────────────────
export type PromptSet = { key: "grid4" | "inside" | "model" | "line" | "3d"; title: string; text: string; hint?: string };
export type RenderView = "grid4" | "inside" | "model" | "line" | "other";
export const RENDER_VIEWS: { key: RenderView; label: string }[] = [
  { key: "grid4",  label: "4 มุม (หน้า หลัง ข้าง เอียง)" },
  { key: "inside", label: "ข้างใน" },
  { key: "model",  label: "คนสะพาย" },
  { key: "line",   label: "ลายเส้น (Vector)" },
  { key: "other",  label: "อื่น ๆ" },
];

const en = (c: Choice | undefined, fb: string) => (c?.name_en?.trim() || c?.name || fb);

function pocketsText(spec: Spec, choices: Choice[], inside: boolean): string {
  const parts: string[] = [];
  for (const p of PANELS.filter((x) => x.inside === inside)) {
    for (const b of spec.pockets[p.key]) {
      const t = choices.find((c) => c.list_key === "pocket_type" && c.code === b.type);
      parts.push(`${p.en} ${en(t, "pocket").toLowerCase()} pocket ${bothUnits(b.w)} wide x ${bothUnits(b.h)} high, placed ${bothUnits(b.y)} below the top edge and ${bothUnits(b.x)} from the left edge${b.note ? ` (${b.note})` : ""}`);
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

/** ชนิดกระเป๋าภาษาอังกฤษสำหรับ prompt: ประเภทกระเป๋า (ชื่ออังกฤษ) → ถ้าไม่ตรงรายการ ใช้ข้อความเดิมของแม่แบบ */
export function bagWord(tpl: { category?: string | null }, choices: Choice[]): string {
  const t = bagTypeOf(choices, tpl.category);
  return (t?.name_en?.trim() || t?.name || tpl.category?.trim() || "bag").toLowerCase();
}

export function handleText(h: Handle): string {
  if (h.count <= 0) return "no top handles";
  return `${h.count} top handle${h.count > 1 ? "s" : ""}, each ${bothUnits(h.w)} wide, rising ${bothUnits(h.drop)} above the bag opening, attached ${bothUnits(h.gap)} apart, total handle length about ${bothUnits(handleLength(h))}`;
}

export function buildPrompts(tpl: { name: string; category?: string | null }, spec: Spec, choices: Choice[]): PromptSet[] {
  const { w, h, d, strap } = spec.size;
  const hw = choices.find((c) => c.list_key === "hw_color" && c.code === spec.hw_color);
  const bag = `${bagWord(tpl, choices)} (${tpl.name}), ${bothUnits(w)} wide x ${bothUnits(h)} high x ${bothUnits(d)} deep, ${handleText(spec.handle)}${strap > 0 ? `, plus a long shoulder strap ${bothUnits(strap)}` : ""}`;
  const parts = partsText(spec, choices);
  const base = `${bag}. ${parts ? parts + "." : ""}${hw ? ` All metal hardware in ${en(hw, hw.name)} finish.` : ""} Outer pockets: ${pocketsText(spec, choices, false)}.`;
  const ref = "Match the attached reference images exactly: numbers [ref N] match the numbered callouts in the attached PDF.";
  const extra: PromptSet[] = [
    { key: "line", title: "ลายเส้น (Vector)", hint: "อัปรูปที่ได้ที่ช่อง “ลายเส้น” แล้วกดตั้งเป็นรูป Vector ของแม่แบบ",
      text: `Clean technical line drawing of the same ${base} Front view only, same angle and proportions as the attached photo. Black outlines on a pure white background, no shading, no color, no texture, no text. Show seams, stitching lines, zipper, pockets and hardware as simple outlines.` },
    { key: "3d", title: "3D (เว็บแปลงรูปเป็นโมเดล)", hint: "ใช้กับเว็บแปลงรูปเป็น 3D (เช่น Meshy, Tripo) — ได้ทรงไว้ดู ขนาดไม่แม่น · ทำแพทเทิร์นจริงใช้ปุ่ม “ส่งเข้าสตูดิโอแพทเทิร์น”",
      text: `Create a 3D model of this ${base} Real-world scale: ${bothUnits(w)} wide, ${bothUnits(h)} high, ${bothUnits(d)} deep. Single watertight object, handles attached, closed bottom, realistic materials matching the reference images, neutral lighting, no background, export as GLB.` },
  ];
  return [
    { key: "grid4", title: "4 มุมรวมรูปเดียว (หน้า · หลัง · ข้าง · เอียง)",
      text: `Create ONE image arranged as a 2x2 grid showing the SAME ${base} Top-left: front view. Top-right: back view. Bottom-left: side view showing the ${d} cm gusset. Bottom-right: three-quarter view. ${ref} Plain white background, soft studio light, photorealistic, identical color and texture in all 4 views, no text.` },
    { key: "inside", title: "ข้างใน",
      text: `Photorealistic top-down photo looking inside the open ${base} Inside pockets: ${pocketsText(spec, choices, true)}. Show the lining clearly. ${ref} Plain white background, soft light, no text.` },
    { key: "model", title: "คนสะพาย",
      text: `Lifestyle photo of a Thai female model wearing the ${base}${strap > 0 ? ` Carried with the long shoulder strap, ${bothUnits(strap)} long.` : " Carried on the shoulder by the handle."} Neutral outfit, clean minimal backdrop, natural light, the bag clearly visible and true to the reference images.` },
    ...extra,
  ];
}

// ─── ส่งเข้าสตูดิโอแพทเทิร์น (/pattern-studio) ────────────────────────────────
/** ค่าแม่แบบทรงของสตูดิโอ (lib/bag-templates BagParams) จากสูตร — ช่องแรกของด้านนอกหน้า = ช่องบนตัวหน้า (ซิป/ช่องสอด) */
export type StudioBagParams = { W: number; H: number; D: number; Lh: number; wh: number; g: number; win?: "rect" | "none"; winType?: "zip" | "slot"; ws?: number; wy?: number };
export function toStudioParams(spec: Spec): StudioBagParams {
  const { w, h, d } = spec.size, hd = spec.handle;
  const p: StudioBagParams = { W: w, H: h, D: d, Lh: handleLength(hd) || 45, wh: hd.w || 2.5, g: hd.gap || 14 };
  const f = spec.pockets.front[0];
  if (f && (f.type === "zip" || f.type === "slip")) {
    p.win = "rect"; p.winType = f.type === "zip" ? "zip" : "slot"; p.ws = f.w;
    p.wy = r1(h - (f.y + (f.type === "zip" ? 0 : f.h / 2)));   // สตูดิโอวัดกลางช่องจากก้น · สูตรวัดจากขอบบน
  }
  return p;
}
/** ข้อมูลที่เก็บใน template ของแพทเทิร์นใหม่ → สตูดิโอเปิดตัวสร้างจากแม่แบบพร้อมค่านี้ (ตอนยังไม่มีชิ้น) */
export type DlDraft = { params: StudioBagParams; notice: string; recipe_id: string };
export function dlDraftOf(template: Record<string, unknown> | null | undefined): { params: StudioBagParams; notice: string } | null {
  const d = template && typeof template === "object" ? (template as { dl_draft?: unknown }).dl_draft : null;
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const params = (o.params && typeof o.params === "object" ? o.params : null) as StudioBagParams | null;
  return params ? { params, notice: String(o.notice ?? "") } : null;
}

// ─── ใบสรุป (HTML ให้ PrintFrame) ───────────────────────────────────────────────
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const inch = (cm: number) => r1(cm / 2.54);
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
  /** ชุดสีของใบนี้ (spec = สูตรที่ applyColorway แล้ว) · baseSpec = สูตรเต็มทุกชุดสี → โชว์ตารางชุดสี */
  colorwayName?: string | null;
  baseSpec?: Spec;
};

/** ตารางชุดสี: แถว = จุด · คอลัมน์ = สีหลัก + ชุดสีอื่น (โชว์เฉพาะจุดที่มีอย่างน้อย 1 ชุดสีเปลี่ยน + แถวสีอะไหล่) */
export function colorwayTableHtml(spec: Spec, choices: Choice[], img: (key: string, w: number) => string): string {
  if (!spec.colorways.length) return "";
  const cols = [{ id: null as string | null, name: MAIN_COLORWAY_LABEL }, ...spec.colorways.map((c) => ({ id: c.id as string | null, name: c.name }))];
  const views = cols.map((c) => applyColorway(spec, c.id));
  const changed = spec.pins.map((p, i) => ({ p, i })).filter(({ p }) => spec.colorways.some((c) => p.id in c.picks));
  const hwName = (s: Spec) => esc(choices.find((c) => c.list_key === "hw_color" && c.code === s.hw_color)?.name ?? "—");
  const head = `<tr><th style="width:16%">จุด</th>${cols.map((c) => `<th>${esc(c.name)}</th>`).join("")}</tr>`;
  const body = changed.map(({ p, i }) => `<tr><td>${i + 1}. ${esc(categoryOf(choices, p.cat)?.name ?? p.cat)}</td>${views.map((v) => {
    const pk = v.pins[i].pick; const info = pickInfo(pk, { bodyPick: bodyPickOf(v) });
    return `<td><div style="display:flex;gap:4px;align-items:center">${pickThumbSvg(pk, `width="34" height="34"`, img, { bodyPick: bodyPickOf(v) })}<span style="font-size:10.5px">${esc(info.code || info.name || "—")}</span></div></td>`;
  }).join("")}</tr>`).join("");
  const hwRow = spec.colorways.some((c) => c.hw_color) ? `<tr><td>สีอะไหล่ทั้งใบ</td>${views.map((v) => `<td>${hwName(v)}</td>`).join("")}</tr>` : "";
  return `<h4>ชุดสี (${cols.length} สี)</h4><table>${head}${body || ""}${hwRow}${!body && !hwRow ? `<tr><td colspan="${cols.length + 1}" style="color:#999">ทุกชุดสียังเหมือนสีหลัก</td></tr>` : ""}</table>`;
}

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
  .kv { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:8px; } .kv div { background:#f6f4ef; padding:5px 8px; border-radius:4px; } .kv b { display:block; font-size:13px; } .kv .in { display:block; font-size:10.5px; color:#777; }
  .warn { margin-top:6px; padding:6px 8px; background:#FAEEDA; color:#633806; border-radius:4px; }
  table { width:100%; border-collapse:collapse; } td, th { padding:4px; border-bottom:1px solid #eee; vertical-align:middle; text-align:left; } th { color:#777; font-size:11px; font-weight:400; }
  .pks { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; } .pkn { font-size:10.5px; color:#444; }
  .pr { border:1px solid #e2e2e2; border-radius:4px; padding:6px 8px; margin-bottom:6px; break-inside:avoid; } .pr b { display:block; margin-bottom:2px; } .pr div { font-family: ui-monospace, Menlo, monospace; font-size:10.5px; color:#333; }
  .callout { break-inside: avoid; margin-top: 8px; }
  </style></head><body><div class="doc">
  <div class="hd"><div><div class="t">DESIGN BRIEF</div><div style="color:#666">ใบสรุปแบบสำหรับสร้างรูป</div></div>
  <div class="r">${esc(t.code)} · ${esc(t.name)} · สูตร #${r.seq}${r.name ? ` ${esc(r.name)}` : ""}${b.colorwayName ? ` · <b>${esc(b.colorwayName)}</b>` : ""}<br>${esc(b.dateText)}${r.created_by_name ? ` · ผู้ทำ: ${esc(r.created_by_name)}` : ""}</div></div>
  <div class="callout">${calloutSvg(b)}</div>
  <div class="kv"><div>ขนาด (กว้าง×สูง×หนา)<b>${spec.size.w}×${spec.size.h}×${spec.size.d} ซม.</b><span class="in">${inch(spec.size.w)}×${inch(spec.size.h)}×${inch(spec.size.d)} นิ้ว</span></div>
  <div>สายยาว<b>${spec.size.strap > 0 ? `${spec.size.strap} ซม.` : "ไม่มี"}</b>${spec.size.strap > 0 ? `<span class="in">${inch(spec.size.strap)} นิ้ว</span>` : ""}</div>
  <div>สีอะไหล่ทั้งใบ<b>${esc(hw?.name ?? "—")}</b></div><div>จำนวนจุด<b>${spec.pins.length} จุด</b></div></div>
  <div class="kv" style="grid-template-columns:repeat(5,1fr)">${spec.handle.count > 0 ? [
    ["จำนวนหู", `${spec.handle.count} หู`, ""], ["ความสูงหู", `${spec.handle.drop} ซม.`, `${inch(spec.handle.drop)} นิ้ว`], ["ความกว้างหู", `${spec.handle.w} ซม.`, `${inch(spec.handle.w)} นิ้ว`],
    ["ระยะห่างหู", `${spec.handle.gap} ซม.`, `${inch(spec.handle.gap)} นิ้ว`], [spec.handle.total > 0 ? "ความยาวรวมหู" : "ความยาวรวมหู (ประมาณ)", `${handleLength(spec.handle)} ซม.`, `${inch(handleLength(spec.handle))} นิ้ว`],
  ].map(([a, v, i]) => `<div>${a}<b>${v}</b>${i ? `<span class="in">${i}</span>` : ""}</div>`).join("") : `<div>หูกระเป๋า<b>ไม่มีหู</b></div>`}</div>
  ${warn.length ? `<div class="warn">${warn.map(esc).join("<br>")}</div>` : ""}
  ${r.note ? `<div style="margin-top:6px">หมายเหตุ: ${esc(r.note)}</div>` : ""}
  <h4>ตารางสรุป</h4><table><tr><th style="width:5%">#</th><th style="width:14%">หมวด</th><th style="width:12%">รูป</th><th>รหัส · ชื่อ</th><th style="width:24%">โน้ต</th><th style="width:11%">สต็อก</th></tr>${rows || `<tr><td colspan="6" style="color:#999">ยังไม่มีจุด</td></tr>`}</table>
  ${b.baseSpec ? colorwayTableHtml(b.baseSpec, b.choices, b.img) : ""}
  <h4>ช่อง</h4><div class="pks">${pocketCells}</div>
  <h4>Prompt สำหรับ GPT (แนบรูปเส้นชี้หน้านี้ไปด้วย · เลข [ref N] = เลขจุด)</h4>
  ${prompts.map((p, i) => `<div class="pr"><b>${i + 1}) ${esc(p.title)}</b><div>${esc(p.text)}</div></div>`).join("")}
  </div></body></html>`;
}
