/**
 * 💴 ผูกบิลจีน ↔ ใบสั่งซื้อ (แอปโอนเงินจีน หน้า "ลงบิล" / รายละเอียดบิล)
 *   GET ?supplier_id=<id>[,<id>][&bill_id=<id>]  → { pos: ใบค้างจ่ายของร้าน (ทุกสกุล) + รายการของบิลนี้, similar: ร้านชื่อคล้ายที่มีใบค้าง (เมื่อร้านนี้ไม่มีใบ) }
 *   GET ?bill_id=<id>                            → { pos: ใบที่บิลนี้ผูกอยู่ }
 *   PUT { bill_id, links: [{ po_id, amount_rmb, settles_po?, currency_confirmed? }] } → แทนชุดเดิมทั้งหมด (ส่ง [] = เอาออกหมด)
 * สิทธิ์: app.china_pay (คนที่ใช้แอปโอนเงินจีนได้) · กติกา lib/china-bill-po · บันทึก lib/china-bill-po-server (+ audit)
 * สถานะจ่ายเงินของใบสั่งซื้อเปลี่ยนเองที่ DB (trigger) — API นี้ไม่แตะ payment_status ตรง ๆ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { loadBillLinkedPos, loadBillPoCandidates, saveBillLinks, similarShopsWithOpenPos } from "@/lib/china-bill-po-server";
import type { BillPoLinkInput } from "@/lib/china-bill-po";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "app.china_pay"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const supplierIds = (sp.get("supplier_id") ?? "").split(",").map((s) => s.trim()).filter((s) => UUID.test(s));
  const billId = UUID.test(sp.get("bill_id") ?? "") ? String(sp.get("bill_id")) : null;
  const admin = supabaseAdmin();
  try {
    if (!supplierIds.length) {
      if (!billId) return NextResponse.json({ pos: [], similar: [], error: "ระบุร้านหรือบิล" }, { status: 400 });
      return NextResponse.json({ pos: await loadBillLinkedPos(admin, billId), similar: [], error: null });
    }
    const pos = await loadBillPoCandidates(admin, { supplierIds, billId });
    const openHere = pos.some((p) => p.partner_id && supplierIds.includes(p.partner_id) && p.this_amount_rmb == null);
    const similar = !openHere && supplierIds.length === 1 ? await similarShopsWithOpenPos(admin, supplierIds[0]) : [];
    return NextResponse.json({ pos, similar, error: null });
  } catch (e) {
    return NextResponse.json({ pos: [], similar: [], error: String((e as Error).message ?? e) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "app.china_pay"); if (denied) return denied;
  let body: { bill_id?: string; links?: BillPoLinkInput[] };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, errors: ["ข้อมูลที่ส่งมาไม่ถูกต้อง"] }, { status: 400 }); }
  const billId = String(body.bill_id ?? "");
  if (!UUID.test(billId)) return NextResponse.json({ ok: false, errors: ["ไม่ระบุบิล"] }, { status: 400 });
  const links = Array.isArray(body.links) ? body.links.filter((l) => l && UUID.test(String(l.po_id ?? ""))) : [];
  if (links.length > 300) return NextResponse.json({ ok: false, errors: ["เลือกใบสั่งซื้อได้ไม่เกิน 300 ใบต่อบิล"] }, { status: 400 });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const res = await saveBillLinks(supabaseAdmin(), billId, links, { id: user?.id ?? null, name: user?.email ?? null });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
