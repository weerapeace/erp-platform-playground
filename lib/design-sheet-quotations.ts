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
  /** ใบสั่งขาย (so_orders · ยังไม่ยกเลิก) ที่ดึงใบนี้ไปแล้ว — GET เติมให้ */
  order_id?: string | null;
  order_no?: string | null;
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

// ── ยืนยันใบเสนอราคา "ผ่าน" (เจ้าของขอ 2026-11-07) ─────────────────────────────
//   กด "ยืนยัน · ผ่าน" ที่ใบหนึ่ง → ใบนี้ ผ่าน (ร่าง = ส่ง + ตอบรับ · ส่งแล้ว = ตอบรับ) → เปิดใบสั่งขาย (ถ้างานนี้ยังไม่มี)
//   → ใบอื่นของงานนี้ที่ยังเปิด: ร่าง = ยกเลิก · ส่งแล้ว/ตอบรับ = ปฏิเสธ (เหตุผล "ลูกค้าเลือก QT-…" — ใบที่ส่งแล้วยกเลิกไม่ได้ตามกติกา qt)
//   ใบที่มีใบงานอื่นอยู่ร่วม = ไม่ติ๊กปิดให้เอง (กันปิดใบของงานอื่นโดยไม่ตั้งใจ)

/** ขั้น workflow 'qt' ที่ต้องกดให้ใบนี้ "ผ่าน" · null = ยืนยันไม่ได้ (ปฏิเสธ/ยกเลิก/หมดอายุไปแล้ว) */
export function quoteConfirmSteps(status: string | null | undefined): ("send" | "accept")[] | null {
  if (status === "draft") return ["send", "accept"];
  if (status === "sent") return ["accept"];
  if (status === "accepted" || status === "converted") return [];
  return null;
}
/** กติกาสิทธิ์ของแต่ละขั้น */
export const QUOTE_STEP_PERM: Record<"send" | "accept", string> = { send: "qt.send", accept: "qt.accept" };

/** เหตุผลที่ใส่ให้ใบอื่นตอนปฏิเสธ */
export const quoteChosenReason = (quoteNumber: string | null | undefined) => `ลูกค้าเลือก ${quoteNumber || "ใบเสนอราคาอื่น"}`;

export type QuoteConfirmPlan = {
  pick: SheetQuotation;
  steps: ("send" | "accept")[];
  /** ใบสั่งขายของงานนี้ที่มีอยู่แล้ว (จากใบที่เลือก หรือใบอื่นของงานเดียวกัน) — มีแล้ว = ไม่เปิดใหม่ */
  existingOrder: { id: string; no: string; fromQuote: string | null } | null;
  close: { quotation_id: string; quote_number: string | null; status: string; action: "cancel" | "reject"; shared: string[]; defaultOn: boolean }[];
};

/** แผนว่ากดยืนยันใบ pickId แล้วจะเกิดอะไร (หน้าต่างให้ตรวจก่อนทำ) · null = ยืนยันใบนี้ไม่ได้ */
export function quoteConfirmPlan(list: SheetQuotation[], pickId: string): QuoteConfirmPlan | null {
  const pick = list.find((q) => q.quotation_id === pickId);
  if (!pick) return null;
  const steps = quoteConfirmSteps(pick.status);
  if (!steps) return null;
  const withOrder = [pick, ...list.filter((q) => q.quotation_id !== pickId)].find((q) => q.order_id);
  const close = list.filter((q) => q.quotation_id !== pickId).flatMap((q) => {
    const fa = quoteFailAction(q.status);
    if (!fa) return [];
    const shared = q.other_sheets.map((x) => x.code ?? x.name ?? "").filter(Boolean);
    return [{ quotation_id: q.quotation_id, quote_number: q.quote_number, status: q.status, action: fa.action, shared, defaultOn: shared.length === 0 }];
  });
  return {
    pick, steps,
    existingOrder: withOrder?.order_id ? { id: withOrder.order_id, no: withOrder.order_no ?? "—", fromQuote: withOrder.quote_number } : null,
    close,
  };
}

/** ใบเสนอราคา → ข้อมูลใบสั่งขาย (POST /api/so-orders) — ลูกค้า ราคา ส่วนลด ภาษี ตามใบนี้ · ทุกบรรทัดอ้างใบเสนอราคา (ระบบเปลี่ยนใบเป็น "แปลงแล้ว" ให้) */
export type QuoteForOrder = {
  id: string; quote_number: string | null;
  customer_id: string | null; customer_name: string | null; customer_code: string | null; sale_person_name: string | null;
  currency?: string | null; header_discount_type?: "percent" | "amount" | null; header_discount_value?: number | null;
  shipping_fee?: number | null; vat_rate?: number | null; vat_included?: boolean | null; wht_rate?: number | null;
  lines: { sku: string | null; product_name: string; qty: number; unit?: string | null; unit_price: number; discount_type?: "percent" | "amount" | null; discount_value?: number | null; note?: string | null }[];
};
export function quoteOrderPayload(q: QuoteForOrder, today = new Date().toISOString().slice(0, 10)) {
  return {
    header: {
      customer_id: q.customer_id, customer_name: q.customer_name, customer_code: q.customer_code, sale_person_name: q.sale_person_name,
      order_date: today, currency: q.currency || "THB",
      header_discount_type: q.header_discount_type ?? "amount", header_discount_value: Number(q.header_discount_value) || 0,
      shipping_fee: Number(q.shipping_fee) || 0, vat_rate: q.vat_rate ?? 7, vat_included: !!q.vat_included, wht_rate: Number(q.wht_rate) || 0,
      note: `จากใบเสนอราคา ${q.quote_number ?? ""}`.trim(),
    },
    lines: q.lines.filter((l) => (l.product_name ?? "").trim() || l.sku).map((l) => ({
      sku: l.sku, product_name: l.product_name, qty: Number(l.qty) || 0, unit: l.unit ?? null, unit_price: Number(l.unit_price) || 0,
      discount_type: l.discount_type ?? "amount", discount_value: Number(l.discount_value) || 0, note: l.note ?? null,
      source: "quote", quote_id: q.id, quote_no: q.quote_number,
    })),
  };
}
