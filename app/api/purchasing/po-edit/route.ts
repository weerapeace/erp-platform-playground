/**
 * PATCH /api/purchasing/po-edit — แก้ไขใบสั่งซื้อ (หัวใบ + รายการสินค้า + ภาษี) ในครั้งเดียว
 *
 * body: {
 *   po_id: string,
 *   header?: { seller_name?, seller_partner_id?, order_date?, expected_date?, note?, currency?, vat_rate?, vat_included? },
 *   lines?:  [{ id?, item_sku_id?, item_name, qty, uom?, price? }]   // ส่งมา = แทนที่ทั้งชุด (ไม่ส่ง = ไม่แตะ)
 * }
 *
 * กันพลาดกับของที่รับเข้ามาแล้ว (สำคัญ — ไม่งั้นสต๊อกกับใบจะไม่ตรงกัน):
 *   - บรรทัดที่รับของมาแล้ว ลบไม่ได้
 *   - ลดจำนวนต่ำกว่าที่รับมาแล้วไม่ได้
 * ยอดใบคิดด้วยของกลาง lib/po-total (สูตรเดียวกับทุกที่ที่แตะราคา)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { buildPartnerMatcher, type PartnerLike } from "@/lib/partner-match";
import { computePoTotals } from "@/lib/po-total";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const str = (v: unknown) => String(v ?? "").trim();

type InLine = { id?: string; item_sku_id?: string | null; item_name?: string; qty?: number; uom?: string | null; price?: number };
type InHeader = {
  seller_name?: string; seller_partner_id?: string | null;
  order_date?: string | null; expected_date?: string | null; note?: string | null;
  currency?: string; vat_rate?: number; vat_included?: boolean;
};
type Body = { po_id?: string; header?: InHeader; lines?: InLine[] };

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const poId = str(body.po_id);
  if (!poId) return NextResponse.json({ error: "ไม่ระบุใบสั่งซื้อ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: po, error: poErr } = await admin.from("purchase_orders_v2")
    .select("id, po_no, seller_name, currency, vat_rate, vat_included").eq("id", poId).maybeSingle();
  if (poErr || !po) return NextResponse.json({ error: "ไม่พบใบสั่งซื้อ" }, { status: 404 });
  const cur = po as Record<string, unknown>;

  const { data: existing } = await admin.from("purchase_order_lines_v2")
    .select("id, qty, qty_received, item_name, is_active").eq("po_id", poId);
  const oldLines = ((existing ?? []) as Record<string, unknown>[]).filter((l) => l.is_active !== false);
  const oldById = new Map(oldLines.map((l) => [String(l.id), l]));

  // ---------- หัวใบ ----------
  const h = body.header ?? {};
  const patch: Record<string, unknown> = {};
  if (h.seller_name !== undefined) {
    const nm = str(h.seller_name);
    if (!nm) return NextResponse.json({ error: "ชื่อร้านว่างไม่ได้" }, { status: 400 });
    patch.seller_name = nm;
    // ผูก id ร้านใหม่ตามชื่อ (ของกลาง lib/partner-match) ถ้าไม่ได้ส่ง id มาเอง
    if (h.seller_partner_id !== undefined) {
      patch.seller_partner_id = str(h.seller_partner_id) || null;
    } else {
      const { data: all } = await admin.from("partners_v2").select("id, display_name, name_th, is_supplier, is_active");
      patch.seller_partner_id = buildPartnerMatcher((all ?? []) as unknown as PartnerLike[]).match(nm)?.id ?? null;
    }
  } else if (h.seller_partner_id !== undefined) {
    patch.seller_partner_id = str(h.seller_partner_id) || null;
  }
  if (h.order_date !== undefined) patch.order_date = str(h.order_date) || null;
  if (h.expected_date !== undefined) patch.expected_date = str(h.expected_date) || null;
  if (h.note !== undefined) patch.note = str(h.note) || null;
  if (h.currency !== undefined && str(h.currency)) patch.currency = str(h.currency).toUpperCase();
  if (h.vat_rate !== undefined) {
    const r = num(h.vat_rate);
    if (r < 0 || r > 100) return NextResponse.json({ error: "อัตราภาษีต้องอยู่ระหว่าง 0–100" }, { status: 400 });
    patch.vat_rate = r;
  }
  if (h.vat_included !== undefined) patch.vat_included = !!h.vat_included;

  const currency = String(patch.currency ?? cur.currency ?? "THB");

  // ---------- รายการสินค้า ----------
  let lineSum: number | null = null;
  if (Array.isArray(body.lines)) {
    const incoming = body.lines.filter((l) => str(l.item_name) && num(l.qty) > 0);
    if (incoming.length === 0) {
      return NextResponse.json({ error: "ต้องมีสินค้าอย่างน้อย 1 รายการ" }, { status: 400 });
    }

    const keepIds = new Set(incoming.map((l) => str(l.id)).filter(Boolean));

    // กันลบบรรทัดที่รับของมาแล้ว
    const blockedDelete = oldLines.filter((l) => !keepIds.has(String(l.id)) && num(l.qty_received) > 0);
    if (blockedDelete.length) {
      return NextResponse.json({
        error: `ลบรายการที่รับของมาแล้วไม่ได้: ${blockedDelete.map((l) => str(l.item_name)).join(", ")} — ถ้าต้องการยกเลิก ให้แก้ที่หน้ารับสินค้าเข้า`,
      }, { status: 400 });
    }
    // กันลดจำนวนต่ำกว่าที่รับมาแล้ว
    for (const l of incoming) {
      const old = l.id ? oldById.get(str(l.id)) : null;
      if (old && num(l.qty) < num(old.qty_received)) {
        return NextResponse.json({
          error: `"${str(old.item_name)}" รับของมาแล้ว ${num(old.qty_received)} — ตั้งจำนวนต่ำกว่านี้ไม่ได้`,
        }, { status: 400 });
      }
    }

    // ปิดบรรทัดที่ถูกเอาออก (soft delete — เก็บประวัติไว้)
    const removeIds = oldLines.map((l) => String(l.id)).filter((id) => !keepIds.has(id));
    if (removeIds.length) {
      await admin.from("purchase_order_lines_v2").update({ is_active: false }).in("id", removeIds);
    }

    // อัปเดต/เพิ่ม
    let i = 0;
    for (const l of incoming) {
      const qty = num(l.qty);
      const price = num(l.price);
      const row = {
        item_sku_id: l.item_sku_id || null,
        item_name: str(l.item_name),
        qty, uom: str(l.uom) || null,
        price_est: price, line_total: Math.round(qty * price * 100) / 100,
        currency, sort_order: i++, is_active: true,
      };
      const id = str(l.id);
      if (id && oldById.has(id)) {
        const { error } = await admin.from("purchase_order_lines_v2").update(row).eq("id", id);
        if (error) return NextResponse.json({ error: "แก้รายการไม่สำเร็จ: " + error.message }, { status: 400 });
      } else {
        const { error } = await admin.from("purchase_order_lines_v2").insert({ ...row, po_id: poId });
        if (error) return NextResponse.json({ error: "เพิ่มรายการไม่สำเร็จ: " + error.message }, { status: 400 });
      }
    }
    lineSum = incoming.reduce((a, l) => a + num(l.qty) * num(l.price), 0);
  }

  // ---------- ยอดรวม (ของกลาง lib/po-total) ----------
  if (lineSum === null) {
    const { data: nowLines } = await admin.from("purchase_order_lines_v2")
      .select("line_total, is_active").eq("po_id", poId);
    lineSum = ((nowLines ?? []) as Record<string, unknown>[])
      .filter((l) => l.is_active !== false).reduce((a, l) => a + num(l.line_total), 0);
  }
  const vatRate = patch.vat_rate !== undefined ? num(patch.vat_rate) : num(cur.vat_rate);
  const vatIncl = patch.vat_included !== undefined ? !!patch.vat_included : !!cur.vat_included;
  const totals = computePoTotals(lineSum, vatRate, vatIncl);
  patch.grand_total = totals.total;

  const { error: upErr } = await admin.from("purchase_orders_v2").update(patch).eq("id", poId);
  if (upErr) return NextResponse.json({ error: "บันทึกใบสั่งซื้อไม่สำเร็จ: " + upErr.message }, { status: 400 });

  await writeAudit(admin, {
    action: "update",
    entityType: "purchase_orders_v2",
    entityId: poId,
    actorId: user.id,
    actorName: user.email ?? "system",
    metadata: { po_no: cur.po_no, changed: Object.keys(patch), lines: body.lines?.length ?? null, totals },
  });

  return NextResponse.json({ id: poId, ...totals, error: null });
}
