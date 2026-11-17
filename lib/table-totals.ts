// ============================================================
// table-totals — แถวรวมยอดท้ายตารางกลาง (DataTable ปุ่ม "Σ รวม") (pure เทสต์ได้)
// เดาคอลัมน์ตัวเลขเอง (≥ 80% ของช่องที่มีค่าเป็นตัวเลข) · ข้ามคอลัมน์ที่เป็นรหัส/เลขอ้างอิง (id, code, เบอร์โทร, ปี …)
// ⚠️ สิทธิ์: คิดเฉพาะคอลัมน์ที่ผู้ใช้เห็นอยู่ — คอลัมน์ที่ไม่มีสิทธิ์ (เช่น ทุน) ถูกซ่อนตั้งแต่ต้น ไม่ถูกรวม
// ============================================================

export type TotalMode = "sum" | "avg";

const NOT_MONEY = /(^|_)(id|code|sku|barcode|phone|tel|mobile|zip|postcode|year|no|number|seq|order|sort|rank|line|version|ref)$|^(id|code|sku|barcode)$/i;

export function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.replace(/[,\s฿]/g, "");
    if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  }
  return null;
}

/** คอลัมน์นี้รวมยอดได้ไหม (ชื่อไม่ใช่แนวรหัส + ค่าส่วนใหญ่เป็นตัวเลข) */
export function isSummableColumn(colId: string, values: unknown[]): boolean {
  if (NOT_MONEY.test(colId)) return false;
  const filled = values.filter((v) => v != null && v !== "");
  if (filled.length === 0) return false;
  const nums = filled.filter((v) => toNum(v) != null).length;
  return nums / filled.length >= 0.8;
}

export function computeTotal(values: unknown[], mode: TotalMode): number | null {
  const nums = values.map(toNum).filter((n): n is number => n != null);
  if (!nums.length) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  const v = mode === "avg" ? sum / nums.length : sum;
  return Math.round(v * 100) / 100;
}

export function formatTotal(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

/** กดช่องรวม: รวม → เฉลี่ย → ไม่แสดง → รวม */
export function nextTotalMode(m: TotalMode | "off" | undefined): TotalMode | "off" {
  return m === "sum" || m === undefined ? "avg" : m === "avg" ? "off" : "sum";
}
