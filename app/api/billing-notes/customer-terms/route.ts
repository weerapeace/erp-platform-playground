import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { parseCreditTerm, salesCreditTermOf } from "@/lib/credit-term";

/**
 * เครดิตลูกค้า สำหรับหน้าใบวางบิล (เจ้าของสั่ง 2026-11-03: "กำหนดชำระดึงจากเครดิตลูกค้า ถ้าไม่มีมีปุ่มให้เพิ่มและบันทึกกลับ")
 *   GET   ?ids=<uuid,...>                  → [{ id, term }]  (term = รูปแบบ lib/credit-term · null = ยังไม่ตั้ง) · so.view
 *   PATCH { customer_id, term }            → บันทึกกลับทะเบียนลูกค้า partners_v2.sales_credit_term · so.edit · audit
 *   ช่องเดียวกับหน้าตั้งเครดิตรวม /cashflow/credit-terms (ที่นั่นต้องสิทธิ์กระแสเงินสด — ฝ่ายขายอาจไม่มี จึงแยกทางเข้านี้)
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "so.view");
  if (denied) return denied;
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s)))].slice(0, 500);
  if (!ids.length) return NextResponse.json({ data: [], error: null });
  const { data, error } = await supabaseAdmin().from("partners_v2")
    .select("id, sales_credit_term, payment_terms_days").in("id", ids);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({
    data: (data ?? []).map((p) => ({ id: String(p.id), term: salesCreditTermOf(p) })),
    error: null,
  });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "so.edit");
  if (denied) return denied;
  let body: { customer_id?: string; term?: string | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const id = typeof body.customer_id === "string" && UUID_RE.test(body.customer_id) ? body.customer_id : null;
  if (!id) return NextResponse.json({ error: "ไม่พบลูกค้า" }, { status: 400 });
  const term = body.term === null || body.term === "" || body.term === undefined ? null : String(body.term);
  if (term !== null && !parseCreditTerm(term)) return NextResponse.json({ error: "รูปแบบเครดิตไม่ถูกต้อง" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("partners_v2").select("sales_credit_term, display_name, name_th").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบลูกค้าในทะเบียน" }, { status: 404 });
  // ไม่แตะ payment_terms_days เดิม (คู่ค้าบางรายเป็นทั้งลูกค้า/ร้านค้า — กติกาเดียวกับ /api/cashflow/credit-terms)
  const { error } = await admin.from("partners_v2").update({ sales_credit_term: term }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "update", entityType: "partners_v2", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: {
      what: "ตั้งเครดิตลูกค้า (จากหน้าใบวางบิล)", name: before.display_name || before.name_th,
      changes: [{ field: "sales_credit_term", label: "เครดิตลูกค้า", old: before.sales_credit_term ?? null, new: term }],
    },
  });
  return NextResponse.json({ data: { id, term }, error: null });
}
