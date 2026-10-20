/**
 * ✏️ ของกลาง — แก้ชื่อสี (ไทย / อังกฤษ) + ราคาขาย ของ SKU ลูก จากแถวสีในแท็บ 🛍 เว็บไซต์
 * แก้ที่ SKU ใน ERP จริง (เจ้าของเลือก 2026-10-20) — ทุกร้าน / ใบสั่งขาย / หน้า SKU เห็นค่าใหม่
 *
 *   สี (ไทย)     → skus_v2.color_th   (เว็บหน้าไทยโชว์ชื่อนี้ · ว่าง = ใช้ช่อง Color)
 *   ชื่ออังกฤษ   → skus_v2.color      (ช่อง "Color" · เว็บหน้า /en ใช้ · ว่าง/เป็นไทย = แปลจากทะเบียนสีกลาง)
 *   ราคา         → skus_v2.list_price (ราคาขายกลางของ SKU ใช้ทุกช่องทาง)
 *
 * กฎ:
 *   - SKU ไซส์ของสีเดียวกัน (เช่น "ดำ / L") เปลี่ยนชื่อตามให้ ไม่งั้นสีกับไซส์บนเว็บจับคู่กันไม่ติด
 *   - ชื่อสีที่เว็บโชว์ซ้ำกับสีอื่นของรุ่นเดียวกัน = ไม่ยอม (เว็บจะรวมเป็นสีเดียว ลูกค้าเลือกไม่ได้)
 *   - ราคาต้องมากกว่า 0 · ต้องมีชื่อสีอย่างน้อย 1 ภาษา
 *   - renames = ชื่อที่เว็บโชว์เปลี่ยน → ผู้เรียกต้องเปลี่ยนชื่อในการตั้งค่าการ์ด (web_card_colors) ตาม
 * ไฟล์นี้ pure (ไม่ผูก DB) — ส่วนเขียน DB/สิทธิ์/audit อยู่ที่ /api/parent-web-listings action "skuFields"
 */
import { baseColor, variantOf } from "@/lib/website-size-options";

export interface SkuFieldsInput {
  skuId: string;
  /** undefined = ไม่แก้ */
  colorTh?: string;
  colorEn?: string;
  price?: number;
}

export interface SkuFieldsRow {
  id: string;
  code: string | null;
  color: string | null;
  color_th: string | null;
  list_price: number | string | null;
  attribute_values?: Record<string, unknown> | null;
}

export type SkuFieldsPatch = Partial<Pick<SkuFieldsRow, "color" | "color_th">> & { list_price?: number };

export interface SkuFieldsPlan {
  updates: { id: string; code: string; patch: SkuFieldsPatch; changes: Record<string, { old: unknown; new: unknown }> }[];
  /** ชื่อสีที่เว็บโชว์เปลี่ยน (เก่า → ใหม่) */
  renames: { from: string; to: string }[];
}

export const SKU_COLOR_MAX = 80;
const MAX_ITEMS = 60;

const clean = (v: unknown) => String(v ?? "").trim();
const optText = (v: unknown): string | undefined => (v === undefined || v === null ? undefined : clean(v).slice(0, SKU_COLOR_MAX));

/** อ่าน body ที่หน้าจอส่งมา → รายการที่ใช้ได้ หรือข้อความ error (ภาษาคน) */
export function parseSkuFieldsInput(raw: unknown): SkuFieldsInput[] | string {
  if (!Array.isArray(raw) || !raw.length) return "ไม่มีรายการที่จะแก้";
  if (raw.length > MAX_ITEMS) return `แก้ได้ครั้งละไม่เกิน ${MAX_ITEMS} สี`;
  const out: SkuFieldsInput[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const skuId = clean(o.skuId);
    if (!/^[0-9a-f-]{36}$/i.test(skuId)) return "รหัส SKU ไม่ถูกต้อง";
    const it: SkuFieldsInput = { skuId };
    const th = optText(o.colorTh);
    const en = optText(o.colorEn);
    if (th !== undefined) it.colorTh = th;
    if (en !== undefined) it.colorEn = en;
    if (o.price !== undefined && o.price !== null && o.price !== "") {
      const n = Number(o.price);
      if (!Number.isFinite(n) || n <= 0) return "ราคาต้องเป็นตัวเลขมากกว่า 0";
      if (n > 10_000_000) return "ราคาสูงเกินไป";
      it.price = Math.round(n * 100) / 100;
    }
    out.push(it);
  }
  return out;
}

/** ชื่อใหม่ของ SKU ไซส์ — คงท้าย " / L" ไว้ถ้าเดิมพิมพ์ต่อท้ายชื่อสีหลัก */
const siblingName = (sib: string, oldBase: string, newBase: string): string | null => {
  if (!newBase) return null;
  return oldBase && sib.startsWith(oldBase) ? newBase + sib.slice(oldBase.length) : newBase;
};

/**
 * วางแผนการแก้ (ยังไม่เขียน DB)
 * @param rows SKU ลูกทุกตัวของรุ่น (ใช้หา SKU ไซส์ของสีเดียวกัน + เช็กชื่อซ้ำ)
 */
export function planSkuFields(rows: SkuFieldsRow[], inputs: SkuFieldsInput[]): SkuFieldsPlan | { error: string } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const next = new Map(rows.map((r) => [r.id, { ...r }]));
  const patches = new Map<string, SkuFieldsPatch>();
  const renames: SkuFieldsPlan["renames"] = [];
  const setField = <K extends keyof SkuFieldsPatch>(id: string, k: K, v: SkuFieldsPatch[K]) => {
    const p = patches.get(id) ?? {};
    p[k] = v;
    patches.set(id, p);
    Object.assign(next.get(id)!, { [k]: v });
  };
  const changed = new Set<string>();

  for (const it of inputs) {
    const row = byId.get(it.skuId);
    if (!row) return { error: "ไม่พบ SKU นี้ในรุ่น (อาจถูกลบไปแล้ว) — โหลดหน้าใหม่แล้วลองอีกครั้ง" };
    const code = clean(row.code) || "SKU";
    const oldLabel = baseColor(row);
    const oldTh = clean(row.color_th);
    const oldEn = clean(row.color);
    const th = it.colorTh !== undefined && it.colorTh !== oldTh ? it.colorTh : undefined;
    const en = it.colorEn !== undefined && it.colorEn !== oldEn ? it.colorEn : undefined;
    if (th !== undefined) setField(row.id, "color_th", th || null);
    if (en !== undefined) setField(row.id, "color", en || null);
    if (it.price !== undefined && it.price !== Number(row.list_price)) setField(row.id, "list_price", it.price);
    const after = next.get(row.id)!;
    if (!clean(after.color_th) && !clean(after.color)) return { error: `${code}: ต้องมีชื่อสีอย่างน้อย 1 ภาษา` };
    if (th === undefined && en === undefined) continue;
    changed.add(row.id);

    // SKU ไซส์ของสีเดียวกัน → ชื่อตามสีหลัก (เทียบด้วยชื่อที่เว็บใช้จัดกลุ่ม "ก่อน" แก้)
    for (const sib of rows) {
      if (sib.id === row.id || !variantOf(sib) || baseColor(sib) !== oldLabel) continue;
      if (th !== undefined) {
        const v = siblingName(clean(sib.color_th), oldTh, th);
        if ((v ?? "") !== clean(sib.color_th)) setField(sib.id, "color_th", v);
      }
      if (en !== undefined) {
        const v = siblingName(clean(sib.color), oldEn, en);
        if ((v ?? "") !== clean(sib.color)) setField(sib.id, "color", v);
      }
    }
    const newLabel = baseColor(after);
    if (newLabel !== oldLabel) renames.push({ from: oldLabel, to: newLabel });
  }

  // ชื่อที่เว็บโชว์ต้องไม่ซ้ำกับสีอื่นของรุ่น (ตัวหลักของสี = SKU ที่ไม่ใช่ไซส์)
  const mains = [...next.values()].filter((r) => !variantOf(r));
  for (const id of changed) {
    const me = next.get(id)!;
    const label = baseColor(me).toLowerCase();
    const dup = mains.find((o) => o.id !== id && baseColor(o).toLowerCase() === label);
    if (dup) return { error: `ชื่อสี "${baseColor(me)}" ซ้ำกับ ${clean(dup.code) || "อีกสี"} — บนเว็บจะรวมเป็นสีเดียว ลองตั้งชื่อให้ต่างกัน` };
  }

  const updates: SkuFieldsPlan["updates"] = [];
  for (const [id, patch] of patches) {
    const before = byId.get(id)!;
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    for (const [k, v] of Object.entries(patch)) changes[k] = { old: (before as unknown as Record<string, unknown>)[k] ?? null, new: v };
    updates.push({ id, code: clean(before.code), patch, changes });
  }
  return { updates, renames };
}
