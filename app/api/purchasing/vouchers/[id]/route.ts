/**
 * ใบสำคัญรับ 1 ใบ
 *   GET    /api/purchasing/vouchers/<id>   → หัวใบ + รายการ (พร้อมรหัส/รูป/ค่าจากตัวแม่) — หน้าเว็บ + หน้าพิมพ์ใช้
 *   PATCH  /api/purchasing/vouchers/<id>   → บันทึกร่าง { header?: {...}, lines?: [{ id, unit_price?, cbm_per_unit?, kg_per_unit? }] } แล้วคิดใหม่ทั้งใบ
 *   DELETE /api/purchasing/vouchers/<id>   → ยกเลิกใบร่าง (ปล่อยใบรับ GR กลับไปคิว)
 * แก้ได้เฉพาะสถานะ draft — ยืนยันแล้วให้ดูอย่างเดียว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { fetchVoucher, recomputeVoucher, SHIP_METHODS } from "@/lib/purchase-voucher-server";
import type { ShipMethod } from "@/lib/landed-cost";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const optNum = (v: unknown): number | null => (v === null || v === "" || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.cost.view"); if (denied) return denied;
  const { id } = await params;
  const v = await fetchVoucher(supabaseAdmin(), id);
  if (!v) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  return NextResponse.json({ data: v, error: null });
}

type PatchBody = {
  header?: { voucher_date?: string; currency?: string; fx_rate?: unknown; ship_method?: string; ship_rate?: unknown; ship_manual_total?: unknown; note?: string | null; seller_name?: string };
  lines?: { id: string; unit_price?: unknown; cbm_per_unit?: unknown; kg_per_unit?: unknown }[];
};

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("purchase_vouchers_v2").select("id, status").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  if ((cur as { status: string }).status !== "draft") return NextResponse.json({ error: "ใบนี้ยืนยันแล้ว แก้ไม่ได้" }, { status: 400 });

  let body: PatchBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (body.header) {
    const h = body.header; const patch: Record<string, unknown> = {};
    if (h.voucher_date !== undefined && h.voucher_date) patch.voucher_date = h.voucher_date;
    if (h.currency !== undefined && h.currency) patch.currency = String(h.currency).toUpperCase();
    if (h.fx_rate !== undefined) patch.fx_rate = optNum(h.fx_rate);
    if (h.ship_method !== undefined) {
      if (!SHIP_METHODS.includes(h.ship_method as ShipMethod)) return NextResponse.json({ error: "วิธีคิดค่าส่งไม่ถูกต้อง" }, { status: 400 });
      patch.ship_method = h.ship_method;
    }
    if (h.ship_rate !== undefined) patch.ship_rate = optNum(h.ship_rate);
    if (h.ship_manual_total !== undefined) patch.ship_manual_total = optNum(h.ship_manual_total);
    if (h.note !== undefined) patch.note = h.note ? String(h.note) : null;
    if (h.seller_name !== undefined) patch.seller_name = String(h.seller_name ?? "").trim() || null;
    if (Object.keys(patch).length) {
      const { error } = await admin.from("purchase_vouchers_v2").update(patch).eq("id", id);
      if (error) return NextResponse.json({ error: "บันทึกหัวใบไม่สำเร็จ: " + error.message }, { status: 400 });
    }
  }
  if (Array.isArray(body.lines)) {
    for (const l of body.lines) {
      if (!l?.id) continue;
      const patch: Record<string, unknown> = {};
      if (l.unit_price !== undefined) {
        const p = optNum(l.unit_price);
        if (p != null && p < 0) return NextResponse.json({ error: "ราคาติดลบไม่ได้" }, { status: 400 });
        patch.unit_price = p != null && p > 0 ? p : null;
        patch.price_source = p != null && p > 0 ? "manual" : "none";
      }
      if (l.cbm_per_unit !== undefined) patch.cbm_per_unit = optNum(l.cbm_per_unit);
      if (l.kg_per_unit !== undefined) patch.kg_per_unit = optNum(l.kg_per_unit);
      if (Object.keys(patch).length) {
        const { error } = await admin.from("purchase_voucher_lines_v2").update(patch).eq("id", String(l.id)).eq("voucher_id", id);
        if (error) return NextResponse.json({ error: "บันทึกรายการไม่สำเร็จ: " + error.message }, { status: 400 });
      }
    }
  }
  await recomputeVoucher(admin, id);
  const v = await fetchVoucher(admin, id);
  return NextResponse.json({ ok: true, data: v, error: null });
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("purchase_vouchers_v2").select("id, status, pv_no").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  if ((cur as { status: string }).status !== "draft") return NextResponse.json({ error: "ยกเลิกได้เฉพาะใบร่าง (ใบที่ยืนยันแล้วเขียนราคากลับระบบไปแล้ว)" }, { status: 400 });
  // ปล่อยใบรับกลับคิว + ปิดใบร่าง
  await admin.from("goods_receipts_v2").update({ voucher_id: null }).eq("voucher_id", id);
  const { error } = await admin.from("purchase_vouchers_v2").update({ status: "cancelled", is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, { action: "cancel", entityType: "purchase_vouchers_v2", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { note: "ยกเลิกใบร่าง ปล่อย GR กลับคิว" } });
  return NextResponse.json({ ok: true, error: null });
}
