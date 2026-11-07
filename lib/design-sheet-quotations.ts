/**
 * ใบงานออกแบบ ↔ ใบเสนอราคา (ระบบขาย) — กติกาส่วนที่ไม่แตะฐานข้อมูล (pure — ใช้ได้ทั้งหน้าจอ เซิร์ฟเวอร์ และเทสต์)
 *
 * ที่เก็บ: ตาราง design_sheet_quotations (1 แถว = ใบงาน 1 ใบ ผูกกับใบเสนอราคา 1 ใบ · 1 ใบเสนอราคารวมหลายใบงานได้)
 *   replaces_quotation_id = ใบนี้เปิดมาแทนใบไหน (กด "ไม่ผ่าน · เปิดใบใหม่แทน")
 * ประตูเขียน: app/api/design-sheets/[id]/to-quotation (ผูกตอนส่ง) · app/api/design-sheets/[id]/quotations (ไม่ผ่าน / เปิดใหม่แทน)
 * สถานะใบเสนอราคาเปลี่ยนผ่าน workflow กลาง 'qt' (RPC erp_playground_quote_transition) เท่านั้น — ไฟล์นี้แค่ตัดสินว่าจะใช้ action ไหน
 */
import { QUOTE_STATUS_TH } from "@/lib/quote-pull";

export { QUOTE_STATUS_TH };

/** สถานะที่ถือว่า "ยังเปิดอยู่" — มีใบแบบนี้แล้ว เปิดใบใหม่ = ซ้ำ */
export const QUOTE_OPEN_STATUSES = ["draft", "sent", "accepted"] as const;
export const isQuoteOpen = (status: string | null | undefined): boolean =>
  (QUOTE_OPEN_STATUSES as readonly string[]).includes(status ?? "");

/** สีป้ายสถานะ (ชุดเดียวกับหน้า /quotations) */
export const QUOTE_STATUS_CLS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", sent: "bg-amber-100 text-amber-700",
  accepted: "bg-blue-100 text-blue-700", converted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700", expired: "bg-slate-200 text-slate-500",
  cancelled: "bg-red-50 text-red-500",
};

/**
 * ใบนี้ "ไม่ผ่าน" → ใช้ action ไหนของ workflow 'qt'
 *   ร่าง = ยกเลิก (cancel) · ส่งแล้ว/ตอบรับแล้ว = ปฏิเสธ (reject — กติกากลางบังคับเหตุผล)
 *   แปลงแล้ว / ปิดไปแล้ว = ทำไม่ได้ (null)
 */
export function quoteFailAction(status: string | null | undefined): { action: "cancel" | "reject"; needReason: boolean; perm: string } | null {
  if (status === "draft") return { action: "cancel", needReason: false, perm: "qt.cancel" };
  if (status === "sent" || status === "accepted") return { action: "reject", needReason: true, perm: "qt.reject" };
  return null;
}

export type SheetQuotation = {
  quotation_id: string;
  quote_number: string | null;
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_code: string | null;
  grand_total: number;
  quote_date: string | null;
  valid_until: string | null;
  reject_reason: string | null;
  created_at: string | null;
  /** ใบนี้เปิดมาแทนใบไหน */
  replaces_quotation_id: string | null;
  replaces_quote_number: string | null;
  /** ใบนี้ถูกใบไหนเปิดแทนแล้ว (ใบใหม่ของงานเดียวกัน) */
  replaced_by_quote_number: string | null;
  source: string;
  linked_at: string;
  linked_by_name: string | null;
  /** ใบงานอื่นที่อยู่ในใบเสนอราคาเดียวกัน (ไม่นับใบนี้) */
  other_sheets: { id: string; code: string | null; name: string | null }[];
};

/** เรียง: ใบที่ยังเปิดก่อน แล้วใหม่ → เก่า */
export function sortSheetQuotations(list: SheetQuotation[]): SheetQuotation[] {
  return [...list].sort((a, b) => {
    const oa = isQuoteOpen(a.status) ? 0 : 1, ob = isQuoteOpen(b.status) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return (b.created_at ?? b.linked_at ?? "").localeCompare(a.created_at ?? a.linked_at ?? "");
  });
}

/** ใบร่างของงานนี้ที่ควรหย่อนต่อ (ล่าสุด) */
export function latestOpenDraft(list: SheetQuotation[]): SheetQuotation | null {
  return sortSheetQuotations(list).find((q) => q.status === "draft") ?? null;
}

/** ข้อความเตือนก่อนเปิดใบใหม่ เมื่องานนี้ยังมีใบที่เปิดอยู่ — null = ไม่ซ้ำ */
export function duplicateQuoteWarning(list: SheetQuotation[]): string | null {
  const open = list.filter((q) => isQuoteOpen(q.status));
  if (open.length === 0) return null;
  const names = open.map((q) => `${q.quote_number ?? "ใบร่าง"} (${QUOTE_STATUS_TH[q.status] ?? q.status})`).join(", ");
  return `งานนี้มีใบเสนอราคาที่ยังเปิดอยู่ ${open.length} ใบ: ${names} — ถ้าใบเดิมไม่ผ่าน ให้กด "ไม่ผ่าน · เปิดใบใหม่แทน" ที่แผงใบเสนอราคาของงานนี้ จะได้ไม่มีใบซ้ำ`;
}
