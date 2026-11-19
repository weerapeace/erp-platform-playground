/**
 * กติกา "ใบสั่งขายต้องผูก SKU ทุกรายการ" (เจ้าของสั่ง 2026-11-19)
 *   - รายการสินค้าทุกบรรทัดต้องมีรหัส SKU ที่มีอยู่จริงในทะเบียนสินค้า (skus_v2.code)
 *   - ยกเว้นบรรทัดที่ "ไม่ใช่สินค้า" (ค่าส่ง ค่าบล็อก ค่าแพทเทิร์น มัดจำ …) — ติ๊กเองได้ · ชื่อขึ้นต้นด้วย "ค่า…" ระบบติ๊กให้ก่อน
 *   - ใช้ทั้งหน้าจอ (/sales/orders · ลงหลายรายการ) และฝั่งระบบ (/api/so-orders POST + PATCH save) — แก้กติกาที่นี่ที่เดียว
 * ตัวเดาว่า SKU ไหน = guessSkuForLine (lib/design-sheet-quotations) · SKU ของใบงาน = /api/so-orders/sheet-skus
 */

/** ชื่อบรรทัดที่น่าจะไม่ใช่สินค้า (ค่าบริการ/ค่าใช้จ่าย) */
const NON_PRODUCT_RE = /^(ค่า|มัดจำ|ส่วนลด|เงินมัดจำ)|(shipping|deposit|service fee)/i;
export const looksNonProduct = (name: string | null | undefined) => NON_PRODUCT_RE.test(String(name ?? "").trim());

export type SkuLinkLine = { sku?: string | null; product_name?: string | null; non_product?: boolean | null };

/** บรรทัดนี้ยังต้องผูก SKU ไหม (ไม่มีรหัส + ไม่ได้ติ๊ก "ไม่ใช่สินค้า") */
export const lineNeedsSku = (l: SkuLinkLine) => !String(l.sku ?? "").trim() && !l.non_product;

/** บรรทัดที่ยังไม่ผูก (ชื่อ) */
export const unlinkedLineNames = (lines: readonly SkuLinkLine[]) =>
  lines.filter(lineNeedsSku).map((l) => String(l.product_name ?? "").trim() || "(ไม่มีชื่อ)");

/** ข้อความแจ้ง "ยังผูกไม่ครบ" ภาษาคน */
export function skuLinkErrorText(names: readonly string[]): string {
  const shown = names.slice(0, 3).join(" · ");
  return `ยังไม่ได้ผูก SKU ${names.length} รายการ: ${shown}${names.length > 3 ? " …" : ""} — เลือก SKU ให้ครบ หรือติ๊ก "ไม่ใช่สินค้า" ถ้าเป็นค่าบริการ`;
}
