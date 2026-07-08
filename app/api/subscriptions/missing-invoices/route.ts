/**
 * /api/subscriptions/missing-invoices — บิลที่ยังขาด (subscriptions.view)
 *
 * GET  → รายการ (sub × เดือน) ที่ "ควรมีใบเสร็จ" แต่ยังไม่มี และยังไม่ถูกข้าม
 *        เกณฑ์ sub: active + type=work + billing_cycle=monthly · หน้าต่าง 3 เดือนล่าสุด
 *        เดือนปัจจุบันนับเฉพาะเมื่อเลยวันเรียกเก็บแล้ว (กันเตือนก่อนบิลออก)
 * POST → { subscription_id, month, action:'skip'|'unskip' } (subscriptions.edit)
 *        skip = บันทึกว่า "เดือนนี้ไม่มีบิล" → หยุดเตือน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export type MissingInvoice = {
  subscription_id: string;
  name: string;
  month: string;
  chrome_profile: string;
  chrome_profile_dir: string;
  account_email: string;
  invoice_url: string;
};

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;

  const db = supabaseAdmin();
  const { data: subs, error } = await db.from("subscriptions")
    .select("id, name, billing_date, invoice_url, chrome_profile, chrome_profile_dir, account_email")
    .eq("active", true).eq("type", "work").eq("billing_cycle", "monthly");
  if (error) return NextResponse.json({ data: [], months: [], error: error.message }, { status: 500 });

  const now = new Date();
  const curMonth = ym(now);
  const today = now.getDate();
  const months = [0, 1, 2].map((i) => ym(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const subIds = (subs ?? []).map((s) => s.id as string);

  // ใบเสร็จ + รายการที่ข้าม ในหน้าต่างเดือน
  const have = new Set<string>();
  const skipped = new Set<string>();
  if (subIds.length) {
    const [{ data: invs }, { data: skips }] = await Promise.all([
      db.from("subscription_invoices").select("subscription_id, month").in("subscription_id", subIds).in("month", months),
      db.from("subscription_invoice_skips").select("subscription_id, month").in("subscription_id", subIds).in("month", months),
    ]);
    (invs ?? []).forEach((r) => have.add(`${r.subscription_id}|${r.month}`));
    (skips ?? []).forEach((r) => skipped.add(`${r.subscription_id}|${r.month}`));
  }

  const missing: MissingInvoice[] = [];
  for (const s of subs ?? []) {
    const billingDay = s.billing_date ? Number(String(s.billing_date).slice(8, 10)) : null;
    for (const month of months) {
      // เดือนปัจจุบัน: ควรมีบิลก็ต่อเมื่อเลยวันเรียกเก็บแล้ว (ไม่มีวันเรียกเก็บ → ข้ามเดือนปัจจุบัน)
      if (month === curMonth) {
        if (billingDay == null || today < billingDay) continue;
      }
      const key = `${s.id}|${month}`;
      if (have.has(key) || skipped.has(key)) continue;
      missing.push({
        subscription_id: s.id as string,
        name: (s.name as string) ?? "",
        month,
        chrome_profile: (s.chrome_profile as string) ?? "",
        chrome_profile_dir: (s.chrome_profile_dir as string) ?? "",
        account_email: (s.account_email as string) ?? "",
        invoice_url: (s.invoice_url as string) ?? "",
      });
    }
  }
  missing.sort((a, b) => (b.month.localeCompare(a.month)) || a.name.localeCompare(b.name));

  return NextResponse.json({ data: missing, months, error: null });
}

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;

  let body: { subscription_id?: string; month?: string; action?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { subscription_id, month, action } = body;
  if (!subscription_id || !/^\d{4}-\d{2}$/.test(month ?? "")) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const { data: auth } = await supabaseFromRequest(request).auth.getUser();
  const db = supabaseAdmin();

  if (action === "unskip") {
    const { error } = await db.from("subscription_invoice_skips").delete().eq("subscription_id", subscription_id).eq("month", month!);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await db.from("subscription_invoice_skips")
      .upsert({ subscription_id, month, created_by: auth?.user?.id ?? null }, { onConflict: "subscription_id,month" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAudit(db, {
    action: action === "unskip" ? "unskip_bill" : "skip_bill",
    entityType: "subscription_invoice_skips", entityId: null,
    actorId: auth?.user?.id ?? null, actorName: null,
    metadata: { sub_id: subscription_id, month },
  });
  return NextResponse.json({ ok: true, error: null });
}
