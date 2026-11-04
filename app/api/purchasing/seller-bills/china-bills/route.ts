/**
 * ออกใบสำคัญรับจากบิลโอนเงินจีน (ป๊อป ＋ ออกใบสำคัญรับ แท็บ "จากบิลโอนเงินจีน")
 *   GET  /api/purchasing/seller-bills/china-bills            → บิลโอน (ไม่รวมยกเลิก) + ร้าน + รูปบิล + PO ที่ผูก + ใบที่ออกแล้ว
 *   POST { bill_id, blank_if_none? }                         → 1 บิล = 1 ใบสำคัญร่าง (หน้าเว็บเรียกทีละบิลเมื่อเลือกหลายบิล + แถบความคืบหน้า)
 * logic: lib/china-bill-voucher.ts · อ่าน = products.cost.view · สร้าง = products.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { listChinaBillsForVoucher, createVoucherFromChinaBill } from "@/lib/china-bill-voucher";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 90;   // AI อ่านรูปบิล

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.cost.view"); if (denied) return denied;
  try { return NextResponse.json({ data: await listChinaBillsForVoucher(supabaseAdmin()), error: null }); }
  catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 }); }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { bill_id?: string; blank_if_none?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const billId = String(body.bill_id ?? "").trim();
  if (!billId) return NextResponse.json({ error: "ไม่ระบุบิล" }, { status: 400 });
  try {
    const r = await createVoucherFromChinaBill(supabaseAdmin(), billId, { blankIfNone: body.blank_if_none === true, actor: { id: user?.id ?? null, name: (user?.user_metadata?.name as string) || user?.email || null } });
    return NextResponse.json({ ok: true, data: r, error: null });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 });
  }
}
