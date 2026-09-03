/**
 * POST /api/loan-restructure/revert
 * body: { id, force? }
 * ย้อนกลับการปรับโครงสร้างหนี้ "ครั้งล่าสุด" — คืนเงื่อนไขเดิม + ตารางผ่อนเวอร์ชันก่อน
 * ถ้ามีใบจ่ายหลังวันมีผล DB จะตอบ PAYMENTS_AFTER:<n> → หน้าจอให้พิมพ์ CONFIRM แล้วส่ง force=true
 * สิทธิ์ loan_contracts.restructure
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_contracts.restructure");
  if (denied) return denied;

  let body: { id?: string; force?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 400 });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();

  const { data: rs } = await admin.from("loan_restructurings").select("loan_contract_id, seq_no, effective_date").eq("id", id).maybeSingle();

  const { data, error } = await admin.rpc("loan_restructure_revert", { p_id: id, p_force: body.force === true, p_actor: user?.id ?? null });
  if (error) {
    const m = /PAYMENTS_AFTER:(\d+)/.exec(error.message);
    if (m) return NextResponse.json({ error: "payments_after", payments_after: Number(m[1]) }, { status: 409 });
    console.error("[loan-restructure] revert failed:", error.message);
    return NextResponse.json({ error: error.message.replace(/^.*?:\s*/, "") || "ย้อนกลับไม่สำเร็จ" }, { status: 400 });
  }

  await writeAudit(admin, {
    action: "restructure_revert", entityType: "loan_contracts", entityId: rs?.loan_contract_id ?? null,
    actorId: user?.id ?? null,
    actorName: String(user?.user_metadata?.display_name ?? user?.email ?? ""),
    metadata: { restructuring_id: id, seq_no: rs?.seq_no ?? null, effective_date: rs?.effective_date ?? null, force: body.force === true },
  });
  return NextResponse.json({ data, error: null });
}
