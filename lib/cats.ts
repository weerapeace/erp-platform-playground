/**
 * 🐾 ทะเบียนแมว — กติกากลางที่เดียว (pure · ใช้ได้ทั้ง API และหน้าเว็บ)
 *   - ชนิดข้อมูล 5 ชนิด (CAT_KINDS): แมว · คลินิก · วัคซีน · ยาถ่ายพยาธิ/หยดกันเห็บหมัด · น้ำหนัก
 *   - cleanCatBody = ตรวจ/ทำความสะอาดค่าที่ส่งมา (API ใช้ตัวนี้ตัวเดียว)
 *   - dueItems = รายการ "ใกล้ถึงกำหนด" (นับเฉพาะเข็ม/ยาครั้งล่าสุดของแต่ละชื่อ ต่อแมว)
 *   - doneAgain = ปุ่ม "ฉีดแล้ว / ให้ยาแล้ว" กดเดียว → ค่าบันทึกใหม่ (วันนี้ + วันนัดถัดไปตามรอบเดิม)
 * ตาราง: cats · cat_clinics · cat_vaccinations · cat_treatments · cat_weights (migration 202612250600)
 * คู่มือ: docs/cat-registry.md
 */
import { addDaysYmd } from "@/lib/date";

export const CATS_VIEW = "cats.view";
export const CATS_EDIT = "cats.edit";
export const CATS_ENTITY_PREFIX = "cats";

export type CatKind = "cats" | "clinics" | "vaccinations" | "treatments" | "weights" | "supplies" | "purchases" | "vet_visits" | "expenses";

type FieldType = "text" | "longtext" | "date" | "bool" | "money" | "int" | "kg" | "num" | "uuid" | "uuids" | "enum" | "datetime";
type FieldSpec = { type: FieldType; label: string; required?: boolean; max?: number; options?: readonly string[]; min?: number; maxNum?: number };

export const CAT_KINDS: Record<CatKind, { table: string; label: string; nameField: string; fields: Record<string, FieldSpec>; order: string }> = {
  cats: {
    table: "cats", label: "แมว", nameField: "name", order: "sort_order",
    fields: {
      name: { type: "text", label: "ชื่อ", required: true, max: 60 },
      photo_r2_key: { type: "text", label: "รูป", max: 300 },
      sex: { type: "enum", label: "เพศ", options: ["male", "female"] },
      birth_date: { type: "date", label: "วันเกิด" },
      adopted_date: { type: "date", label: "วันรับเลี้ยง" },
      breed: { type: "text", label: "สายพันธุ์", max: 80 },
      color: { type: "text", label: "สี", max: 80 },
      neutered: { type: "bool", label: "ทำหมันแล้ว" },
      microchip: { type: "text", label: "เลขไมโครชิป", max: 40 },
      note: { type: "longtext", label: "หมายเหตุ", max: 2000 },
      sort_order: { type: "int", label: "ลำดับ", min: 0, maxNum: 9999 },
    },
  },
  clinics: {
    table: "cat_clinics", label: "คลินิก", nameField: "name", order: "name",
    fields: {
      name: { type: "text", label: "ชื่อคลินิก", required: true, max: 120 },
      phone: { type: "text", label: "เบอร์โทร", max: 40 },
      address: { type: "longtext", label: "ที่อยู่", max: 500 },
      map_url: { type: "text", label: "ลิงก์แผนที่", max: 500 },
      is_24h: { type: "bool", label: "ฉุกเฉิน 24 ชม." },
      note: { type: "longtext", label: "หมายเหตุ", max: 1000 },
    },
  },
  vaccinations: {
    table: "cat_vaccinations", label: "วัคซีน", nameField: "vaccine_name", order: "date_given",
    fields: {
      cat_id: { type: "uuid", label: "แมว", required: true },
      vaccine_name: { type: "text", label: "ชื่อวัคซีน", required: true, max: 120 },
      date_given: { type: "date", label: "วันที่ฉีด", required: true },
      clinic_id: { type: "uuid", label: "คลินิก" },
      next_due_date: { type: "date", label: "วันนัดครั้งถัดไป" },
      cost: { type: "money", label: "ค่าใช้จ่าย" },
      note: { type: "longtext", label: "หมายเหตุ", max: 1000 },
    },
  },
  treatments: {
    table: "cat_treatments", label: "ยา", nameField: "product", order: "date_given",
    fields: {
      cat_id: { type: "uuid", label: "แมว", required: true },
      type: { type: "enum", label: "ชนิด", required: true, options: ["deworm", "flea"] },
      product: { type: "text", label: "ชื่อยา", required: true, max: 120 },
      date_given: { type: "date", label: "วันที่ให้", required: true },
      interval_days: { type: "int", label: "รอบ (วัน)", min: 1, maxNum: 730 },
      next_due_date: { type: "date", label: "ครบกำหนดครั้งถัดไป" },
      cost: { type: "money", label: "ค่าใช้จ่าย" },
      note: { type: "longtext", label: "หมายเหตุ", max: 1000 },
    },
  },
  weights: {
    table: "cat_weights", label: "น้ำหนัก", nameField: "weight_kg", order: "date",
    fields: {
      cat_id: { type: "uuid", label: "แมว", required: true },
      date: { type: "date", label: "วันที่ชั่ง", required: true },
      weight_kg: { type: "kg", label: "น้ำหนัก (กก.)", required: true },
      note: { type: "longtext", label: "หมายเหตุ", max: 500 },
    },
  },
  // ─── รอบ 2: อาหาร / ทราย / สต็อก (กติกาคำนวณ = lib/cats-supplies.ts) ───
  supplies: {
    table: "cat_supplies", label: "อาหาร/ทราย", nameField: "brand", order: "sort_order",
    fields: {
      type: { type: "enum", label: "ชนิด", required: true, options: ["dry_food", "wet_food", "litter"] },
      wet_kind: { type: "enum", label: "ชนิดอาหารเปียก", options: ["gravy", "jelly"] },
      brand: { type: "text", label: "ยี่ห้อ", required: true, max: 80 },
      flavor: { type: "text", label: "รสชาติ / รุ่น", max: 120 },
      unit: { type: "enum", label: "หน่วย", options: ["bag", "pouch", "can"] },
      pack_size: { type: "num", label: "ขนาดถุง", min: 0.01, maxNum: 100000 },
      pack_size_unit: { type: "enum", label: "หน่วยขนาดถุง", options: ["g", "kg", "L"] },
      unit_size_g: { type: "num", label: "กรัมต่อชิ้น", min: 0.01, maxNum: 10000 },
      units_per_pack: { type: "int", label: "ชิ้นต่อแพ็ค", min: 1, maxNum: 500 },
      price: { type: "money", label: "ราคา" },
      price_per: { type: "enum", label: "ราคานี้คิดต่อ", options: ["piece", "pack"] },
      daily_g: { type: "num", label: "กรัมต่อวัน", min: 0, maxNum: 100000 },
      pack_lasts_days: { type: "num", label: "1 ถุงใช้ได้กี่วัน", min: 0.1, maxNum: 3650 },
      stock_base_qty: { type: "num", label: "จำนวนคงเหลือ", min: 0, maxNum: 100000 },
      stock_base_at: { type: "datetime", label: "นับสต็อกเมื่อ" },
      shop_url: { type: "text", label: "ลิงก์ร้าน", max: 1000 },
      shop_name: { type: "text", label: "ชื่อร้าน", max: 80 },
      cat_ids: { type: "uuids", label: "แมวที่กิน" },
      note: { type: "longtext", label: "หมายเหตุ", max: 1000 },
      sort_order: { type: "int", label: "ลำดับ", min: 0, maxNum: 9999 },
    },
  },
  purchases: {
    table: "cat_purchases", label: "ซื้อเข้า", nameField: "qty", order: "date",
    fields: {
      supply_id: { type: "uuid", label: "ของที่ซื้อ", required: true },
      date: { type: "date", label: "วันที่ซื้อ", required: true },
      qty: { type: "num", label: "จำนวน", required: true, min: 0.01, maxNum: 100000 },
      packs: { type: "num", label: "จำนวนแพ็ค", min: 0.01, maxNum: 10000 },
      price_paid: { type: "money", label: "จ่ายไป" },
      shop_name: { type: "text", label: "ซื้อจากร้าน", max: 80 },
      note: { type: "longtext", label: "หมายเหตุ", max: 500 },
    },
  },
  // ─── รอบ 3: หาหมอ / ค่าใช้จ่ายอื่น (สรุป = lib/cats-costs.ts) ───
  vet_visits: {
    table: "cat_vet_visits", label: "การหาหมอ", nameField: "diagnosis", order: "date",
    fields: {
      cat_id: { type: "uuid", label: "แมว", required: true },
      date: { type: "date", label: "วันที่", required: true },
      clinic_id: { type: "uuid", label: "คลินิก" },
      symptoms: { type: "longtext", label: "อาการ", max: 2000 },
      diagnosis: { type: "longtext", label: "การวินิจฉัย", max: 2000 },
      medicines: { type: "longtext", label: "ยาที่ได้", max: 2000 },
      cost: { type: "money", label: "ค่ารักษา" },
      receipt_r2_key: { type: "text", label: "รูปใบเสร็จ", max: 300 },
      note: { type: "longtext", label: "หมายเหตุ", max: 1000 },
    },
  },
  expenses: {
    table: "cat_expenses", label: "ค่าใช้จ่าย", nameField: "note", order: "date",
    fields: {
      cat_id: { type: "uuid", label: "แมว" },
      category: { type: "enum", label: "หมวด", required: true, options: ["snack", "toy", "grooming", "vet", "other"] },
      date: { type: "date", label: "วันที่", required: true },
      amount: { type: "money", label: "จำนวนเงิน", required: true },
      note: { type: "longtext", label: "รายละเอียด", max: 500 },
    },
  },
};

export const isCatKind = (k: string): k is CatKind => k in CAT_KINDS;
export const TREATMENT_LABEL: Record<"deworm" | "flea", string> = { deworm: "ยาถ่ายพยาธิ", flea: "ยาหยดกันเห็บหมัด" };
export const SEX_LABEL: Record<"male" | "female", string> = { male: "ผู้", female: "เมีย" };
/** รอบที่ใช้บ่อย (ปุ่มลัดในฟอร์มยา) */
export const INTERVAL_PRESETS = [{ days: 30, label: "ทุก 1 เดือน" }, { days: 90, label: "ทุก 3 เดือน" }, { days: 180, label: "ทุก 6 เดือน" }, { days: 365, label: "ทุกปี" }];

// ─── ชนิดข้อมูลแถว ────────────────────────────────────────────────────────
type Base = { id: string; is_active: boolean; created_at: string; updated_at: string; deleted_at: string | null };
export type Cat = Base & { name: string; photo_r2_key: string | null; sex: "male" | "female" | null; birth_date: string | null; adopted_date: string | null; breed: string | null; color: string | null; neutered: boolean; microchip: string | null; note: string | null; sort_order: number };
export type Clinic = Base & { name: string; phone: string | null; address: string | null; map_url: string | null; is_24h: boolean; note: string | null };
export type Vaccination = Base & { cat_id: string; vaccine_name: string; date_given: string; clinic_id: string | null; next_due_date: string | null; cost: number | null; note: string | null };
export type Treatment = Base & { cat_id: string; type: "deworm" | "flea"; product: string; date_given: string; interval_days: number | null; next_due_date: string | null; cost: number | null; note: string | null };
export type Weight = Base & { cat_id: string; date: string; weight_kg: number; note: string | null };
export type SupplyType = "dry_food" | "wet_food" | "litter";
export type WetKind = "gravy" | "jelly";
export type Supply = Base & {
  type: SupplyType; wet_kind: WetKind | null; brand: string; flavor: string | null; unit: "bag" | "pouch" | "can";
  pack_size: number | null; pack_size_unit: "g" | "kg" | "L" | null; unit_size_g: number | null; units_per_pack: number | null;
  price: number | null; price_per: "piece" | "pack"; daily_g: number | null; pack_lasts_days: number | null;
  stock_base_qty: number; stock_base_at: string; shop_url: string | null; shop_name: string | null; cat_ids: string[] | null; note: string | null; sort_order: number;
};
export type Purchase = Base & { supply_id: string; date: string; qty: number; packs: number | null; price_paid: number | null; shop_name: string | null; note: string | null };
export type VetVisit = Base & { cat_id: string; date: string; clinic_id: string | null; symptoms: string | null; diagnosis: string | null; medicines: string | null; cost: number | null; receipt_r2_key: string | null; note: string | null };
export type ExpenseCategory = "snack" | "toy" | "grooming" | "vet" | "other";
export type Expense = Base & { cat_id: string | null; category: ExpenseCategory; date: string; amount: number; note: string | null };
export type CatsData = { cats: Cat[]; clinics: Clinic[]; vaccinations: Vaccination[]; treatments: Treatment[]; weights: Weight[]; supplies: Supply[]; purchases: Purchase[]; vet_visits: VetVisit[]; expenses: Expense[] };
export const SUPPLY_TYPE_LABEL: Record<SupplyType, string> = { dry_food: "อาหารเม็ด", wet_food: "อาหารเปียก", litter: "ทรายแมว" };
export const WET_KIND_LABEL: Record<WetKind, string> = { gravy: "เกรวี่", jelly: "เจลลี่" };
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = { snack: "ขนม", toy: "ของเล่น", grooming: "อาบน้ำตัดขน", vet: "ค่าหมอ", other: "อื่นๆ" };

// ─── ตรวจค่า ─────────────────────────────────────────────────────────────
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validYmd = (s: string) => YMD.test(s) && !isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export type CleanResult = { ok: true; patch: Record<string, unknown> } | { ok: false; error: string };

/** ตรวจค่าที่ส่งมา · partial = แก้บางช่อง (ช่องที่ไม่ส่งมาไม่แตะ) · คืนข้อความภาษาคนเมื่อผิด */
export function cleanCatBody(kind: CatKind, body: Record<string, unknown>, partial: boolean): CleanResult {
  const spec = CAT_KINDS[kind].fields;
  const patch: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(spec)) {
    const has = key in body;
    if (!has) {
      if (!partial && f.required) return { ok: false, error: `ต้องใส่${f.label}` };
      continue;
    }
    const raw = body[key];
    const empty = raw == null || (typeof raw === "string" && raw.trim() === "");
    if (empty) {
      if (f.required) return { ok: false, error: `ต้องใส่${f.label}` };
      patch[key] = f.type === "bool" ? false : null;
      continue;
    }
    switch (f.type) {
      case "text": case "longtext": {
        patch[key] = String(raw).trim().slice(0, f.max ?? 500);
        break;
      }
      case "date": {
        const s = String(raw).slice(0, 10);
        if (!validYmd(s)) return { ok: false, error: `${f.label}ไม่ถูกต้อง` };
        patch[key] = s;
        break;
      }
      case "bool": patch[key] = raw === true || raw === "true"; break;
      case "uuid": {
        if (typeof raw !== "string" || !UUID.test(raw)) return { ok: false, error: `${f.label}ไม่ถูกต้อง` };
        patch[key] = raw;
        break;
      }
      case "uuids": {
        if (!Array.isArray(raw)) return { ok: false, error: `${f.label}ไม่ถูกต้อง` };
        const ids = Array.from(new Set(raw.filter((x): x is string => typeof x === "string" && UUID.test(x)))).slice(0, 50);
        patch[key] = ids.length ? ids : null;
        break;
      }
      case "datetime": {
        const t = Date.parse(String(raw));
        if (!Number.isFinite(t)) return { ok: false, error: `${f.label}ไม่ถูกต้อง` };
        patch[key] = new Date(t).toISOString();
        break;
      }
      case "enum": {
        if (typeof raw !== "string" || !f.options?.includes(raw)) return { ok: false, error: `${f.label}ไม่ถูกต้อง` };
        patch[key] = raw;
        break;
      }
      case "money": case "int": case "kg": case "num": {
        const n = Number(String(raw).replace(/,/g, ""));
        if (!Number.isFinite(n)) return { ok: false, error: `${f.label}ต้องเป็นตัวเลข` };
        if (f.type === "money") {
          if (n < 0) return { ok: false, error: `${f.label}ติดลบไม่ได้` };
          patch[key] = Math.round(n * 100) / 100;
        } else if (f.type === "int") {
          const i = Math.round(n);
          if ((f.min != null && i < f.min) || (f.maxNum != null && i > f.maxNum)) return { ok: false, error: `${f.label}ต้องอยู่ระหว่าง ${f.min ?? 0}–${f.maxNum}` };
          patch[key] = i;
        } else if (f.type === "num") {
          if ((f.min != null && n < f.min) || (f.maxNum != null && n > f.maxNum)) return { ok: false, error: `${f.label}ต้องอยู่ระหว่าง ${f.min ?? 0}–${f.maxNum}` };
          patch[key] = Math.round(n * 100) / 100;
        } else {
          if (n <= 0 || n >= 30) return { ok: false, error: "น้ำหนักต้องมากกว่า 0 และน้อยกว่า 30 กก." };
          patch[key] = Math.round(n * 100) / 100;
        }
        break;
      }
    }
  }
  if ("is_active" in body) patch.is_active = body.is_active === true;
  // วันนัดถัดไปต้องไม่ก่อนวันที่ให้
  const given = patch.date_given as string | undefined;
  const due = patch.next_due_date as string | null | undefined;
  if (given && due && due < given) return { ok: false, error: "วันนัดครั้งถัดไปต้องไม่ก่อนวันที่ให้" };
  // ยา: มีรอบ แต่ไม่ได้ใส่วันครบกำหนด → คิดให้
  if (kind === "treatments" && given && patch.interval_days && !("next_due_date" in body && due)) {
    patch.next_due_date = addDaysYmd(given, patch.interval_days as number);
  }
  // ของใช้: อาหารเปียกต้องบอกว่าเกรวี่หรือเจลลี่ · ชนิดอื่นล้างค่านี้ทิ้ง · ลิงก์ต้องเป็น http(s)
  if (kind === "supplies") {
    if (patch.type === "wet_food" && !partial && !patch.wet_kind) return { ok: false, error: "เลือกว่าเป็นเกรวี่หรือเจลลี่" };
    if (patch.type && patch.type !== "wet_food") patch.wet_kind = null;
    if (typeof patch.shop_url === "string" && !/^https?:\/\//i.test(patch.shop_url)) return { ok: false, error: "ลิงก์ร้านต้องขึ้นต้นด้วย https://" };
  }
  if (kind === "clinics" && typeof patch.map_url === "string" && !/^https?:\/\//i.test(patch.map_url)) return { ok: false, error: "ลิงก์แผนที่ต้องขึ้นต้นด้วย https://" };
  if (partial && !Object.keys(patch).length) return { ok: false, error: "ไม่มีช่องที่ต้องแก้" };
  return { ok: true, patch };
}

// ─── อายุ ─────────────────────────────────────────────────────────────────
/** "3 ปี 2 เดือน" / "8 เดือน" / "2 สัปดาห์" จากวันเกิด */
export function ageText(birth: string | null | undefined, today: string): string {
  if (!birth || !validYmd(birth) || birth > today) return "";
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - by) * 12 + (tm - bm);
  if (td < bd) months -= 1;
  if (months <= 0) {
    const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${birth}T00:00:00Z`)) / 86400000);
    return days < 14 ? `${days} วัน` : `${Math.floor(days / 7)} สัปดาห์`;
  }
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} ปี` : "", m ? `${m} เดือน` : ""].filter(Boolean).join(" ");
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// ─── ใกล้ถึงกำหนด ─────────────────────────────────────────────────────────
export type DueItem = {
  key: string;
  kind: "vaccinations" | "treatments";
  recordId: string;
  catId: string;
  catName: string;
  title: string;          // "วัคซีนรวม 4 โรค" / "ยาหยดกันเห็บหมัด · Revolution"
  due: string;
  daysLeft: number;       // ติดลบ = เลยกำหนด
};

/** วัคซีน: กลุ่มตามชื่อ (ไม่สนตัวพิมพ์/ช่องว่าง) · ยา: กลุ่มตามชนิด (ถ่ายพยาธิ / หยดเห็บหมัด) — เปลี่ยนยี่ห้อก็ยังนับรอบเดียวกัน */
const vacKey = (v: Vaccination) => `${v.cat_id}|v|${v.vaccine_name.trim().toLowerCase().replace(/\s+/g, " ")}`;
const treatKey = (t: Treatment) => `${t.cat_id}|t|${t.type}`;

function latestBy<T extends { id: string; date_given: string; created_at: string }>(rows: T[], keyOf: (r: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    const k = keyOf(r);
    const cur = m.get(k);
    if (!cur || r.date_given > cur.date_given || (r.date_given === cur.date_given && r.created_at > cur.created_at)) m.set(k, r);
  }
  return m;
}

/** เข็ม/ยาครั้งล่าสุดของกลุ่มนี้ไหม (ครั้งก่อน ๆ ไม่นับครบกำหนดแล้ว) */
export function isLatestRecord(data: Pick<CatsData, "vaccinations" | "treatments">, kind: "vaccinations" | "treatments", id: string): boolean {
  if (kind === "vaccinations") {
    const rows = data.vaccinations.filter((v) => v.is_active);
    return [...latestBy(rows, vacKey).values()].some((r) => r.id === id);
  }
  const rows = data.treatments.filter((t) => t.is_active);
  return [...latestBy(rows, treatKey).values()].some((r) => r.id === id);
}

/** รายการที่มีวันนัด ภายใน withinDays วัน (รวมที่เลยกำหนดแล้ว) เรียงใกล้สุดก่อน */
export function dueItems(data: CatsData, today: string, withinDays = 30): DueItem[] {
  const catName = new Map(data.cats.filter((c) => c.is_active).map((c) => [c.id, c.name]));
  const out: DueItem[] = [];
  for (const v of latestBy(data.vaccinations.filter((x) => x.is_active && catName.has(x.cat_id)), vacKey).values()) {
    if (!v.next_due_date) continue;
    const d = daysBetween(today, v.next_due_date);
    if (d <= withinDays) out.push({ key: `v:${v.id}`, kind: "vaccinations", recordId: v.id, catId: v.cat_id, catName: catName.get(v.cat_id)!, title: v.vaccine_name, due: v.next_due_date, daysLeft: d });
  }
  for (const t of latestBy(data.treatments.filter((x) => x.is_active && catName.has(x.cat_id)), treatKey).values()) {
    if (!t.next_due_date) continue;
    const d = daysBetween(today, t.next_due_date);
    if (d <= withinDays) out.push({ key: `t:${t.id}`, kind: "treatments", recordId: t.id, catId: t.cat_id, catName: catName.get(t.cat_id)!, title: `${TREATMENT_LABEL[t.type]} · ${t.product}`, due: t.next_due_date, daysLeft: d });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.catName.localeCompare(b.catName, "th"));
}

/** ข้อความ + สีของจำนวนวันที่เหลือ */
export function dueLabel(daysLeft: number): { text: string; tone: "danger" | "warning" | "ok" } {
  if (daysLeft < 0) return { text: `เลยกำหนด ${-daysLeft} วัน`, tone: "danger" };
  if (daysLeft === 0) return { text: "วันนี้", tone: "danger" };
  if (daysLeft <= 7) return { text: `อีก ${daysLeft} วัน`, tone: "warning" };
  return { text: `อีก ${daysLeft} วัน`, tone: "ok" };
}

/**
 * ปุ่ม "ฉีดแล้ว / ให้ยาแล้ว" — ค่าบันทึกครั้งใหม่จากครั้งล่าสุด:
 *   วันที่ให้ = วันนี้ · ชื่อ/ยา/คลินิก/รอบ เหมือนเดิม · วันนัดถัดไป = วันนี้ + รอบเดิม
 *   รอบเดิมของวัคซีน = (วันนัดเดิม − วันที่ฉีดเดิม) · ไม่มีวันนัด = 365 วัน · ค่าใช้จ่ายไม่คัดลอก (ต้องกรอกเอง)
 */
export function doneAgain(kind: "vaccinations", last: Vaccination, today: string): Record<string, unknown>;
export function doneAgain(kind: "treatments", last: Treatment, today: string): Record<string, unknown>;
export function doneAgain(kind: "vaccinations" | "treatments", last: Vaccination | Treatment, today: string): Record<string, unknown> {
  if (kind === "vaccinations") {
    const v = last as Vaccination;
    const gap = v.next_due_date ? daysBetween(v.date_given, v.next_due_date) : 365;
    return { cat_id: v.cat_id, vaccine_name: v.vaccine_name, clinic_id: v.clinic_id, date_given: today, next_due_date: addDaysYmd(today, gap > 0 ? gap : 365) };
  }
  const t = last as Treatment;
  const gap = t.interval_days ?? (t.next_due_date ? daysBetween(t.date_given, t.next_due_date) : 30);
  return { cat_id: t.cat_id, type: t.type, product: t.product, date_given: today, interval_days: gap > 0 ? gap : 30, next_due_date: addDaysYmd(today, gap > 0 ? gap : 30) };
}

/** น้ำหนักล่าสุด + เปลี่ยนจากครั้งก่อน */
export function latestWeight(weights: Weight[], catId: string): { kg: number; date: string; diff: number | null } | null {
  const rows = weights.filter((w) => w.is_active && w.cat_id === catId).sort((a, b) => (a.date === b.date ? a.created_at.localeCompare(b.created_at) : a.date.localeCompare(b.date)));
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  return { kg: Number(last.weight_kg), date: last.date, diff: prev ? Math.round((Number(last.weight_kg) - Number(prev.weight_kg)) * 100) / 100 : null };
}

/** ชื่อแถวสำหรับ audit / แจ้งผล */
export function recordLabel(kind: CatKind, row: Record<string, unknown>): string {
  if (kind === "weights") return `${row.weight_kg ?? ""} กก. (${row.date ?? ""})`;
  if (kind === "supplies") return [SUPPLY_TYPE_LABEL[row.type as SupplyType] ?? "", row.brand, row.flavor].filter(Boolean).join(" ");
  if (kind === "purchases") return `ซื้อเข้า ${row.qty ?? ""} (${row.date ?? ""})`;
  if (kind === "vet_visits") return `หาหมอ ${row.date ?? ""}${row.diagnosis ? ` · ${String(row.diagnosis).slice(0, 40)}` : ""}`;
  if (kind === "expenses") return `${EXPENSE_CATEGORY_LABEL[row.category as ExpenseCategory] ?? "ค่าใช้จ่าย"} ${row.amount ?? ""} บาท${row.note ? ` · ${String(row.note).slice(0, 40)}` : ""}`;
  if (kind === "treatments") return `${TREATMENT_LABEL[row.type as "deworm" | "flea"] ?? "ยา"} ${row.product ?? ""}`.trim();
  return String(row[CAT_KINDS[kind].nameField] ?? "");
}
