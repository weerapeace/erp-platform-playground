/**
 * GET /api/purchasing/calendar?mode=in|pay — รายการ PO สำหรับปฏิทินจัดซื้อ
 *   in  = ของเข้า (PO ที่สั่งแล้วยังรับไม่ครบ · date = expected_date)
 *   pay = จ่ายเงิน (PO ที่ยังไม่จ่าย · date = payment_due_date)
 * POST /api/purchasing/calendar — อัปเดตวัน/ติดตาม { id, expected_date?, payment_due_date?, follow_up? }
 * ของกลาง: guardApi + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());

export type PoCalItem = {
  id: string; po_no: string; seller_name: string | null;
  date: string | null; amount_thb: number; currency: string | null;
  follow_up: boolean; payment_status: string | null; status: string | null;
};
export type PoCalResponse = { data: PoCalItem[]; error: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const mode = new URL(request.url).searchParams.get("mode") === "pay" ? "pay" : "in";
  const admin = supabaseAdmin();

  const rateRes = await admin.from("daily_rates").select("rate").order("rate_date", { ascending: false }).limit(1).maybeSingle();
  const rmb = num((rateRes.data as { rate?: number } | null)?.rate) || 5;

  let q = admin.from("purchase_orders_v2")
    .select("id, po_no, seller_name, grand_total, currency, expected_date, payment_due_date, follow_up, payment_status, status, order_date")
    .eq("is_active", true).neq("status", "cancelled").limit(2000);
  q = mode === "pay" ? q.eq("payment_status", "unpaid").neq("status", "draft")
                     : q.in("status", ["purchase", "partial"]);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const items: PoCalItem[] = ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id), po_no: String(p.po_no ?? "—"), seller_name: (p.seller_name as string) ?? null,
    date: (mode === "pay" ? (p.payment_due_date as string) : (p.expected_date as string)) ?? null,
    amount_thb: Math.round(num(p.grand_total) * (isCNY(p.currency) ? rmb : 1)),
    currency: (p.currency as string) ?? null,
    follow_up: !!p.follow_up, payment_status: (p.payment_status as string) ?? null, status: (p.status as string) ?? null,
  }));
  return NextResponse.json({ data: items, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { id?: string; expected_date?: string | null; payment_due_date?: string | null; follow_up?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = body.id;
  if (!id) return NextResponse.json({ error: "ไม่ระบุใบสั่งซื้อ" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.expected_date !== undefined)     patch.expected_date = body.expected_date || null;
  if (body.payment_due_date !== undefined)  patch.payment_due_date = body.payment_due_date || null;
  if (body.follow_up !== undefined)         patch.follow_up = body.follow_up === true;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("purchase_orders_v2").update(patch).eq("id", id).select("id, po_no").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, {
    action: "update", entityType: "purchase_orders_v2", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { po_no: data?.po_no, ...patch },
  });
  return NextResponse.json({ ok: true, error: null });
}
