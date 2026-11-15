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
export type ChoiceListKey = "bag_type" | "category" | "hw_color" | "thread_color" | "pocket_type" | "rule" | "prompt" | "logo_method" | "accessory";
export const CHOICE_LISTS: { key: ChoiceListKey; label: string; hint: string }[] = [
  { key: "bag_type",     label: "ประเภทกระเป๋า",     hint: "รหัส = ตัวนำหน้ารหัสแม่แบบ (เช่น HANB → HANB-001) · ชื่ออังกฤษใช้ใน prompt (เช่น Handbag)" },
  { key: "category",     label: "หมวดที่เปลี่ยนได้", hint: "จุดบนรูปเลือกหมวดจากรายการนี้ · แต่ละหมวดเลือกจากแหล่งต่างกัน" },
  { key: "hw_color",     label: "สีอะไหล่",          hint: "เลือกครั้งเดียว ใช้กับอะไหล่ทุกชิ้นทั้งใบ" },
  { key: "thread_color", label: "สีด้าย (รหัสสี)",   hint: "ใส่รหัสสีด้ายจริง เช่น TH-402" },
  { key: "pocket_type",  label: "แบบช่อง",           hint: "ใช้ตอนวาดช่องหน้า/หลัง/ข้างใน" },
  { key: "rule",         label: "กฎห้ามคู่",          hint: "ถ้าเลือก A คู่กับ B ระบบเตือน (ไม่บล็อก)" },
  { key: "prompt",       label: "Prompt",            hint: "เปิด/ปิด prompt ของระบบตั้งต้นทั้งทีม (แต่ละสูตรปรับเองได้) · เพิ่มแม่แบบ prompt ของทีม ใส่คำแทนอย่าง {ขนาด} {วัสดุ} ให้ระบบเติมค่าของสูตรให้" },
  { key: "logo_method",  label: "วิธีทำโลโก้",        hint: "จุดโลโก้เลือกวิธี → ตัวเลือกย่อย (เช่น Embossed → ฟอยล์ทอง) · คำเตือนขึ้นทุกครั้งที่เลือก · แท็กวัสดุที่ไม่เหมาะ = เตือนเองเมื่อตัวกระเป๋าเป็นวัสดุนั้น" },
  { key: "accessory",    label: "ส่วนเสริม",          hint: "พวงกุญแจ ชาร์ม สายคล้องแขน ฯลฯ · ใส่รูป + กลุ่ม · ผูก SKU ได้ (ไม่บังคับ) → ผูกแล้วเห็นสต็อก/ทุน" },
];

/** แหล่งที่ใช้เลือกของหมวด */
export type CategorySource = "swatch" | "sku" | "color" | "logo" | "sku_text";
export const CATEGORY_SOURCES: { key: CategorySource; label: string }[] = [
  { key: "swatch",   label: "แผงผ้า + รายการ (เปิดแผงก่อน)" },
  { key: "sku",      label: "รายการวัสดุตามแท็ก (เปิดรายการก่อน)" },
  { key: "color",    label: "รหัสสี (รายการสีด้ายเดิม)" },
  { key: "logo",     label: "โลโก้ (วิธีทำ + รูป)" },
  { key: "sku_text", label: "ค้นวัสดุ หรือเขียนเอง" },
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
  /** โลโก้ (รอบ 7): รูป (ไม่บังคับถ้าเลือกวิธีแล้ว) + วิธีทำ (logo_method) + ตัวเลือกย่อย + วัสดุของโลโก้ (เช่น โลโก้หนัง) */
  /** รอบ 8: color = สีโลโก้/สีด้ายปัก (ต่อชุดสี) · img_w/img_h = ขนาดรูปโลโก้ (ล็อกสัดส่วนตอนใส่ขนาด) */
  | { kind: "logo"; image_key: string | null; name: string; asset_id: string | null; method?: string; option?: string; material?: LogoMaterial | null; color?: string; img_w?: number; img_h?: number }
  | { kind: "text"; text: string }
  | { kind: "same_as_body" };

export type LogoMaterial = { sku_id: string | null; code: string; name: string; image_key: string | null };
/**
 * จุดบนรูป · รอบ 8 (ไม่บังคับ — ไม่ใส่ = ค่าตั้งต้น · ทุกชุดสีใช้ร่วมกัน):
 *   qty = จำนวนชิ้นต่อจุด (ตาไก่ 4 ตัว) ไม่ใส่ = 1 · len = ความยาว ซม. (ซิปยาว 28) · dim = ขนาดโลโก้ กว้าง × สูง ซม.
 *   view = มุมที่ปักจุด (spec.views[].id) ไม่ใส่ = รูปหลักของแม่แบบ
 */
export type Pin = { id: string; x: number; y: number; cat: string; pick: Pick | null; note: string; qty?: number; len?: number; dim?: Dim | null; view?: string };
export type Dim = { w: number; h: number };
/**
 * ส่วนเสริมที่เลือกในสูตร (รอบ 7) — เก็บสำเนาชื่อ/รูป ณ ตอนเลือก (เปิดย้อนหลังได้แม้รายการถูกแก้) · ทุกชุดสีใช้ร่วมกัน
 * รอบ 8: qty = จำนวน (ไม่ใส่ = 1) · pos = ตำแหน่งที่ปักบนรูป (% ของรูป · view = มุม) · ไม่ปัก = ไม่มี pos
 */
export type AccessoryPick = { id: string; code: string; name: string; name_en: string; group: string; image_key: string | null; sku_id: string | null; sku_code: string; note: string;
  qty?: number; pos?: AccPos | null };
export type AccPos = { x: number; y: number; view?: string };
/** มุมเพิ่มเติมของสูตร (รอบ 8) — ปักจุดได้หลายมุม (หลัง / ข้าง / ด้านใน) · รูปจากรูปอ้างอิง / รูป GPT / อัปใหม่ */
export type ViewImage = { id: string; label: string; image_key: string; w: number | null; h: number | null };
export const MAX_VIEWS = 6;
export const VIEW_LABELS = ["ด้านหลัง", "ด้านข้าง", "ด้านใน", "ด้านล่าง", "ด้านบน", "ระยะใกล้"];
export const MAX_ACCESSORIES = 20;
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
/** รูปอ้างอิงของสูตร (รอบ 7 ช่วง 3) — อัปได้หลายรูป · ใช้เป็นพื้นหลังวาดช่อง + โชว์ในใบสรุป */
export type RefImage = { id: string; image_key: string; w: number | null; h: number | null; note: string };
export const MAX_REFS = 12;
/** กรอบขอบกระเป๋าบนรูป (% ของรูป) */
export type Frame = { x: number; y: number; w: number; h: number };
/** พื้นหลังวาดช่องของฝั่งหนึ่ง: รูป + กรอบที่ผู้ใช้ดึงให้ตรงขอบกระเป๋า (กรอบ = กว้าง × สูง ของกระเป๋า) → วาดช่องทับรูปแล้วได้ ซม. */
export type PanelBg = { key: string; w: number; h: number; frame: Frame };
export const DEFAULT_FRAME: Frame = { x: 10, y: 10, w: 80, h: 80 };
export type Spec = { size: Size; handle: Handle; hw_color: string | null; pins: Pin[]; pockets: Record<PanelKey, PocketBox[]>; colorways: Colorway[]; cost: RecipeCost; prompts: RecipePrompts; accessories: AccessoryPick[];
  refs: RefImage[]; pocket_bg: Partial<Record<PanelKey, PanelBg>>; views: ViewImage[] };
export const MAX_COLORWAYS = 8;
export const MAIN_COLORWAY_LABEL = "สีหลัก";

/**
 * รอบ 6 (เจ้าของเลือก 2026-11-14): ขนาด/หู "ไม่บังคับ" — 0 = ยังไม่ระบุ (ช่องว่าง)
 *   prompt / ใบสรุป / ใบสั่งทำตัวอย่าง ข้ามค่าที่ไม่ระบุ · ทุนประมาณบอกให้ใส่ขนาดก่อน · ส่งเข้าสตูดิโอต้องมีขนาดครบ
 *   หู count -1 = ยังไม่ระบุ · 0 = ไม่มีหู
 */
export const DEFAULT_SIZE: Size = { w: 0, h: 0, d: 0, strap: 0 };
export const HANDLE_UNSET = -1;
export const DEFAULT_HANDLE: Handle = { drop: 0, w: 0, gap: 0, count: HANDLE_UNSET, total: 0 };
export const SIZE_LIMIT = { min: 0, max: 200 };
/** กว้าง/สูง/หนา ใส่ครบไหม (คิดผ้า / ส่งสตูดิโอ ต้องครบ) */
export const sizeKnown = (s: Size) => s.w > 0 && s.h > 0 && s.d > 0;
/** กรอบหน้า/หลังสำหรับวาดตำแหน่งช่อง — ยังไม่ใส่ขนาด = ใช้กรอบตัวอย่าง 30×35 (placeholder = true) */
export const panelSize = (s: Size) => ({ w: s.w > 0 ? s.w : 30, h: s.h > 0 ? s.h : 35, placeholder: !(s.w > 0 && s.h > 0) });
export const MAX_PINS = 40;
export const MAX_BOXES = 12;

/** ทุนประมาณ: ค่าที่แก้เอง (lib/design-library-cost) — ราคาเห็นเฉพาะ products.cost.view (API ตัดออกให้คนไม่มีสิทธิ์) */
/** ค่าที่ผู้ใช้แก้เอง (เก็บใน spec.cost) — qty ต่อบรรทัด · price ต่อรหัสของ (ทุกชุดสีใช้ร่วม) · ค่าแรง · ค่าอื่น ๆ */
/** รอบ 8: once = ค่าทำครั้งแรกที่ใส่เอง (ค่าบล็อก/เพลท/แม่พิมพ์) · batch = จำนวนผลิตต่อล็อต (> 0 = หารค่าครั้งแรกเข้าทุนต่อใบ) */
export type RecipeCost = { qty: Record<string, number>; price: Record<string, number>; labor: number; extras: { label: string; amount: number }[]; once: { label: string; amount: number }[]; batch: number };
export const EMPTY_COST: RecipeCost = { qty: {}, price: {}, labor: 0, extras: [], once: [], batch: 0 };
const n0 = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) / 10000 : null; };
// eslint-disable-next-line no-control-regex
const keyOk = (k: string) => k.length > 0 && k.length <= 120 && !/[\u0000-\u001f]/.test(k);
export function cleanCost(v: unknown): RecipeCost {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const map = (x: unknown) => {
    const out: Record<string, number> = {};
    if (x && typeof x === "object") for (const [k, val] of Object.entries(x as Record<string, unknown>).slice(0, 200)) { const n = n0(val); if (n != null && keyOk(k)) out[k] = n; }
    return out;
  };
  const rows = (v: unknown, max: number) => (Array.isArray(v) ? v : []).slice(0, max).flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const q = e as Record<string, unknown>; const amount = n0(q.amount);
    const label = typeof q.label === "string" ? q.label.trim().slice(0, 80) : "";
    return amount == null || (!label && !amount) ? [] : [{ label, amount }];
  });
  const batch = Math.round(Math.min(1_000_000, n0(o.batch) ?? 0));
  return { qty: map(o.qty), price: map(o.price), labor: n0(o.labor) ?? 0, extras: rows(o.extras, 20), once: rows(o.once, 10), batch };
}

// ─── ทำความสะอาด / ตรวจ ───────────────────────────────────────────────────────
const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const idOf = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : Math.random().toString(36).slice(2, 10));

export function cleanSize(v: unknown): Size {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const s = (k: keyof Size, d: number, lo: number) => r1(clamp(num(o[k], d), lo, SIZE_LIMIT.max));
  return { w: s("w", DEFAULT_SIZE.w, 0), h: s("h", DEFAULT_SIZE.h, 0), d: s("d", DEFAULT_SIZE.d, 0), strap: s("strap", 0, 0) };
}

export function cleanHandle(v: unknown): Handle {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const s = (k: keyof Handle, d: number) => r1(clamp(num(o[k], d), 0, SIZE_LIMIT.max));
  return { drop: s("drop", DEFAULT_HANDLE.drop), w: s("w", DEFAULT_HANDLE.w), gap: s("gap", DEFAULT_HANDLE.gap), count: Math.round(clamp(num(o.count, DEFAULT_HANDLE.count), HANDLE_UNSET, 4)), total: s("total", 0) };
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
    case "logo": {
      const image_key = str(o.image_key, 300) || null, method = str(o.method, 40);
      if (!image_key && !method && !str(o.color, 40)) return null;
      const m = o.material && typeof o.material === "object" ? (o.material as Record<string, unknown>) : null;
      const material = m && (str(m.code, 80) || str(m.name, 200)) ? { sku_id: str(m.sku_id, 40) || null, code: str(m.code, 80), name: str(m.name, 200), image_key: str(m.image_key, 300) || null } : null;
      const color = str(o.color, 40), iw = Math.round(num(o.img_w)), ih = Math.round(num(o.img_h));
      return { kind: "logo", image_key, name: str(o.name, 200), asset_id: str(o.asset_id, 40) || null, ...(method ? { method } : {}), ...(method && str(o.option, 40) ? { option: str(o.option, 40) } : {}), ...(material ? { material } : {}),
        ...(color ? { color } : {}), ...(iw > 0 && ih > 0 ? { img_w: iw, img_h: ih } : {}) };
    }
    case "text": return str(o.text, 300) ? { kind: "text", text: str(o.text, 300) } : null;
    case "same_as_body": return { kind: "same_as_body" };
    default: return null;
  }
}

export function cleanBox(v: unknown, size: Size): PocketBox | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const P = panelSize(size);   // ยังไม่ใส่ขนาด = บีบในกรอบตัวอย่าง (ไม่ทำให้ช่องหายเป็น 0)
  const w = r1(clamp(num(o.w, 5), 1, P.w)), h = r1(clamp(num(o.h, 5), 1, P.h));
  return { id: idOf(o.id), x: r1(clamp(num(o.x), 0, P.w - w)), y: r1(clamp(num(o.y), 0, P.h - h)), w, h, type: str(o.type, 40), note: str(o.note, 300) };
}

export function emptyPockets(): Record<PanelKey, PocketBox[]> { return { front: [], back: [], inside_front: [], inside_back: [] }; }

/** ทำสูตรให้ถูกรูปแบบเสมอ (ค่าแปลก/เกิน = ตัดทิ้ง/บีบให้อยู่ในช่วง) — ใช้ทั้งตอนบันทึก (API) และตอนเปิด (หน้า) */
export function cleanSpec(v: unknown): Spec {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const size = cleanSize(o.size);
  const views = cleanViews(o.views);
  const viewIds = new Set(views.map((v) => v.id));
  const pins = (Array.isArray(o.pins) ? o.pins : []).slice(0, MAX_PINS).map((p): Pin | null => {
    if (!p || typeof p !== "object") return null;
    const q = p as Record<string, unknown>;
    return { id: idOf(q.id), x: r1(clamp(num(q.x), 0, 100)), y: r1(clamp(num(q.y), 0, 100)), cat: str(q.cat, 40), pick: cleanPick(q.pick), note: str(q.note, 300), ...pinExtras(q, viewIds) };
  }).filter((p): p is Pin => !!p);
  const raw = (o.pockets && typeof o.pockets === "object" ? o.pockets : {}) as Record<string, unknown>;
  const pockets = emptyPockets();
  for (const p of PANELS) {
    pockets[p.key] = (Array.isArray(raw[p.key]) ? (raw[p.key] as unknown[]) : []).slice(0, MAX_BOXES)
      .map((b) => cleanBox(b, size)).filter((b): b is PocketBox => !!b);
  }
  const accessories = cleanAccessories(o.accessories).map((a) => (a.pos?.view && !viewIds.has(a.pos.view) ? { ...a, pos: null } : a));   // มุมถูกลบ = ส่วนเสริมหลุดจากรูป
  return { size, handle: cleanHandle(o.handle), hw_color: str(o.hw_color, 40) || null, pins, pockets, colorways: cleanColorways(o.colorways, pins), cost: cleanCost(o.cost), prompts: cleanPrompts(o.prompts), accessories,
    refs: cleanRefs(o.refs), pocket_bg: cleanPocketBg(o.pocket_bg), views };
}

type PinExtra = { qty?: number; len?: number; dim?: Dim; view?: string };
/** ค่าเสริมของจุด (รอบ 8) — ใส่เฉพาะที่มีค่า (สูตรเก่าไม่มีช่องเหล่านี้ = ค่าตั้งต้น) */
function pinExtras(q: Record<string, unknown>, viewIds: Set<string>): PinExtra {
  const out: PinExtra = {};
  const qty = Math.round(num(q.qty, 1));
  if (qty > 1) out.qty = Math.min(999, qty);
  const len = r1(clamp(num(q.len), 0, 500));
  if (len > 0) out.len = len;
  const d = cleanDim(q.dim);
  if (d) out.dim = d;
  const v = str(q.view, 40);
  if (v && viewIds.has(v)) out.view = v;
  return out;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
/** ขนาด (ซม.) — กว้าง/สูงต้อง > 0 ทั้งคู่ · บีบ 0.1–100 · ทศนิยม 2 ตำแหน่ง (โลโก้ 3.5 มม. = 0.35) */
export function cleanDim(v: unknown): Dim | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const w = r2(num(o.w)), h = r2(num(o.h));
  return w > 0 && h > 0 ? { w: clamp(w, 0.1, 100), h: clamp(h, 0.1, 100) } : null;
}
/** มุมเพิ่มเติม: ต้องมีรูป · id ซ้ำ = ทิ้งตัวหลัง · สูงสุด MAX_VIEWS */
export function cleanViews(v: unknown): ViewImage[] {
  const seen = new Set<string>();
  return (Array.isArray(v) ? v : []).flatMap((x): ViewImage[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>; const key = str(o.image_key, 300);
    if (!key) return [];
    const id = idOf(o.id);
    if (seen.has(id)) return [];
    seen.add(id);
    const dim = (n: unknown) => (Number(n) > 0 ? Math.round(Number(n)) : null);
    return [{ id, label: str(o.label, 40) || "มุมเพิ่ม", image_key: key, w: dim(o.w), h: dim(o.h) }];
  }).slice(0, MAX_VIEWS);
}
/** จำนวนชิ้นของจุด (ไม่ใส่ = 1) */
export const pinQty = (p: { qty?: number }) => (p.qty && p.qty > 1 ? p.qty : 1);

/** รูปอ้างอิง: ต้องมี key · key ซ้ำ = ทิ้งตัวหลัง · สูงสุด MAX_REFS */
export function cleanRefs(v: unknown): RefImage[] {
  const seen = new Set<string>();
  return (Array.isArray(v) ? v : []).flatMap((x): RefImage[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>; const key = str(o.image_key, 300);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    const dim = (n: unknown) => (Number(n) > 0 ? Math.round(Number(n)) : null);
    return [{ id: idOf(o.id), image_key: key, w: dim(o.w), h: dim(o.h), note: str(o.note, 200) }];
  }).slice(0, MAX_REFS);
}

/** กรอบ: บีบให้อยู่ในรูป (0–100%) · กว้าง/สูงอย่างน้อย 2% */
export function cleanFrame(v: unknown): Frame {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const w = r1(clamp(num(o.w, DEFAULT_FRAME.w), 2, 100)), h = r1(clamp(num(o.h, DEFAULT_FRAME.h), 2, 100));
  return { x: r1(clamp(num(o.x, DEFAULT_FRAME.x), 0, 100 - w)), y: r1(clamp(num(o.y, DEFAULT_FRAME.y), 0, 100 - h)), w, h };
}
export function cleanPocketBg(v: unknown): Partial<Record<PanelKey, PanelBg>> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: Partial<Record<PanelKey, PanelBg>> = {};
  for (const p of PANELS) {
    const b = o[p.key];
    if (!b || typeof b !== "object") continue;
    const q = b as Record<string, unknown>; const key = str(q.key, 300);
    const w = Number(q.w), h = Number(q.h);
    if (!key || !(w > 0) || !(h > 0)) continue;
    out[p.key] = { key, w: Math.round(w), h: Math.round(h), frame: cleanFrame(q.frame) };
  }
  return out;
}
/**
 * วางรูปพื้นหลังในช่องวาด: กรอบบนรูป → ทับพอดีกรอบกระเป๋า (ox, oy, กว้าง pw, สูง ph หน่วยจอ)
 * แกนนอก/ตั้งคิดแยกกัน (รูปถ่ายเอียงนิดหน่อยยังวัดได้ทั้ง 2 แกน) → คืนตำแหน่ง/ขนาดของรูปทั้งรูป
 */
export function bgPlacement(frame: Frame, ox: number, oy: number, pw: number, ph: number): { x: number; y: number; width: number; height: number } {
  const width = pw / (frame.w / 100), height = ph / (frame.h / 100);
  return { x: ox - (frame.x / 100) * width, y: oy - (frame.y / 100) * height, width, height };
}

/** ส่วนเสริม: ตัดแถวไม่มีรหัส/ชื่อ · รหัสซ้ำ = ทิ้งตัวหลัง · สูงสุด MAX_ACCESSORIES */
export function cleanAccessories(v: unknown): AccessoryPick[] {
  const seen = new Set<string>();
  return (Array.isArray(v) ? v : []).flatMap((a): AccessoryPick[] => {
    if (!a || typeof a !== "object") return [];
    const o = a as Record<string, unknown>;
    const code = str(o.code, 60), name = str(o.name, 200);
    if (!code || !name || seen.has(code)) return [];
    seen.add(code);
    const qty = Math.round(num(o.qty, 1));
    const p = o.pos && typeof o.pos === "object" ? (o.pos as Record<string, unknown>) : null;
    const view = p ? str(p.view, 40) : "";
    const pos: AccPos | null = p ? { x: r1(clamp(num(p.x), 0, 100)), y: r1(clamp(num(p.y), 0, 100)), ...(view ? { view } : {}) } : null;
    return [{ id: idOf(o.id), code, name, name_en: str(o.name_en, 200), group: str(o.group, 80), image_key: str(o.image_key, 300) || null, sku_id: str(o.sku_id, 40) || null, sku_code: str(o.sku_code, 80), note: str(o.note, 300),
      ...(qty > 1 ? { qty: Math.min(99, qty) } : {}), ...(pos ? { pos } : {}) }];
  }).slice(0, MAX_ACCESSORIES);
}

/** ป้ายส่วนเสริมบนรูป / ในใบ — A1, A2 … ตามลำดับในสูตร */
export const accessoryLabel = (i: number) => `A${i + 1}`;
/** รหัสส่วนเสริมถัดไป (เพิ่มจากป๊อปเลือก) — ACC-001 … เลขสูงสุด + 1 */
export function nextAccessoryCode(codes: string[]): string {
  const max = codes.reduce((m, c) => { const x = /^ACC-(\d+)$/i.exec(String(c)); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `ACC-${String(max + 1).padStart(3, "0")}`;
}

/** รายการตัวเลือกส่วนเสริม → ของที่เก็บในสูตร (สำเนา ณ ตอนเลือก) */
export function accessoryFromChoice(c: Choice, id: string): AccessoryPick {
  const g = c.config ?? {};
  return { id, code: c.code, name: c.name, name_en: c.name_en ?? "", group: str(g.group, 80), image_key: str(g.image_key, 300) || null, sku_id: str(g.sku_id, 40) || null, sku_code: str(g.sku_code, 80), note: "" };
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
  return [...new Set([...specSkuIds(spec), ...spec.colorways.flatMap((c) => Object.values(c.picks).map(skuIdOf)), ...(spec.accessories ?? []).map((a) => a.sku_id)].filter((x): x is string => !!x))];
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

export const skuIdOf = (p: Pick | null): string | null => (p && (p.kind === "sku" || p.kind === "swatch") ? p.sku_id : p?.kind === "logo" ? p.material?.sku_id ?? null : null);
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

/** รายการข้อความจาก config (array หรือข้อความคั่นด้วย , / ขึ้นบรรทัด) */
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x, 80)) : typeof v === "string" ? v.split(/[,\n]/).map((x) => x.trim().slice(0, 80)) : []).filter(Boolean);
/** แท็กของหมวด (ชื่อแท็กกลาง product_families) — ใช้กรองแผงผ้า + รายการวัสดุในป๊อปเลือก (รอบ 7) */
export const categoryTags = (cat: Choice | undefined): string[] => listOf(cat?.config?.tags);
export type CategoryChip = { label: string; search: string };
/** ปุ่มลัดในแท็บรายการ เช่น เบอร์ด้าย "เบอร์ 30=THREAD-30" → ค้นด้วยคำนำหน้า */
export function categoryChips(cat: Choice | undefined): CategoryChip[] {
  return listOf(cat?.config?.chips).map((s) => { const [a, b] = s.split("="); return { label: a.trim(), search: (b ?? a).trim() }; }).filter((c) => c.label && c.search);
}
/** ป๊อปเลือกวัสดุเปิดแท็บไหนก่อน: หมวดจากแผงผ้า = แผง · นอกนั้น = รายการ */
export const defaultMaterialTab = (cat: Choice | undefined): "board" | "list" | "search" => (sourceOf(cat) === "swatch" ? "board" : categoryTags(cat).length || categoryChips(cat).length ? "list" : "search");

// ─── โลโก้ 2 ชั้น (รอบ 7) ─────────────────────────────────────────────────────
export type LogoOption = { code: string; name: string; name_en: string };
export const logoMethods = (choices: Choice[]) => choices.filter((c) => c.list_key === "logo_method" && c.is_active !== false);
/** ตัวเลือกย่อยของวิธี — config.options = [{code,name,name_en}] หรือข้อความ "ชื่อ=English" ทีละบรรทัด */
export function logoOptions(m: Choice | undefined): LogoOption[] {
  const raw = m?.config?.options;
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\n|,/) : [];
  const seen = new Set<string>();
  return arr.flatMap((x, i): LogoOption[] => {
    if (typeof x === "string") { const [a, b] = x.split("="); const name = a.trim().slice(0, 80); if (!name) return []; const code = `o${i + 1}`; return [{ code, name, name_en: (b ?? "").trim().slice(0, 80) }]; }
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>; const name = str(o.name, 80); const code = str(o.code, 40) || `o${i + 1}`;
    if (!name || seen.has(code)) return [];
    seen.add(code);
    return [{ code, name, name_en: str(o.name_en, 80) }];
  });
}
/** วิธีนี้ต้องเลือกวัสดุของโลโก้ไหม (เช่น โลโก้หนัง) */
export const logoNeedsMaterial = (m: Choice | undefined) => m?.config?.needs_material === true;
/** สีโลโก้ที่ใช้บ่อย (ปุ่มลัดในป๊อปจุด · วิธีทำตั้งเองได้ที่ config.colors) */
export const LOGO_COLORS = ["ทอง", "เงิน", "ดำ", "ขาว", "นิกเกิล", "รมดำ", "ตามสีตัวกระเป๋า", "ตามสีอะไหล่"];
const LOGO_COLOR_EN: Record<string, string> = {
  "ทอง": "gold", "เงิน": "silver", "ดำ": "black", "ขาว": "white", "นิกเกิล": "nickel", "นิเกิ้ล": "nickel", "รมดำ": "gunmetal", "โรสโกลด์": "rose gold", "ทองแดง": "copper",
  "ตามสีตัวกระเป๋า": "tone-on-tone matching the bag body", "ตามสีอะไหล่": "matching the hardware finish",
};
/** สีโลโก้ภาษาอังกฤษ (prompt) — คำไทยที่ใช้บ่อย → อังกฤษ · "สีทอง" = "ทอง" · ไม่รู้จัก = คงคำเดิม */
export const logoColorEn = (c: string) => { const k = c.trim().replace(/^สี/, ""); return LOGO_COLOR_EN[k] ?? c.trim(); };
/** สีที่ให้เลือกของวิธีนี้ (config.colors) — ไม่ตั้ง = LOGO_COLORS */
export const logoColorsOf = (m: Choice | undefined): string[] => { const l = listOf(m?.config?.colors); return l.length ? l : LOGO_COLORS; };
/** โลโก้เป็นข้อความ — th = "Embossed · ฟอยล์ทอง · หนัง XX · สีทอง" · en = "Gold foil Embossed logo on XX in gold" (ใช้ใน prompt) */
export function logoText(p: Pick | null, choices: Choice[], lang: "th" | "en" = "th"): string {
  if (!p || p.kind !== "logo" || (!p.method && !p.color)) return "";
  const m = p.method ? choices.find((c) => c.list_key === "logo_method" && c.code === p.method) : undefined;
  const o = logoOptions(m).find((x) => x.code === p.option);
  if (lang === "th") return [p.method ? m?.name ?? p.method : "", o?.name, p.material ? `วัสดุ ${p.material.name || p.material.code}` : "", p.color ? `สี${p.color.replace(/^สี/, "")}` : ""].filter(Boolean).join(" · ");
  const method = m?.name_en?.trim() || m?.name || p.method;
  const base = p.method ? `${o ? `${o.name_en || o.name} ` : ""}${method} logo${p.material ? ` on ${p.material.name || p.material.code}` : ""}` : "logo";
  return `${base}${p.color ? ` in ${logoColorEn(p.color)}` : ""}`;
}
/** ขนาดเป็นข้อความ — th "4.5 × 2 ซม." · en "4.5 x 2 cm (1.8 x 0.8 in)" · ไม่มี = "" */
export function dimText(d: Dim | null | undefined, lang: "th" | "en" = "th"): string {
  if (!d) return "";
  const f = (n: number) => String(r2(n));
  return lang === "th" ? `${f(d.w)} × ${f(d.h)} ซม.` : `${f(d.w)} x ${f(d.h)} cm (${r1(d.w / 2.54)} x ${r1(d.h / 2.54)} in)`;
}
/** จำนวน/ความยาว/ขนาดของจุดเป็นข้อความ — th "4 ชิ้น · ยาว 28 ซม." · en "size …, 28 cm (11 in) long, quantity 4" · ไม่มี = "" */
export function pinExtraText(p: Pin, lang: "th" | "en" = "th"): string {
  const q = pinQty(p) > 1 ? pinQty(p) : 0;
  if (lang === "th") return [p.dim ? `ขนาด ${dimText(p.dim)}` : "", p.len ? `ยาว ${r1(p.len)} ซม.` : "", q ? `${q} ชิ้น` : ""].filter(Boolean).join(" · ");
  return [p.dim ? `size ${dimText(p.dim, "en")}` : "", p.len ? `${bothUnits(p.len)} long` : "", q ? `quantity ${q}` : ""].filter(Boolean).join(", ");
}
/**
 * ขนาดจากชื่อ SKU (รอบ 8 — "โลโก้แผ่นใหญ่ 4.5 x 2 cm." · "โลโก้เหล็ก 35 x 6 mm.") → ซม.
 * ไม่มีหน่วย = ซม. · mm/มม = ÷10 · นิ้ว/in = ×2.54 · หาไม่เจอ = null
 */
export function sizeFromName(name: string | null | undefined): Dim | null {
  const m = /(\d+(?:\.\d+)?)\s*(?:cm|ซม)?\.?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(mm|cm|ซม|มม|inch|in|นิ้ว)?/i.exec(String(name ?? ""));
  if (!m) return null;
  const u = (m[3] ?? "cm").toLowerCase();
  const k = u === "mm" || u === "มม" ? 0.1 : u === "in" || u === "inch" || u === "นิ้ว" ? 2.54 : 1;
  return cleanDim({ w: Number(m[1]) * k, h: Number(m[2]) * k });
}
/** กรอบขอบกระเป๋าบนรูปนี้ (จากพื้นหลังวาดช่องที่ใช้รูปเดียวกัน) + ขนาดจริง (ซม.) — ไม่มี/ยังไม่ใส่กว้าง-สูง = null */
export function frameForImage(spec: Spec, key: string | null | undefined): { frame: Frame; w: number; h: number } | null {
  if (!key || !(spec.size.w > 0 && spec.size.h > 0)) return null;
  const bg = PANELS.map((p) => spec.pocket_bg?.[p.key]).find((b) => b?.key === key);
  return bg ? { frame: bg.frame, w: spec.size.w, h: spec.size.h } : null;
}
/** กล่องโลโก้ขนาดจริงบนรูป (% ของรูป · กลางกล่อง = ตำแหน่งจุด) — ต้องมีขนาดโลโก้ + กรอบของรูปนั้น */
export function logoBoxPct(pin: Pin, fr: { frame: Frame; w: number; h: number } | null): { x: number; y: number; w: number; h: number } | null {
  if (!fr || !pin.dim) return null;
  const w = (pin.dim.w / fr.w) * fr.frame.w, h = (pin.dim.h / fr.h) * fr.frame.h;
  return { x: pin.x - w / 2, y: pin.y - h / 2, w, h };
}
export type LogoWarning = { pinIndex: number; tone: "warn" | "info"; text: string };
/**
 * คำเตือนโลโก้: ข้อความคงที่ของวิธี (config.warn) + เตือนเองเมื่อวัสดุของจุด "ตัวกระเป๋า" มีแท็กที่วิธีนี้ไม่เหมาะ (config.avoid_tags)
 * materialTags = แท็กของ SKU (จาก API bundle) · ไม่มีข้อมูลแท็ก = ข้ามการเตือนเอง
 */
export function logoWarnings(spec: Spec, choices: Choice[], materialTags: Record<string, string[] | undefined> = {}): LogoWarning[] {
  const bodyTags = new Set(spec.pins.filter((p) => p.cat === "body").flatMap((p) => { const id = skuIdOf(p.pick); return id ? materialTags[id] ?? [] : []; }).map((t) => t.toLowerCase()));
  return spec.pins.flatMap((p, i): LogoWarning[] => {
    if (p.pick?.kind !== "logo" || !p.pick.method) return [];
    const m = choices.find((c) => c.list_key === "logo_method" && c.code === (p.pick as { method?: string }).method);
    if (!m) return [];
    const out: LogoWarning[] = [];
    const bad = listOf(m.config?.avoid_tags).filter((t) => bodyTags.has(t.toLowerCase()));
    if (bad.length) out.push({ pinIndex: i, tone: "warn", text: `จุด ${i + 1} โลโก้ ${m.name} ไม่เหมาะกับวัสดุตัวกระเป๋า (${bad.join(", ")})` });
    const w = str(m.config?.warn, 200);
    if (w) out.push({ pinIndex: i, tone: "info", text: `จุด ${i + 1} ${m.name}: ${w}` });
    return out;
  });
}

export type RecipeCheck = { tone: "warn" | "info"; text: string; pinIndex?: number };
/**
 * ตรวจก่อนส่ง (รอบ 8) — โลโก้ (วิธี / แบบ / วัสดุ / ขนาด / ไฟล์) · ส่วนเสริมไม่มีรูป · ขนาดกระเป๋ายังไม่ครบ
 * วิธีที่ตั้ง config.no_artwork (เช่น โลโก้โลหะสำเร็จ — ใช้รูป SKU) ไม่ต้องมีไฟล์โลโก้
 */
export function recipeChecks(spec: Spec, choices: Choice[]): RecipeCheck[] {
  const out: RecipeCheck[] = [];
  spec.pins.forEach((p, i) => {
    if (!p.cat || sourceOf(categoryOf(choices, p.cat)) !== "logo") return;
    const lp = p.pick?.kind === "logo" ? p.pick : null;
    if (!lp) return;   // ยังไม่เลือกอะไรเลย = ตัวตรวจ "ยังไม่ได้เลือกของ" ของหน้าเตือนอยู่แล้ว
    const m = lp.method ? choices.find((c) => c.list_key === "logo_method" && c.code === lp.method) : undefined;
    const n = `จุด ${i + 1} โลโก้`;
    if (!lp.method) out.push({ tone: "info", pinIndex: i, text: `${n}ยังไม่เลือกวิธีทำ` });
    else {
      if (logoOptions(m).length && !lp.option) out.push({ tone: "info", pinIndex: i, text: `${n}ยังไม่เลือกแบบของ ${m?.name ?? lp.method}` });
      if (logoNeedsMaterial(m) && !lp.material) out.push({ tone: "warn", pinIndex: i, text: `${n} ${m?.name ?? lp.method} ยังไม่เลือกวัสดุ` });
    }
    if (!(p.dim && p.dim.w > 0 && p.dim.h > 0)) out.push({ tone: "info", pinIndex: i, text: `${n}ยังไม่ใส่ขนาด` });
    if (!lp.image_key && m?.config?.no_artwork !== true) out.push({ tone: "info", pinIndex: i, text: `${n}ยังไม่มีไฟล์โลโก้` });
  });
  for (const a of spec.accessories ?? []) if (!a.image_key) out.push({ tone: "info", text: `ส่วนเสริม ${a.name} ยังไม่มีรูป` });
  if (spec.pins.length && !sizeKnown(spec.size)) out.push({ tone: "info", text: "ยังไม่ใส่ขนาดกระเป๋า (กว้าง สูง หนา) ครบ — ทุน/ใบสั่งทำตัวอย่างยังคิดผ้าไม่ได้" });
  return out;
}

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
  push("หู", "จำนวนหู", handleCountText(hd(A.spec).count), handleCountText(hd(B.spec).count));
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

/**
 * รอบ 6: รูปจาก GPT = แกลเลอรีเดียว (ไม่แยกมุม) · ติดดาว = รูปที่ใช้ในใบสั่งทำตัวอย่าง / ส่งใบงาน / ปกการ์ด
 * ต่อชุดสี: มีรูปติดดาว = ใช้รูปติดดาวทั้งหมด (ใหม่ก่อน) · ไม่มีดาว = รูปล่าสุด 1 รูป
 * colorwayId: ส่งมา (null = สีหลัก) = เฉพาะชุดสีนั้น · ไม่ส่ง (undefined) = ทุกชุดสี (สีหลักก่อน)
 */
export type RenderLite = { id: string; image_key: string; colorway_id?: string | null; is_starred?: boolean | null; created_at: string };
export function chosenRenders<T extends RenderLite>(rows: T[], colorwayId?: string | null): T[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = r.colorway_id ?? "";
    if (colorwayId !== undefined && k !== (colorwayId ?? "")) continue;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const keys = [...groups.keys()].sort((a, b) => (a ? 1 : 0) - (b ? 1 : 0));
  return keys.flatMap((k) => {
    const g = [...groups.get(k)!].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const star = g.filter((r) => r.is_starred);
    return star.length ? star : g.slice(0, 1);
  });
}

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
    if (p.pick?.kind === "logo" && (p.pick.method || p.pick.color)) s += `, ${logoText(p.pick, choices, "en")}`;
    const ex = pinExtraText(p, "en"); if (ex) s += `, ${ex}`;
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

/** จำนวนหูเป็นคำ (ยังไม่ระบุ / ไม่มีหู / N หู) */
export const handleCountText = (n: number) => (n < 0 ? "ยังไม่ระบุ" : n === 0 ? "ไม่มีหู" : `${n} หู`);

/** หูใน prompt — ยังไม่ระบุ = "" (ไม่พูดถึง) · ใส่เฉพาะค่าที่ใส่ (> 0) ไม่เขียน "0 cm" */
export function handleText(h: Handle): string {
  if (h.count < 0) return "";
  if (h.count === 0) return "no top handles";
  const bits = [h.w > 0 ? `each ${bothUnits(h.w)} wide` : "", h.drop > 0 ? `rising ${bothUnits(h.drop)} above the bag opening` : "",
    h.gap > 0 ? `attached ${bothUnits(h.gap)} apart` : "", handleLength(h) > 0 ? `total handle length about ${bothUnits(handleLength(h))}` : ""].filter(Boolean);
  return `${h.count} top handle${h.count > 1 ? "s" : ""}${bits.length ? `, ${bits.join(", ")}` : ""}`;
}

/** ขนาดใน prompt — ใส่เฉพาะด้านที่ใส่ค่า เช่น "24.5 cm (9.6 in) wide x 15.5 cm (6.1 in) high" · ไม่ใส่เลย = "" */
export function sizePhrase(s: Size): string {
  return [s.w > 0 ? `${bothUnits(s.w)} wide` : "", s.h > 0 ? `${bothUnits(s.h)} high` : "", s.d > 0 ? `${bothUnits(s.d)} deep` : ""].filter(Boolean).join(" x ");
}

export function buildPrompts(tpl: { name: string; category?: string | null }, spec: Spec, choices: Choice[]): PromptSet[] {
  const { d, strap } = spec.size;
  const ctx = promptContext(tpl, spec, choices);   // คำบรรยายชุดเดียวกับคำแทน {กระเป๋า} ในแม่แบบทีม
  const sz = ctx["ขนาด"], base = ctx["กระเป๋า"];
  const ref = "Match the attached reference images exactly: numbers [ref N] match the numbered callouts in the attached PDF.";
  const extra: PromptSet[] = [
    { key: "line", title: "ลายเส้น (Vector)", hint: "อัปรูปที่ได้ที่ช่อง “ลายเส้น” แล้วกดตั้งเป็นรูป Vector ของแม่แบบ",
      text: `Clean technical line drawing of the same ${base} Front view only, same angle and proportions as the attached photo. Black outlines on a pure white background, no shading, no color, no texture, no text. Show seams, stitching lines, zipper, pockets and hardware as simple outlines.` },
    { key: "3d", title: "3D (เว็บแปลงรูปเป็นโมเดล)", hint: "ใช้กับเว็บแปลงรูปเป็น 3D (เช่น Meshy, Tripo) — ได้ทรงไว้ดู ขนาดไม่แม่น · ทำแพทเทิร์นจริงใช้ปุ่ม “ส่งเข้าสตูดิโอแพทเทิร์น”",
      text: `Create a 3D model of this ${base} ${sz ? `Real-world scale: ${sz}. ` : ""}Single watertight object, handles attached, closed bottom, realistic materials matching the reference images, neutral lighting, no background, export as GLB.` },
  ];
  return [
    { key: "grid4", title: "4 มุมรวมรูปเดียว (หน้า · หลัง · ข้าง · เอียง)",
      text: `Create ONE image arranged as a 2x2 grid showing the SAME ${base} Top-left: front view. Top-right: back view. Bottom-left: side view${d > 0 ? ` showing the ${bothUnits(d)} gusset` : ""}. Bottom-right: three-quarter view. ${ref} Plain white background, soft studio light, photorealistic, identical color and texture in all 4 views, no text.` },
    { key: "inside", title: "ข้างใน",
      text: `Photorealistic top-down photo looking inside the open ${base} Inside pockets: ${pocketsText(spec, choices, true)}. Show the lining clearly. ${ref} Plain white background, soft light, no text.` },
    { key: "model", title: "คนสะพาย",
      text: `Lifestyle photo of a Thai female model wearing the ${base}${strap > 0 ? ` Carried with the long shoulder strap, ${bothUnits(strap)} long.` : spec.handle.count > 0 ? " Carried on the shoulder by the handle." : " Holding the bag naturally."} Neutral outfit, clean minimal backdrop, natural light, the bag clearly visible and true to the reference images.` },
    ...extra,
  ];
}


// ─── Prompt รอบ 6: เปิด/ปิด · แก้ · เพิ่ม · แม่แบบของทีม ─────────────────────────
/**
 * เจ้าของเลือก 2026-11-14: สวิตช์ = ค่าเริ่มของทีม + ปรับต่อสูตร · เพิ่มได้ทั้งในสูตร + แม่แบบ prompt ของทีม (ใส่คำแทน {ขนาด} ฯลฯ)
 *   ทีม = ตัวเลือกรายการ "prompt" (⚙️ ตัวเลือก): code = คีย์ prompt ระบบ (grid4/inside/model/line/3d) + config.default_on → เปิด/ปิดตั้งต้น
 *         หรือแม่แบบทีม config.text (+ default_on) → key "team:<code>"
 *   สูตร = spec.prompts: on (ปรับสวิตช์ทับค่าทีม) · edits (ข้อความที่แก้เอง + base = ข้อความระบบตอนแก้ → เตือนเมื่อสูตรเปลี่ยน) · custom (prompt ของสูตร key "own:<id>")
 *   ใบสรุป PDF พิมพ์เฉพาะที่เปิด
 */
export const PROMPT_SYSTEM_KEYS = ["grid4", "inside", "model", "line", "3d"] as const;
export type RecipePrompts = { on: Record<string, boolean>; edits: Record<string, { text: string; base: string }>; custom: { id: string; title: string; text: string }[] };
export const EMPTY_PROMPTS: RecipePrompts = { on: {}, edits: {}, custom: [] };
const PKEY = /^(grid4|inside|model|line|3d|team:[A-Za-z0-9_-]{1,40}|own:[A-Za-z0-9_-]{1,40})$/;
export const MAX_CUSTOM_PROMPTS = 10;
export function cleanPrompts(v: unknown): RecipePrompts {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const on: Record<string, boolean> = {};
  for (const [k, val] of Object.entries((o.on && typeof o.on === "object" ? o.on : {}) as Record<string, unknown>).slice(0, 60)) if (PKEY.test(k) && typeof val === "boolean") on[k] = val;
  const edits: RecipePrompts["edits"] = {};
  for (const [k, val] of Object.entries((o.edits && typeof o.edits === "object" ? o.edits : {}) as Record<string, unknown>).slice(0, 30)) {
    const e = (val ?? {}) as Record<string, unknown>;
    const text = str(e.text, 4000);
    if (PKEY.test(k) && !k.startsWith("own:") && text) edits[k] = { text, base: typeof e.base === "string" ? e.base.slice(0, 4000) : "" };
  }
  const seen = new Set<string>();
  const custom = (Array.isArray(o.custom) ? o.custom : []).slice(0, MAX_CUSTOM_PROMPTS).flatMap((c) => {
    const q = (c ?? {}) as Record<string, unknown>;
    const id = idOf(q.id), text = str(q.text, 4000);
    if (!text || seen.has(id)) return [];
    seen.add(id);
    return [{ id, title: str(q.title, 80) || "Prompt ของสูตร", text }];
  });
  return { on, edits, custom };
}

/** คำแทนที่ใส่ในแม่แบบ prompt ได้ — ระบบเติมค่าของสูตร (ชุดสีที่ดูอยู่) ให้ */
export const PROMPT_VARS: { key: string; label: string }[] = [
  { key: "กระเป๋า", label: "คำบรรยายกระเป๋าเต็ม (ชนิด ขนาด หู วัสดุ ช่องนอก)" },
  { key: "ประเภท", label: "ชนิดกระเป๋าภาษาอังกฤษ" }, { key: "ชื่อแม่แบบ", label: "ชื่อแม่แบบ" },
  { key: "ขนาด", label: "ขนาดที่ใส่ไว้ (2 หน่วย)" }, { key: "หู", label: "หูกระเป๋า" },
  { key: "วัสดุ", label: "วัสดุทุกจุด + เลข [ref N]" }, { key: "สีอะไหล่", label: "สีอะไหล่ทั้งใบ" },
  { key: "ช่องนอก", label: "ช่องด้านนอก" }, { key: "ช่องใน", label: "ช่องข้างใน" },
  { key: "อ้างอิง", label: "ประโยคให้ GPT ดูรูปเส้นชี้" },
  { key: "ส่วนเสริม", label: "ส่วนเสริม (พวงกุญแจ ชาร์ม ฯลฯ)" },
];
/** ส่วนเสริมเป็นประโยคอังกฤษ — "keychain (KC-01), wrist strap" · ไม่มี = "" */
export function accessoriesText(spec: Spec): string {
  return (spec.accessories ?? []).map((a) => `${pinQty(a) > 1 ? `${pinQty(a)} x ` : ""}${a.name_en || a.name}${a.sku_code ? ` (${a.sku_code})` : ""}${a.note ? ` - ${a.note}` : ""}`).join(", ");
}
export type PromptCtx = Record<string, string>;
export function promptContext(tpl: { name: string; category?: string | null }, spec: Spec, choices: Choice[]): PromptCtx {
  const hw = choices.find((c) => c.list_key === "hw_color" && c.code === spec.hw_color);
  const sz = sizePhrase(spec.size), ht = handleText(spec.handle), strap = spec.size.strap;
  const bag = [`${bagWord(tpl, choices)} (${tpl.name})`, sz, ht, strap > 0 ? `plus a long shoulder strap ${bothUnits(strap)}` : ""].filter(Boolean).join(", ");
  const parts = partsText(spec, choices);
  const hwText = hw ? en(hw, hw.name) : "";
  const acc = accessoriesText(spec);
  return {
    "กระเป๋า": `${bag}. ${parts ? parts + "." : ""}${hw ? ` All metal hardware in ${hwText} finish.` : ""} Outer pockets: ${pocketsText(spec, choices, false)}.${acc ? ` Accessories attached: ${acc}.` : ""}`,
    "ส่วนเสริม": acc,
    "ประเภท": bagWord(tpl, choices), "ชื่อแม่แบบ": tpl.name, "ขนาด": sz, "หู": ht, "วัสดุ": parts, "สีอะไหล่": hwText,
    "ช่องนอก": pocketsText(spec, choices, false), "ช่องใน": pocketsText(spec, choices, true),
    "อ้างอิง": "Match the attached reference images exactly: numbers [ref N] match the numbered callouts in the attached PDF.",
  };
}
/** แทนคำ {ขนาด} ฯลฯ ด้วยค่าของสูตร · คำที่ไม่รู้จักคงไว้ตามเดิม */
export const fillPromptVars = (text: string, ctx: PromptCtx) => text.replace(/\{([^{}\n]{1,20})\}/g, (m, k: string) => (k.trim() in ctx ? ctx[k.trim()] : m));

/** ค่าของทีมจากตัวเลือกรายการ "prompt" */
export function teamPromptSettings(choices: Choice[]) {
  const rows = choices.filter((c) => c.list_key === "prompt" && c.is_active !== false).sort((a, b) => a.sort_order - b.sort_order);
  const sys = new Set<string>(PROMPT_SYSTEM_KEYS);
  const defaults: Record<string, boolean> = {};
  const templates: { key: string; title: string; text: string; defaultOn: boolean }[] = [];
  for (const r of rows) {
    const text = typeof r.config?.text === "string" ? r.config.text.trim() : "";
    const on = r.config?.default_on !== false;
    if (sys.has(r.code) && !text) defaults[r.code] = on;
    else if (text) templates.push({ key: `team:${r.code}`, title: r.name || r.code, text, defaultOn: on });
  }
  return { defaults, templates };
}

export type ResolvedPrompt = {
  key: string; title: string; text: string; hint?: string; source: "system" | "team" | "recipe";
  on: boolean; edited: boolean; stale: boolean; generated: string;
};
/** prompt ทั้งหมดของสูตร (ระบบ + ทีม + ของสูตร) พร้อมสวิตช์ / ข้อความที่แก้ / เตือนข้อความไม่ตรงสูตร */
export function resolvePrompts(tpl: { name: string; category?: string | null }, spec: Spec, choices: Choice[]): ResolvedPrompt[] {
  const ctx = promptContext(tpl, spec, choices);
  const team = teamPromptSettings(choices);
  const P = spec.prompts ?? EMPTY_PROMPTS;
  const out = (key: string, title: string, generated: string, source: ResolvedPrompt["source"], defOn: boolean, hint?: string): ResolvedPrompt => {
    const e = source === "recipe" ? undefined : P.edits[key];
    return { key, title, hint, source, generated, text: e ? e.text : generated, edited: !!e, stale: !!e && e.base !== generated, on: P.on[key] ?? defOn };
  };
  return [
    ...buildPrompts(tpl, spec, choices).map((p) => out(p.key, p.title, p.text, "system", team.defaults[p.key] ?? true, p.hint)),
    ...team.templates.map((t) => out(t.key, t.title, fillPromptVars(t.text, ctx), "team", t.defaultOn)),
    ...P.custom.map((c) => out(`own:${c.id}`, c.title, fillPromptVars(c.text, ctx), "recipe", true)),
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
  if (p.kind === "logo" && !p.image_key && p.material?.image_key) return box(`<image href="${esc(img(p.material.image_key, 400))}" x="4" y="4" width="92" height="92" preserveAspectRatio="xMidYMid slice" opacity=".55"/><text x="50" y="56" text-anchor="middle" font-size="13" font-weight="700" fill="#333">LOGO</text>`);
  if (p.kind === "logo" && !p.image_key) return box(`<text x="50" y="56" text-anchor="middle" font-size="13" font-weight="700" fill="#888">LOGO</text>`);
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
  /** แท็กของ SKU (เตือนโลโก้ไม่เหมาะกับวัสดุ) — ไม่ส่ง = ข้ามการเตือนเอง */
  materialTags?: Record<string, string[] | undefined>;
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

/**
 * ภาพเส้นชี้: รูปกระเป๋ากลาง + การ์ดรูปชิ้นส่วนซ้าย/ขวา (รูปใหญ่ให้ GPT เห็นชัด)
 * รอบ 8: view = มุมเพิ่ม (โชว์เฉพาะจุดของมุมนั้น · เลขจุดเท่าเดิมทั้งสูตร) · ส่วนเสริมที่ปักบนรูป = ป้าย A1, A2
 */
export function calloutSvg(b: BriefInput, view?: ViewImage | null): string {
  const { spec, template: t } = b;
  const key = view ? view.image_key : b.useVector && t.vector_image_key ? t.vector_image_key : t.image_key;
  const iw = (view ? view.w : t.image_w) || 1000, ih = (view ? view.h : t.image_h) || 1000;
  const vid = view?.id ?? "";
  const W = 1000, CARD = 120, GAP = 18, IMG_W = 520, IMG_X = (W - IMG_W) / 2;
  const imgH = IMG_W * (ih / iw);
  const L: number[] = [], R: number[] = [];
  const mine = spec.pins.map((p, i) => ((p.view ?? "") === vid ? i : -1)).filter((i) => i >= 0);
  mine.forEach((i) => (spec.pins[i].x < 50 ? L : R).push(i));
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
  mine.forEach((i) => {
    const p = spec.pins[i];
    const px = IMG_X + (p.x / 100) * IMG_W, py = imgY + (p.y / 100) * imgH;
    s += `<circle cx="${px}" cy="${py}" r="14" fill="#EF9F27" stroke="#412402" stroke-width="1.5"/><text x="${px}" y="${py + 5}" text-anchor="middle" font-size="14" fill="#412402">${i + 1}</text>`;
  });
  (spec.accessories ?? []).forEach((a, k) => {
    if (!a.pos || (a.pos.view ?? "") !== vid) return;
    const px = IMG_X + (a.pos.x / 100) * IMG_W, py = imgY + (a.pos.y / 100) * imgH;
    s += `<rect x="${px - 17}" y="${py - 12}" width="34" height="24" rx="6" fill="#7F77DD" stroke="#26215C" stroke-width="1.5"/><text x="${px}" y="${py + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="#fff">${accessoryLabel(k)}</text>`;
  });
  if (view) s += `<text x="${IMG_X + 6}" y="${imgY + 20}" font-size="15" font-weight="600" fill="#26215C" stroke="#fff" stroke-width="4" paint-order="stroke">มุม: ${esc(view.label)}</text>`;
  return s + "</svg>";
}

/** รูปช่องของ 1 ฝั่ง (กรอบกระเป๋า + กล่องช่องทุกกล่อง + ขนาด) */
export function pocketPanelSvg(spec: Spec, panel: PanelKey, choices: Choice[]): string {
  const P = panelSize(spec.size), W = P.w, H = P.h;
  const s = Math.min(200 / W, 220 / H), ox = (240 - W * s) / 2, oy = 22;
  let g = `<svg viewBox="0 0 240 ${oy + H * s + 10}" width="100%" xmlns="http://www.w3.org/2000/svg"><rect x="${ox}" y="${oy}" width="${W * s}" height="${H * s}" fill="#f4efe4" stroke="#999"/>`;
  g += `<text x="120" y="14" text-anchor="middle" font-size="11" fill="#555">${esc(PANELS.find((p) => p.key === panel)?.label ?? panel)} · ${P.placeholder ? "ยังไม่ใส่ขนาด (กรอบตัวอย่าง)" : `${W}×${H} ซม.`}</text>`;
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
  const prompts = resolvePrompts(t, spec, b.choices).filter((p) => p.on);   // รอบ 6: พิมพ์เฉพาะ prompt ที่เปิด
  const warn = [...rules.map((x) => `กฎทีม: ${x.reason}`), ...st.out.map((x) => `จุด ${x.pinIndex + 1} ${x.code} หมดสต็อก`), ...st.low.map((x) => `จุด ${x.pinIndex + 1} ${x.code} เหลือน้อย (${x.onHand})`),
    ...logoWarnings(spec, b.choices, b.materialTags).map((x) => x.text)];
  const acc = spec.accessories ?? [];
  const rows = spec.pins.map((p, i) => {
    const cat = categoryOf(b.choices, p.cat);
    const info = pickInfo(p.pick, { bodyPick: body });
    const sid = skuIdOf(p.pick);
    const stock = sid && sid in b.stock ? (b.stock[sid] <= 0 ? `<span style="color:#A32D2D">หมด</span>` : b.stock[sid] < 10 ? `<span style="color:#854F0B">เหลือ ${b.stock[sid]}</span>` : `มี ${b.stock[sid].toLocaleString("th-TH")}`) : "—";
    return `<tr><td>${i + 1}</td><td>${esc(cat?.name ?? p.cat)}</td><td>${pickThumbSvg(p.pick, `width="56" height="56"`, b.img, { bodyPick: body, hwHex: hw?.hex, isHw: usesHwColor(cat) })}</td>
      <td><b>${esc(info.code)}</b> ${esc(info.name)}${usesHwColor(cat) && hw ? ` · สี${esc(hw.name)}` : ""}${p.pick?.kind === "color" && p.pick.hex ? ` · ${esc(p.pick.hex)}` : ""}${p.pick?.kind === "logo" && (p.pick.method || p.pick.color) ? `<br><span style="color:#534AB7">${esc(logoText(p.pick, b.choices))}</span>` : ""}${pinExtraText(p) ? `<br><span style="color:#555">${esc(pinExtraText(p))}</span>` : ""}${p.view ? `<br><span style="color:#888">มุม: ${esc(spec.views.find((v) => v.id === p.view)?.label ?? "")}</span>` : ""}</td><td>${esc(p.note)}</td><td>${stock}</td></tr>`;
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
  ${viewsCalloutHtml(b)}
  <div class="kv"><div>ขนาด (กว้าง×สูง×หนา)<b>${[spec.size.w, spec.size.h, spec.size.d].map((v) => (v > 0 ? v : "—")).join("×")} ซม.</b><span class="in">${[spec.size.w, spec.size.h, spec.size.d].map((v) => (v > 0 ? inch(v) : "—")).join("×")} นิ้ว</span></div>
  <div>สายยาว<b>${spec.size.strap > 0 ? `${spec.size.strap} ซม.` : "ไม่มี"}</b>${spec.size.strap > 0 ? `<span class="in">${inch(spec.size.strap)} นิ้ว</span>` : ""}</div>
  <div>สีอะไหล่ทั้งใบ<b>${esc(hw?.name ?? "—")}</b></div><div>จำนวนจุด<b>${spec.pins.length} จุด</b></div></div>
  <div class="kv" style="grid-template-columns:repeat(5,1fr)">${spec.handle.count > 0 ? (() => { const cm = (v: number) => (v > 0 ? `${v} ซม.` : "—"), ic = (v: number) => (v > 0 ? `${inch(v)} นิ้ว` : ""); const L = handleLength(spec.handle); return [
    ["จำนวนหู", `${spec.handle.count} หู`, ""], ["ความสูงหู", cm(spec.handle.drop), ic(spec.handle.drop)], ["ความกว้างหู", cm(spec.handle.w), ic(spec.handle.w)],
    ["ระยะห่างหู", cm(spec.handle.gap), ic(spec.handle.gap)], [spec.handle.total > 0 ? "ความยาวรวมหู" : "ความยาวรวมหู (ประมาณ)", cm(L), ic(L)],
  ].map(([a, v, i]) => `<div>${a}<b>${v}</b>${i ? `<span class="in">${i}</span>` : ""}</div>`).join(""); })() : `<div>หูกระเป๋า<b>${handleCountText(spec.handle.count)}</b></div>`}</div>
  ${warn.length ? `<div class="warn">${warn.map(esc).join("<br>")}</div>` : ""}
  ${r.note ? `<div style="margin-top:6px">หมายเหตุ: ${esc(r.note)}</div>` : ""}
  <h4>ตารางสรุป</h4><table><tr><th style="width:5%">#</th><th style="width:14%">หมวด</th><th style="width:12%">รูป</th><th>รหัส · ชื่อ</th><th style="width:24%">โน้ต</th><th style="width:11%">สต็อก</th></tr>${rows || `<tr><td colspan="6" style="color:#999">ยังไม่มีจุด</td></tr>`}</table>
  ${b.baseSpec ? colorwayTableHtml(b.baseSpec, b.choices, b.img) : ""}
  ${(spec.refs ?? []).length ? `<h4>รูปอ้างอิง</h4><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${spec.refs.map((x) => `<div style="aspect-ratio:1/1;background:#f6f4ef;border-radius:4px;overflow:hidden"><img src="${esc(b.img(x.image_key, 400))}" style="width:100%;height:100%;object-fit:contain"></div>`).join("")}</div>` : ""}
  ${acc.length ? `<h4>ส่วนเสริม</h4><table><tr><th style="width:6%">ป้าย</th><th style="width:12%">รูป</th><th>ชื่อ</th><th style="width:14%">กลุ่ม</th><th style="width:8%">จำนวน</th><th style="width:26%">โน้ต</th></tr>${acc.map((a, k) => `<tr><td>${a.pos ? `<b style="color:#534AB7">${accessoryLabel(k)}</b>` : "—"}</td><td>${a.image_key ? `<img src="${esc(b.img(a.image_key, 200))}" style="width:48px;height:48px;object-fit:contain;border-radius:4px;background:#f6f4ef">` : "—"}</td><td><b>${esc(a.sku_code || a.code)}</b> ${esc(a.name)}</td><td>${esc(a.group)}</td><td>${pinQty(a)}</td><td>${esc(a.note)}</td></tr>`).join("")}</table>` : ""}
  <h4>ช่อง</h4><div class="pks">${pocketCells}</div>
  <h4>Prompt สำหรับ GPT (แนบรูปเส้นชี้หน้านี้ไปด้วย · เลข [ref N] = เลขจุด)</h4>
  ${prompts.map((p, i) => `<div class="pr"><b>${i + 1}) ${esc(p.title)}</b><div>${esc(p.text)}</div></div>`).join("")}
  </div></body></html>`;
}

/** ภาพเส้นชี้ของมุมเพิ่ม (รอบ 8) — เฉพาะมุมที่มีจุดหรือส่วนเสริมปักอยู่ */
export function viewsCalloutHtml(b: BriefInput): string {
  const { spec } = b;
  return (spec.views ?? []).filter((v) => spec.pins.some((p) => p.view === v.id) || (spec.accessories ?? []).some((a) => a.pos?.view === v.id))
    .map((v) => `<div class="callout">${calloutSvg(b, v)}</div>`).join("");
}

// ─── จุด: คัดลอก / วาง / ทำซ้ำ / ขยับ (รอบ 7 · เจ้าของขอ 2026-11-14) ────────────────────
/** ป้ายข้อความในคลิปบอร์ด — วางข้ามสูตร/ข้ามแท็บได้ (อ่านจาก paste event ไม่ต้องขอสิทธิ์อ่านคลิปบอร์ด) */
export const PIN_CLIP_TAG = "dl-pin/v1";
export type PinCopy = Omit<Pin, "id">;

/** จุด → ข้อความเก็บในคลิปบอร์ด (หมวด + ของที่เลือก + โน้ต + ตำแหน่ง) */
export function pinToClipboard(p: Pin | PinCopy): string {
  return JSON.stringify({ t: PIN_CLIP_TAG, x: p.x, y: p.y, cat: p.cat, pick: p.pick, note: p.note, qty: p.qty, len: p.len, dim: p.dim });
}
/** หลายจุด → คลิปบอร์ด (รอบ 8) · 1 จุด = รูปแบบเดิม */
export function pinsToClipboard(pins: (Pin | PinCopy)[]): string {
  if (pins.length === 1) return pinToClipboard(pins[0]);
  return JSON.stringify({ t: PIN_CLIP_TAG, pins: pins.map((p) => ({ x: p.x, y: p.y, cat: p.cat, pick: p.pick, note: p.note, qty: p.qty, len: p.len, dim: p.dim })) });
}
const pinCopyOf = (o: Record<string, unknown>): PinCopy => ({ x: r1(clamp(num(o.x), 0, 100)), y: r1(clamp(num(o.y), 0, 100)), cat: str(o.cat, 40), pick: cleanPick(o.pick), note: str(o.note, 300), ...pinExtras(o, new Set()) });
/** ข้อความในคลิปบอร์ด → จุดทั้งหมด (1 จุดหรือหลายจุด) · ไม่ใช่ของเรา / เสีย = [] */
export function pinsFromClipboard(text: string | null | undefined): PinCopy[] {
  if (!text || text.length > 400000 || !text.includes(PIN_CLIP_TAG)) return [];
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (!o || o.t !== PIN_CLIP_TAG) return [];
    if (Array.isArray(o.pins)) return o.pins.slice(0, MAX_PINS).filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map(pinCopyOf);
    return [pinCopyOf(o)];
  } catch { return []; }
}

/** ข้อความในคลิปบอร์ด → จุด (ไม่ใช่ของเรา / เสีย = null) · ผ่านตัวทำความสะอาดเดียวกับตอนบันทึก */
export function pinFromClipboard(text: string | null | undefined): PinCopy | null {
  if (!text || text.length > 20000 || !text.includes(PIN_CLIP_TAG)) return null;
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (!o || o.t !== PIN_CLIP_TAG || Array.isArray(o.pins)) return null;
    return pinCopyOf(o);
  } catch { return null; }
}

/** ขยับตำแหน่งจุด (หน่วย % ของรูป) ให้อยู่ในรูปเสมอ */
export function nudgePos(x: number, y: number, dx: number, dy: number): { x: number; y: number } {
  return { x: r1(clamp(x + dx, 0, 100)), y: r1(clamp(y + dy, 0, 100)) };
}

/** วางหลายจุด: ย้ายทั้งกลุ่มให้จุดแรกอยู่ที่ at (ระยะห่างระหว่างจุดคงเดิม · บีบให้อยู่ในรูป) */
export function placeGroup<T extends { x: number; y: number }>(pins: T[], at: { x: number; y: number }): T[] {
  if (!pins.length) return pins;
  const dx = at.x - pins[0].x, dy = at.y - pins[0].y;
  return pins.map((p) => ({ ...p, ...nudgePos(p.x, p.y, dx, dy) }));
}

/** ตำแหน่งวางจุดซ้ำ — เลื่อนเฉียงลงขวา 3% · ชนขอบ = เลื่อนกลับทางซ้าย/บน */
export function offsetPos(x: number, y: number, step = 3): { x: number; y: number } {
  return { x: r1(x + step > 100 ? x - step : x + step), y: r1(y + step > 100 ? y - step : y + step) };
}
