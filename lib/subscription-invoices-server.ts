/**
 * ฝั่ง server: บันทึกไฟล์บิลของ subscription (ใช้ร่วม "📎 แนบบิล" อัปโหลดเอง + "📥 ดึงจากเมล")
 * อัปขึ้น bucket `invoices` (path <subId>/<month>/<file>) → อ่านยอด/วันที่จาก PDF → แถว subscription_invoices → audit
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAudit } from "@/lib/audit";
import { extractPdfFields } from "@/lib/parse-pdf-server";
import { invoiceFileKind, type SubInvoice } from "@/lib/subscriptions";

export const INVOICE_MAX_BYTES = 15 * 1024 * 1024; // 15MB
export const INVOICE_SIGNED_TTL = 60 * 60;          // 1 ชั่วโมง

export async function saveSubInvoice(db: SupabaseClient, opts: {
  subId: string; month: string; fileName: string; contentType: string; bytes: ArrayBuffer;
  actorId: string | null; gmailMessageId?: string | null; auditExtra?: Record<string, unknown>;
}): Promise<{ data: SubInvoice & { url: string | null } } | { error: string; status: number }> {
  const { subId, month, bytes } = opts;
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "กรุณาเลือกเดือน (YYYY-MM)", status: 400 };
  const kind = invoiceFileKind(opts.fileName, opts.contentType);
  if (!kind) return { error: "รองรับเฉพาะไฟล์ PDF หรือรูปภาพ (jpg/png/webp)", status: 400 };
  if (bytes.byteLength > INVOICE_MAX_BYTES) return { error: "ไฟล์ใหญ่เกิน 15MB", status: 400 };

  const safeName = (opts.fileName || (kind === "pdf" ? "invoice.pdf" : "invoice.jpg")).replace(/[^\w.\-() ]+/g, "_");
  const path = `${subId}/${month}/${safeName}`;

  const { error: upErr } = await db.storage.from("invoices")
    .upload(path, bytes, { upsert: true, contentType: kind === "pdf" ? "application/pdf" : (opts.contentType || "application/octet-stream") });
  if (upErr) return { error: `อัปโหลดไม่สำเร็จ: ${upErr.message}`, status: 500 };

  // อ่านข้อความใน PDF เก็บ ยอด/สกุลเงิน/วันที่ (best-effort) · รูปอ่านไม่ได้ → ปล่อยว่างให้กรอกเอง
  const parsed = kind === "pdf"
    ? await extractPdfFields(bytes)
    : { amount: null as number | null, currency: null as string | null, dateISO: null as string | null };

  const invId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const { data: row, error: dbErr } = await db.from("subscription_invoices").insert({
    id: invId, subscription_id: subId, month, file_name: safeName, file_path: path,
    amount: parsed.amount, currency: parsed.currency ?? "", invoice_date: parsed.dateISO, parsed_at: new Date().toISOString(),
    ...(opts.gmailMessageId ? { gmail_message_id: opts.gmailMessageId } : {}),
  }).select("*").single();
  if (dbErr || !row) return { error: dbErr?.message ?? "บันทึกไม่สำเร็จ", status: 500 };

  await writeAudit(db, {
    action: "attach", entityType: "subscription_invoices", entityId: null,
    actorId: opts.actorId, actorName: null,
    metadata: { sub_id: subId, month, file: safeName, ...(opts.auditExtra ?? {}) },
  });

  const { data: signed } = await db.storage.from("invoices").createSignedUrl(path, INVOICE_SIGNED_TTL);
  return { data: { ...(row as SubInvoice), url: signed?.signedUrl ?? null } };
}
