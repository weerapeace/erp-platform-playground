/**
 * GET  /api/china-pay/balance — ยอดเงินคงเหลือที่จีน (¥/฿) + ประวัติปรับยอดล่าสุด
 * POST /api/china-pay/balance — บันทึกการปรับยอด (set/topup/adjust)
 *   body: { kind: 'set'|'topup'|'adjust', amount_rmb: number, amount_thb?: number, note?: string, actor?: string }
 *   หมายเหตุ: 'set' ฝั่ง client คำนวณ delta = ยอดที่ตั้ง − ยอดปัจจุบัน มาแล้ว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const { data, error } = await client.rpc("china_balance_current");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ประวัติล่าสุด (อ่านผ่าน service role — ตารางถูกล็อก RLS)
  const { data: hist } = await supabaseAdmin()
    .from("china_balance_adjustments")
    .select("id, kind, amount_rmb, amount_thb, note, actor, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const bal = (data ?? { rmb: 0, thb: 0 }) as { rmb: number; thb: number };
  return NextResponse.json({ ...bal, adjustments: hist ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { kind?: string; amount_rmb?: number; amount_thb?: number; note?: string; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await client.rpc("china_balance_add", {
    p_kind:       String(body.kind ?? "adjust"),
    p_amount_rmb: Number(body.amount_rmb ?? 0),
    p_amount_thb: Number(body.amount_thb ?? 0),
    p_note:       body.note ?? null,
    p_actor:      body.actor ?? user.email ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bal = (data ?? { rmb: 0, thb: 0 }) as { rmb: number; thb: number };
  return NextResponse.json({ ...bal, error: null });
}
