/**
 * POST /api/purchasing/seller-bills/create { items: CreateFromBillInput[] } — สร้างใบสำคัญร่างจากบิลร้าน (ร้านที่คนยืนยันแล้ว)
 *   1 รายการ = 1 ใบ (รูปเดียวมีหลายร้าน = หลายใบ) · ใบละ: ใบสำคัญร่าง + บิลร้าน kind=seller + จับคู่รายการกับ PO ของร้านนั้น
 *   + จำชื่อจีน/เบอร์/บัญชีของร้าน (เฉพาะช่องที่ว่าง) · ล้มบางใบ = ใบอื่นยังสร้าง (แจ้งรายใบ)
 * logic: lib/seller-bill-intake.ts · สิทธิ์ products.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isRefForCategory } from "@/lib/file-ref";
import { normalizeBillLine } from "@/lib/seller-bill-match";
import { createVoucherFromSellerBill, MAX_INTAKE_FILES, type CreateFromBillInput } from "@/lib/seller-bill-intake";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 90;
type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "").trim();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { items?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const items = Array.isArray(body.items) ? (body.items as Row[]) : [];
  if (items.length === 0) return NextResponse.json({ error: "ไม่ได้เลือกบิลที่จะออกใบ" }, { status: 400 });
  if (items.length > 10) return NextResponse.json({ error: "ออกได้ครั้งละไม่เกิน 10 ใบ" }, { status: 400 });
  const admin = supabaseAdmin();
  const actor = { id: user?.id ?? null, name: (user?.user_metadata?.name as string) || user?.email || null };
  const created: { voucher_id: string; ok: number; mid: number; no: number; shop_filled: string[] }[] = [];
  const errors: string[] = [];
  for (const [i, it] of items.entries()) {
    const refs = Array.isArray(it.refs) ? (it.refs as unknown[]).map(str).filter(Boolean).slice(0, MAX_INTAKE_FILES) : [];
    if (!str(it.partner_id)) { errors.push(`บิลที่ ${i + 1}: ยังไม่ได้เลือกร้าน`); continue; }
    if (refs.length === 0 || refs.some((r) => !isRefForCategory(r, "supplier_bills"))) { errors.push(`บิลที่ ${i + 1}: ไฟล์แนบไม่ถูกต้อง`); continue; }
    const input: CreateFromBillInput = {
      partner_id: str(it.partner_id), refs, currency: str(it.currency) || null,
      bill_no: str(it.bill_no) || null, bill_date: str(it.bill_date) || null, seller_text: str(it.seller_text) || null,
      seller_phone: str(it.seller_phone) || null, seller_account: str(it.seller_account) || null,
      total_amount: it.total_amount == null || it.total_amount === "" ? null : Number(it.total_amount),
      lines: (Array.isArray(it.lines) ? (it.lines as Row[]) : []).map((l) => ({ ...normalizeBillLine(l), decision: null, manual: false, voucher_line_ids: [] })),
      remember_shop: it.remember_shop !== false,
    };
    try { created.push(await createVoucherFromSellerBill(admin, input, actor)); }
    catch (e) { errors.push(`บิลที่ ${i + 1}: ${String((e as Error).message ?? e)}`); }
  }
  if (created.length === 0) return NextResponse.json({ error: errors.join(" · ") || "สร้างใบไม่สำเร็จ" }, { status: 400 });
  return NextResponse.json({ ok: true, created, errors, error: null });
}
