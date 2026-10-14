/**
 * ของกลาง — ขนาดสินค้า + "ใส่อะไรได้บ้าง" (pure: ใช้ได้ทั้งหน้าจอและ API — ห้ามใส่ "use client")
 *
 *   parent_skus_v2.fits = [{ id: product_fit_items.id, size?: "14 นิ้ว" }]
 *   product_fit_items   = รายการกลาง (name, name_en, sizes "13 นิ้ว, 14 นิ้ว")
 *
 * ใช้ที่: ตัวเลือกในฟอร์ม Parent SKU (components/parent-fit-picker) · บล็อก "ขนาด" บนเว็บร้าน
 */

export type FitPick = { id: string; size?: string | null };
export type FitItem = { id: string; name: string; name_en?: string | null; sizes?: string | null; sort_order?: number | null; is_active?: boolean | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** อ่านค่า fits จาก DB/ฟอร์ม (array หรือ JSON string) → รายการที่ถูกต้องเสมอ (ไม่ซ้ำ) */
export function parseFits(raw: unknown): FitPick[] {
  let v = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: FitPick[] = [];
  for (const x of v) {
    const id = String((x as { id?: unknown })?.id ?? "");
    if (!UUID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    const size = String((x as { size?: unknown })?.size ?? "").trim().slice(0, 40);
    out.push(size ? { id, size } : { id });
    if (out.length >= 30) break;
  }
  return out;
}

/** ตัวเลือกขนาดของรายการ ("13 นิ้ว, 14 นิ้ว" → ["13 นิ้ว","14 นิ้ว"]) */
export const fitSizeOptions = (item: Pick<FitItem, "sizes"> | null | undefined): string[] =>
  String(item?.sizes ?? "")
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

/** ข้อความ "ใส่ได้" เช่น ["สมาร์ทโฟน (ถึง 6.7 นิ้ว)", "กระเป๋าสตางค์ (ใบยาว)"] — รายการที่ถูกลบ/ปิดไปแล้วจะถูกข้าม */
export function fitLabels(fits: unknown, catalog: FitItem[], lang: "th" | "en" = "th"): string[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const out: string[] = [];
  for (const f of parseFits(fits)) {
    const it = byId.get(f.id);
    if (!it || it.is_active === false) continue;
    const name = (lang === "en" && it.name_en?.trim()) || it.name;
    out.push(f.size ? `${name} (${f.size})` : name);
  }
  return out;
}

// ─── ซม. ↔ นิ้ว ───

/** 23 → "9.1" · 30 → "11.8" · 25.4 → "10" (ทศนิยม 1 ตำแหน่ง ตัด .0) */
export const cmToInch = (cm: number): string => {
  const n = Math.round((cm / 2.54) * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

/** ตัดเลข 0 ท้าย: 12.0 → "12", 8.50 → "8.5" */
const num = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

/**
 * แถวขนาดสำหรับโชว์ — แยก ซม. / นิ้ว ไว้ ให้ปลายทางเลือกเองว่าจะต่อนิ้วไหม (ตั้งเปิด/ปิดต่อร้านในธีม)
 *   { key:"width", label:"กว้าง", cm:"23 ซม.", inch:"9.1\"" }
 *   สายปรับได้ → { cm:"50–60 ซม. (ปรับได้)", inch:"19.7–23.6\"" }
 * ช่องที่ว่าง/0 ถูกข้าม
 */
export type DimensionRow = {
  size_length_cm?: unknown; size_height_cm?: unknown; size_thickness_cm?: unknown;
  handle_drop_cm?: unknown; strap_drop_cm?: unknown; strap_drop_max_cm?: unknown;
};
export type DimensionLine = { key: string; label: string; cm: string; inch: string };
export function dimensionRows(r: DimensionRow, lang: "th" | "en" = "th"): DimensionLine[] {
  const en = lang === "en";
  const cmU = en ? "cm" : "ซม.";
  const rows: DimensionLine[] = [];
  const push = (key: string, th: string, eng: string, cm: number) => {
    if (cm) rows.push({ key, label: en ? eng : th, cm: `${cm} ${cmU}`, inch: `${cmToInch(cm)}"` });
  };
  push("width", "กว้าง", "Width", num(r.size_length_cm));
  push("height", "สูง", "Height", num(r.size_height_cm));
  push("thickness", "หนา", "Depth", num(r.size_thickness_cm));
  push("handle", "ความสูงหูหิ้ว", "Handle drop", num(r.handle_drop_cm));
  const s1 = num(r.strap_drop_cm), s2 = num(r.strap_drop_max_cm);
  if (s1 && s2 && s2 > s1) {
    rows.push({
      key: "strap", label: en ? "Strap drop" : "ความยาวสายสะพาย",
      cm: `${s1}–${s2} ${cmU} ${en ? "(adjustable)" : "(ปรับได้)"}`, inch: `${cmToInch(s1)}–${cmToInch(s2)}"`,
    });
  } else push("strap", "ความยาวสายสะพาย", "Strap drop", s1 || s2);
  return rows;
}

/** ข้อมูล "ขนาด" ของรุ่นหนึ่งสำหรับเว็บ — ไม่มีอะไรเลย = undefined (เว็บจะไม่โชว์หัวข้อนี้) */
export function productDimensions(
  r: DimensionRow & { fits?: unknown },
  catalog: FitItem[],
  lang: "th" | "en" = "th",
): { fits: string[]; rows: DimensionLine[] } | undefined {
  const fits = fitLabels(r.fits, catalog, lang);
  const rows = dimensionRows(r, lang);
  return fits.length || rows.length ? { fits, rows } : undefined;
}
