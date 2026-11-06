/**
 * POST /api/purchasing/pr-quick — บันทึกด่วนบนใบขอซื้อ จากป๊อปอัป "รายการรอซื้อ"
 *   { id, mark_ordered?, qty?, purchase_url? }
 *     mark_ordered=true → order_date = วันนี้ (จดว่า "สั่งแล้ว" · สถานะคงเดิม)
 *     qty (number)      → อัปเดตจำนวนที่สั่งจริง (ถ้าส่งมา)
 *     purchase_url      → ตั้ง/ล้างลิงก์สั่งซื้อ ("" = ล้าง)
 *
 * ของกลาง: guardApi(products.edit) + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { todayBangkok } from "@/lib/date";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { id?: string; mark_ordered?: boolean; qty?: number | null; purchase_url?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = body.id;
  if (!id) return NextResponse.json({ error: "ไม่ระบุใบขอซื้อ" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.mark_ordered) patch.order_date = todayBangkok();   // วันนี้ตามเวลาไทย (เดิมใช้เวลาสากล → ช่วงตี 0–7 ได้ "เมื่อวาน")
  if (body.qty !== undefined && body.qty !== null) {
    const q = Number(body.qty);
    if (!isFinite(q) || q < 0) return NextResponse.json({ error: "จำนวนไม่ถูกต้อง" }, { status: 400 });
    patch.qty = q;
  }
  if (body.purchase_url !== undefined) {
    const url = String(body.purchase_url ?? "").trim();
    if (url && !/^https?:\/\//i.test(url)) return NextResponse.json({ error: "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
    patch.purchase_url = url || null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้" }, { status: 400 });

  const admin = supabaseAdmin();
  // ค่าเดิมก่อนแก้ → ประวัติบอก "จากอะไรเป็นอะไร" (อ่านไม่ได้ก็ยังบันทึกต่อ)
  const { data: prev } = await admin.from("purchase_requests_v2").select(Object.keys(patch).join(",")).eq("id", id).maybeSingle();
  const { data, error } = await admin.from("purchase_requests_v2").update(patch).eq("id", id).select("id, pr_no, item_name").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "update", entityType: "purchase_requests_v2", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: {
      via: "pr-quick", pr_no: data?.pr_no, item_name: data?.item_name, ...patch,
      ...(prev ? { changes: auditDiff(prev as unknown as Record<string, unknown>, patch) } : {}),
    },
  });
  return NextResponse.json({ ok: true, error: null });
}
