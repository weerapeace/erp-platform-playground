/**
 * 🗺️ ทะเบียน "แม่แบบเอกสารแต่ละประเภท ถูกใช้พิมพ์ที่หน้าไหน" (ของกลาง — ใช้ทั้งฝั่งจอและ server)
 *
 * ใช้กับหน้า /admin/report-templates:
 *   - โชว์ "ใช้พิมพ์ที่" ก่อนกดใช้งานจริง → รู้ว่ากระทบหน้าพิมพ์ไหน
 *   - พรีวิวด้วยเอกสารจริง → เปิดหน้าพิมพ์ตัวแรกที่หยิบแม่แบบนี้ ใส่เลขเอกสารจริง
 *
 * กติกาการหยิบแม่แบบของหน้าพิมพ์ (pick):
 *   "default"            = หยิบใบที่เป็น "หลัก" (is_default) ของเอกสารนั้น
 *   "default_or_chosen"  = หยิบใบหลัก หรือใบที่ผู้ใช้เลือกไว้ในแผงตั้งค่าของหน้าพิมพ์
 *   "chosen"             = หน้าพิมพ์มีแบบในตัว ผู้ใช้เลือกแม่แบบจากรายการเอง (ใบสั่งงานผลิต)
 *   { key: "..." }       = หยิบตามรหัสแม่แบบ (template_key) เท่านั้น เช่น ใบส่งสินค้า
 *
 * ⚠️ เพิ่มหน้าพิมพ์ใหม่ที่อ่าน /api/admin/report-templates → เพิ่มแถวที่นี่ด้วย
 */
export type ReportUsagePick = "default" | "default_or_chosen" | "chosen" | { key: string };

export type ReportUsage = {
  label: string;
  /** path หน้าพิมพ์ — ":id" = เลขเอกสาร · ไม่มี ":id" = หน้าพิมพ์รวม (เปิดจากหน้ารายการ) */
  path: string;
  pick: ReportUsagePick;
};

export const REPORT_USAGES: Record<string, ReportUsage[]> = {
  qt: [{ label: "พิมพ์ใบเสนอราคา", path: "/print/quotation/:id", pick: "default" }],
  pr: [{ label: "พิมพ์ใบขอซื้อ", path: "/print/purchase-request/:id", pick: "default" }],
  po: [{ label: "พิมพ์ใบสั่งซื้อ", path: "/print/purchase-order/:id", pick: "default" }],
  gr: [{ label: "พิมพ์ใบรับสินค้า", path: "/print/goods-receipt/:id", pick: "default" }],
  pv: [{ label: "พิมพ์ใบสำคัญรับ", path: "/print/purchase-voucher/:id", pick: "default" }],
  wo: [
    { label: "พิมพ์ใบสั่งงานผลิต (เลือกแม่แบบในหน้าพิมพ์)", path: "/print/work-order/:id", pick: "chosen" },
  ],
  so: [
    { label: "พิมพ์ใบสั่งขาย / ใบกำกับภาษี", path: "/print/sales-order/:id", pick: "default_or_chosen" },
    { label: "พิมพ์ใบกำกับภาษีรวมหลายใบ", path: "/print/sales-order-bulk", pick: "default_or_chosen" },
    { label: "พิมพ์ใบส่งสินค้า (จากใบสั่งขาย)", path: "/print/delivery-note/:id", pick: { key: "delivery-note" } },
    { label: "พิมพ์ใบส่งของ", path: "/print/delivery-doc/:id", pick: { key: "delivery-note" } },
  ],
  billing_note: [
    { label: "พิมพ์ใบวางบิล", path: "/print/billing-note/:id", pick: "default_or_chosen" },
    { label: "พิมพ์ใบวางบิลรวมหลายใบ", path: "/print/billing-note-bulk", pick: "default_or_chosen" },
  ],
  cn: [{ label: "พิมพ์ใบลดหนี้", path: "/print/credit-note/:id", pick: "default" }],
  design_sheet: [
    { label: "พิมพ์ใบสั่งตัวอย่าง", path: "/print/design-sheet/:id", pick: "default" },
    { label: "พิมพ์ใบสั่งตัวอย่าง โหมดเน้นความเห็น", path: "/print/design-sheet/:id", pick: { key: "comment_focus" } },
  ],
  design_sheet_cost: [{ label: "พิมพ์ใบตีราคาต้นทุน", path: "/print/design-sheet-cost/:id", pick: "default" }],
  design_sheet_quote: [{ label: "พิมพ์ใบเสนอราคางานออกแบบ", path: "/print/design-sheet-quote/:id", pick: "default" }],
  design_sheet_supplier: [{ label: "พิมพ์ใบตีราคาสั่งจากร้าน", path: "/print/design-sheet-supplier/:id", pick: "default" }],
  ds_present: [{ label: "พิมพ์ใบนำเสนอ A4", path: "/print/design-sheet-present/:id", pick: "default" }],
};

type TemplateLike = { entity_type: string; template_key: string; is_default: boolean; active: boolean };

/** หน้าพิมพ์นี้หยิบแม่แบบนี้ไหม: "yes" แน่นอน · "maybe" ถ้าผู้ใช้เลือกในหน้าพิมพ์ · "no" */
export function usageMatch(usage: ReportUsage, row: TemplateLike): "yes" | "maybe" | "no" {
  if (usage.pick === "chosen") return "maybe";
  if (!row.active) return "no";
  if (typeof usage.pick === "object") return row.template_key === usage.pick.key ? "yes" : "no";
  if (row.is_default) return "yes";
  return usage.pick === "default_or_chosen" ? "maybe" : "no";
}

export function usagesFor(entityType: string): ReportUsage[] {
  return REPORT_USAGES[entityType] ?? [];
}

/** หน้าพิมพ์ทีละใบที่ใช้พรีวิวแม่แบบนี้ด้วยเอกสารจริง (หน้าที่หยิบตาม key ของมันก่อน ไม่งั้นหน้าหลัก) */
export function previewUsageFor(row: TemplateLike): ReportUsage | null {
  const single = usagesFor(row.entity_type).filter(u => u.path.includes(":id"));
  return single.find(u => typeof u.pick === "object" && u.pick.key === row.template_key)
    ?? single.find(u => typeof u.pick !== "object")
    ?? null;
}
