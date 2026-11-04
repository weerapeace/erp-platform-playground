/**
 * GET /api/china-pay/voucher-prefill?id=<ใบสำคัญรับ id> — ข้อมูลเติมหน้า "ลงบิล" แอปโอนเงินจีน (ปุ่ม "ส่งไปโอนเงินจีน" ในใบสำคัญรับ)
 * คืน { supplier_id, supplier_name, currency, amount_rmb, pos: [{ po_id, po_no, amount_rmb }], attachments: [r2 key], skipped_files, pv_no }
 *   ยอด ¥ = ยอดบิลร้านที่ AI อ่าน (สกุลหยวน) ถ้ามี · ไม่มี = ยอดสินค้าในใบสำคัญ (subtotal_foreign) — ใบสกุลบาท = 0 (ให้คนกรอก)
 *   ใบสั่งซื้อ = จากบรรทัดใบสำคัญ (ยอด qty × ราคา ¥ ต่อใบ) · ใบสกุลบาทไม่ใส่ยอด (หน้าลงบิลให้ติ๊กยืนยันเอง)
 *   รูปบิลร้าน = เฉพาะไฟล์ R2 (หน้าแอปเปิดได้) · ไฟล์ที่เก็บที่อื่น (sb:) นับเป็น skipped_files → หมายเหตุชี้ไปใบสำคัญรับ
 * สิทธิ์: app.china_pay (อ่านอย่างเดียว ไม่แก้อะไร)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { parseFileRef } from "@/lib/file-ref";
import { isRmbCurrency } from "@/lib/china-bill-po";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => String(v ?? "").trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "app.china_pay"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ data: null, error: "ไม่ระบุใบสำคัญรับ" }, { status: 400 });
  const admin = supabaseAdmin();

  const { data: v } = await admin.from("purchase_vouchers_v2")
    .select("id, pv_no, status, seller_name, seller_partner_id, currency, subtotal_foreign, is_active").eq("id", id).maybeSingle();
  if (!v || (v as Row).is_active === false) return NextResponse.json({ data: null, error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  const pv = v as Row;
  const vRmb = isRmbCurrency(pv.currency as string);

  const [{ data: lines }, { data: bills }] = await Promise.all([
    admin.from("purchase_voucher_lines_v2").select("po_id, po_no, qty, unit_price").eq("voucher_id", id).not("is_active", "is", false),
    admin.from("purchase_delivery_bills").select("r2_key, kind, total_amount, currency").eq("voucher_id", id).not("is_active", "is", false).order("created_at"),
  ]);

  // ยอดต่อใบสั่งซื้อ (สกุลของใบสำคัญ)
  const byPo = new Map<string, { po_no: string; amount: number }>();
  for (const l of (lines ?? []) as Row[]) {
    const poId = str(l.po_id); if (!poId) continue;
    const e = byPo.get(poId) ?? { po_no: str(l.po_no), amount: 0 };
    e.amount += num(l.qty) * num(l.unit_price);
    byPo.set(poId, e);
  }
  // ใบสั่งซื้อสกุลบาท → ไม่ส่งยอด (ห้ามแปลงอัตโนมัติ)
  const poIds = [...byPo.keys()];
  const curByPo = new Map<string, string>();
  if (poIds.length) {
    const { data: pos } = await admin.from("purchase_orders_v2").select("id, currency").in("id", poIds);
    for (const p of (pos ?? []) as Row[]) curByPo.set(str(p.id), str(p.currency));
  }
  const pos = poIds.map((poId) => {
    const e = byPo.get(poId)!;
    const poRmb = isRmbCurrency(curByPo.get(poId));
    return { po_id: poId, po_no: e.po_no, amount_rmb: vRmb && poRmb ? r2(e.amount) : 0 };
  });

  const billRows = (bills ?? []) as Row[];
  const sellerRmb = billRows.filter((b) => str(b.kind) === "seller" && isRmbCurrency(b.currency as string) && num(b.total_amount) > 0);
  const amount = sellerRmb.length ? r2(sellerRmb.reduce((a, b) => a + num(b.total_amount), 0)) : vRmb ? r2(num(pv.subtotal_foreign)) : 0;

  const attachments: string[] = [];
  let skipped = 0;
  // บิลร้านก่อน แล้วใบส่งของ
  for (const b of [...billRows.filter((x) => str(x.kind) === "seller"), ...billRows.filter((x) => str(x.kind) !== "seller")]) {
    const ref = str(b.r2_key); if (!ref || attachments.includes(ref)) continue;
    if (parseFileRef(ref)?.provider === "r2") attachments.push(ref); else skipped += 1;
  }

  let supplierName: string | null = (pv.seller_name as string) ?? null;
  if (pv.seller_partner_id) {
    const { data: p } = await admin.from("partners_v2").select("name_th, display_name").eq("id", str(pv.seller_partner_id)).maybeSingle();
    if (p) supplierName = str((p as Row).name_th) || str((p as Row).display_name) || supplierName;
  }

  return NextResponse.json({
    data: {
      pv_no: str(pv.pv_no), status: str(pv.status), currency: str(pv.currency),
      supplier_id: (pv.seller_partner_id as string) ?? null, supplier_name: supplierName,
      amount_rmb: amount, pos, attachments, skipped_files: skipped,
    },
    error: null,
  });
}
