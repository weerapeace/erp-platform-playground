/**
 * POST /api/subscriptions/mail-bills { sub_id, month } — ค้นเมลบิลของรายการ+เดือนนี้ในกล่อง Gmail ที่เชื่อมไว้ (subscriptions.edit)
 * คืนรายการเมล + ไฟล์แนบที่ใช้เป็นบิลได้ (PDF/รูป) พร้อมยอดที่อ่านจาก PDF ให้ดูก่อนตัดสินใจ — ยังไม่แนบอะไร
 * (แนบจริงที่ /mail-bills/attach หลังผู้ใช้กดยืนยัน) · คำค้นเดียวกับปุ่ม 🔍 หาในเมล (lib/gmail-search)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { gmailAttachmentBytes, gmailGetMessage, gmailSearch, type GmailMessage } from "@/lib/gmail-api";
import { gmailSearchQuery, gmailSearchUrl, type MailBillMessage } from "@/lib/gmail-search";
import { extractPdfFields } from "@/lib/parse-pdf-server";
import { invoiceFileKind } from "@/lib/subscriptions";
import { loadMailContext } from "@/lib/subscription-mail-bills-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MESSAGES = 10;
const MAX_PARSE = 6;                 // อ่านยอดจาก PDF สูงสุดกี่ไฟล์ต่อการค้น (กันช้า)
const PARSE_MAX_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 20 * 1024;   // รูปเล็กกว่านี้ = โลโก้/ลายเซ็นในเมล ไม่ใช่บิล

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;

  let body: { sub_id?: string; month?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const month = String(body.month ?? "");
  if (!body.sub_id || !/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "ต้องระบุรายการและเดือน" }, { status: 400 });

  const db = supabaseAdmin();
  const ctx = await loadMailContext(request, db, body.sub_id);
  if ("res" in ctx) return ctx.res;
  const { sub, email, token, uid } = ctx;

  const q = gmailSearchQuery(sub, month);
  const found = await gmailSearch(token, q, MAX_MESSAGES);
  if (found.error) return NextResponse.json({ error: `ค้นเมลไม่สำเร็จ: ${found.error}` }, { status: 502 });
  const msgs = (await Promise.all(found.ids.map((id) => gmailGetMessage(token, id)))).filter((m): m is GmailMessage => !!m);

  // ไฟล์ที่เคยแนบจากเมลเหล่านี้แล้ว (เลขเมล + ชื่อไฟล์)
  const attachedKeys = new Set<string>();
  if (found.ids.length) {
    const { data: inv } = await db.from("subscription_invoices").select("gmail_message_id, file_name")
      .eq("subscription_id", sub.id).in("gmail_message_id", found.ids);
    (inv ?? []).forEach((r) => attachedKeys.add(`${r.gmail_message_id}|${r.file_name}`));
  }
  const safe = (n: string) => n.replace(/[^\w.\-() ]+/g, "_"); // ชื่อไฟล์แบบที่ saveSubInvoice เก็บ

  let parseBudget = MAX_PARSE;
  const items: MailBillMessage[] = await Promise.all(msgs.map(async (m) => {
    const usable = m.attachments.filter((a) => {
      const kind = invoiceFileKind(a.filename, a.mimeType);
      return kind === "pdf" || (kind === "image" && a.size >= MIN_IMAGE_BYTES);
    });
    const files = await Promise.all(usable.map(async (a) => {
      const kind = invoiceFileKind(a.filename, a.mimeType) as "pdf" | "image";
      let parsed: { amount: number | null; currency: string | null; dateISO: string | null } | null = null;
      if (kind === "pdf" && a.size <= PARSE_MAX_BYTES && parseBudget > 0) {
        parseBudget--;
        const bytes = await gmailAttachmentBytes(token, m.id, a);
        if (bytes) parsed = await extractPdfFields(bytes.slice().buffer).catch(() => null);
      }
      return {
        part_id: a.partId, filename: a.filename, mime: a.mimeType, size: a.size, kind,
        amount: parsed?.amount ?? null, currency: parsed?.currency ?? null, date: parsed?.dateISO ?? null,
        attached: attachedKeys.has(`${m.id}|${safe(a.filename)}`),
      };
    }));
    return { message_id: m.id, subject: m.subject, from: m.from, date: m.date, snippet: m.snippet, files };
  }));

  await writeAudit(db, {
    action: "mail_search", entityType: "subscriptions", entityId: null, actorId: uid, actorName: null,
    metadata: { sub_id: sub.id, name: sub.name, month, email, found: items.length },
  });
  return NextResponse.json({ email, query: q, gmail_url: gmailSearchUrl(sub, month), data: items, error: null });
}
