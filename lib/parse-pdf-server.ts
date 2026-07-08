/**
 * ของกลางฝั่ง server: อ่านข้อความใน PDF (unpdf) แล้วแกะ ยอด/สกุลเงิน/วันที่
 * ⚠️ ใช้ในฝั่ง server เท่านั้น (unpdf ต้องรันบน node) — best-effort ไม่ throw
 */
import { parseInvoiceFields, type ParsedInvoice } from "@/lib/parse-invoice";

export async function extractPdfFields(buf: ArrayBuffer): Promise<ParsedInvoice & { hasText: boolean }> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const res = await extractText(pdf, { mergePages: true });
    const t = res.text as unknown;
    const text = typeof t === "string" ? t : Array.isArray(t) ? (t as string[]).join("\n") : "";
    return { ...parseInvoiceFields(text), hasText: text.trim().length > 20 };
  } catch {
    return { amount: null, currency: null, dateISO: null, month: null, hasText: false };
  }
}
