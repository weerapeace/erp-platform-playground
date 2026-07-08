/**
 * /api/subscriptions/invoices/parse-existing — อ่าน PDF ใบเสร็จที่แนบไว้แล้ว (ย้อนหลัง) (subscriptions.edit)
 * POST → อ่านทีละชุด (BATCH) เฉพาะใบที่ยังไม่เคยอ่าน (parsed_at is null)
 *        ดาวน์โหลดจาก Storage → unpdf → เก็บ amount/currency/invoice_date · คืนจำนวนที่เหลือ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { extractPdfFields } from "@/lib/parse-pdf-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const BATCH = 20;

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;
  const { data: auth } = await supabaseFromRequest(request).auth.getUser();
  const db = supabaseAdmin();

  const { data: rows, error } = await db.from("subscription_invoices")
    .select("id, file_path").is("parsed_at", null).limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0, withData = 0;
  for (const r of rows ?? []) {
    const nowIso = new Date().toISOString();
    try {
      const { data: blob } = await db.storage.from("invoices").download(r.file_path as string);
      const parsed = blob
        ? await extractPdfFields(await blob.arrayBuffer())
        : { amount: null as number | null, currency: "" as string | null, dateISO: null as string | null };
      await db.from("subscription_invoices").update({
        amount: parsed.amount, currency: parsed.currency ?? "", invoice_date: parsed.dateISO, parsed_at: nowIso,
      }).eq("id", r.id);
      if (parsed.amount != null || parsed.dateISO) withData++;
    } catch {
      await db.from("subscription_invoices").update({ parsed_at: nowIso }).eq("id", r.id); // mark กันวนซ้ำ
    }
    processed++;
  }

  const { count: remaining } = await db.from("subscription_invoices")
    .select("id", { count: "exact", head: true }).is("parsed_at", null);

  await writeAudit(db, {
    action: "parse_invoices", entityType: "subscription_invoices", entityId: null,
    actorId: auth?.user?.id ?? null, actorName: null, metadata: { processed, withData },
  });
  return NextResponse.json({ processed, withData, remaining: remaining ?? 0, error: null });
}
