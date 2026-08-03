/**
 * ของกลาง — "ตั้งค่าการพิมพ์เอกสาร" (เลือกแม่แบบ + เลือกคอลัมน์ที่จะโชว์)
 *
 * ใช้กับเอกสารชนิดไหนก็ได้ แยกด้วย entity_type (so / po / qt / billing_note …)
 * เก็บเป็นค่ากลางของระบบใน ui_config key `doc_print_<entity_type>`
 * → ตั้งครั้งเดียว ทุกคนพิมพ์ได้หน้าตาเดียวกัน (ไม่ใช่ต่างคนต่างตั้ง)
 *
 * วิธีที่แม่แบบเอาไปใช้: ห่อ <th>/<td> ด้วย {{#col_<key>}}…{{/col_<key>}}
 * และใช้ {{totals_colspan}} ในแถวสรุปยอด — ปิดคอลัมน์แล้วตารางจะไม่เบี้ยว
 */

export type DocColumn = {
  key: string;
  label: string;
  /** เปิดไว้ตั้งแต่แรกไหม */
  on: boolean;
  /** ปิดไม่ได้ (เอกสารขาดไม่ได้ เช่น ชื่อสินค้า/จำนวนเงิน) */
  locked?: boolean;
};

/**
 * คอลัมน์ที่เลือกเปิด-ปิดได้ ของเอกสารแต่ละชนิด
 * เพิ่มชนิดใหม่ = เพิ่ม key ตรงนี้ที่เดียว แล้วห่อ section ในแม่แบบให้ตรงกัน
 */
export const DOC_COLUMNS: Record<string, DocColumn[]> = {
  so: [
    { key: "idx",          label: "ลำดับ",           on: true },
    { key: "sku",          label: "รหัสสินค้า",       on: true },
    { key: "product_name", label: "รายการสินค้า",     on: true, locked: true },
    { key: "qty",          label: "จำนวน",            on: true },
    { key: "unit",         label: "หน่วย",            on: false },
    { key: "unit_price",   label: "ราคาต่อหน่วย",     on: true },
    { key: "discount",     label: "ส่วนลด",           on: false },
    { key: "vat",          label: "VAT รายบรรทัด",    on: false },
    { key: "line_total",   label: "จำนวนเงิน",        on: true, locked: true },
  ],
};

export type DocPrintPrefs = {
  /** id ของแม่แบบที่เลือกไว้ (ว่าง = ใช้ตัวตั้งต้นของระบบ) */
  template_id: string;
  /** คอลัมน์ที่เปิดอยู่ { key: true/false } */
  columns: Record<string, boolean>;
};

export const defaultPrefs = (entityType: string): DocPrintPrefs => ({
  template_id: "",
  columns: Object.fromEntries((DOC_COLUMNS[entityType] ?? []).map((c) => [c.key, c.on])),
});

export const prefsKey = (entityType: string) => `doc_print_${entityType}`;

/** รวมค่าที่บันทึกไว้กับค่าเริ่มต้น — คอลัมน์ที่เพิ่มใหม่ทีหลังจะได้ค่าเริ่มต้นเอง ไม่หายไป */
export function normalizePrefs(entityType: string, raw: unknown): DocPrintPrefs {
  const base = defaultPrefs(entityType);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<DocPrintPrefs>;
  const cols = { ...base.columns };
  if (r.columns && typeof r.columns === "object") {
    for (const c of DOC_COLUMNS[entityType] ?? []) {
      const v = (r.columns as Record<string, unknown>)[c.key];
      if (typeof v === "boolean") cols[c.key] = c.locked ? true : v;
    }
  }
  return { template_id: typeof r.template_id === "string" ? r.template_id : "", columns: cols };
}

/**
 * แปลงเป็น token สำหรับแม่แบบ: col_<key> = "1" / ""
 * + totals_colspan = จำนวนคอลัมน์ที่เปิดอยู่ ลบคอลัมน์ยอดเงิน (แถวสรุปกินพื้นที่ที่เหลือ)
 */
export function columnTokens(entityType: string, prefs: DocPrintPrefs): Record<string, string> {
  const cols = DOC_COLUMNS[entityType] ?? [];
  const out: Record<string, string> = {};
  let shown = 0;
  for (const c of cols) {
    const on = c.locked ? true : prefs.columns[c.key] !== false;
    out[`col_${c.key}`] = on ? "1" : "";
    if (on) shown += 1;
  }
  out.totals_colspan = String(Math.max(1, shown - 1));
  out.line_colspan = String(Math.max(1, shown));
  return out;
}
