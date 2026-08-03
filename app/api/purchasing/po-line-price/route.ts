/**
 * POST /api/purchasing/po-line-price — ใส่/แก้ "ราคาต่อหน่วย" ของรายการในใบสั่งซื้อ (ของกลาง)
 *   body: { line_id, price }
 * ทำ 3 อย่างในครั้งเดียว:
 *   1. อัปเดตบรรทัด PO (price_est + line_total = qty × price)
 *   2. คำนวณยอดรวมใบใหม่ (grand_total)
 *   3. บันทึกราคาเข้า "ตารางราคาหลายร้าน" กลาง (supplier_items) ของ SKU + ร้านนั้น
 *      → ครั้งหน้าสั่งซื้อร้านเดิมมีราคาให้เลย (จับคู่ร้านจากชื่อบนใบ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { buildPartnerMatcher } from "@/lib/partner-match";
import { computePoTotals, sumActiveLines } from "@/lib/po-total";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { line_id?: string; price?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const lineId = typeof body.line_id === "string" ? body.line_id : null;
  const price = num(body.price);
  if (!lineId) return NextResponse.json({ error: "ไม่ระบุรายการ" }, { status: 400 });
  if (!(price > 0)) return NextResponse.json({ error: "ราคาต้องมากกว่า 0" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: line, error: lineErr } = await admin.from("purchase_order_lines_v2")
    .select("id, po_id, item_sku_id, item_name, qty").eq("id", lineId).single();
  if (lineErr || !line) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });

  const l = line as Record<string, unknown>;
  const qty = num(l.qty);
  const lineTotal = qty * price;

  // 1. อัปเดตบรรทัด
  const { error: upErr } = await admin.from("purchase_order_lines_v2")
    .update({ price_est: price, line_total: lineTotal }).eq("id", lineId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // 2. ยอดรวมใบใหม่ — คิดผ่านของกลาง lib/po-total เพื่อให้ใบที่มีภาษีไม่โดนล้าง VAT ทิ้ง
  //    (เดิมบวก line_total ตรง ๆ → พอแก้ราคาทีเดียว ยอดรวมจะกลายเป็นยอดก่อน VAT)
  const poId = String(l.po_id);
  const [{ data: allLines }, { data: poRow }] = await Promise.all([
    admin.from("purchase_order_lines_v2").select("line_total, is_active").eq("po_id", poId),
    admin.from("purchase_orders_v2").select("vat_rate, vat_included").eq("id", poId).maybeSingle(),
  ]);
  const lineSum = sumActiveLines((allLines ?? []) as { line_total?: number | null; is_active?: boolean | null }[]);
  const pr = (poRow ?? {}) as Record<string, unknown>;
  const grand = computePoTotals(lineSum, num(pr.vat_rate), !!pr.vat_included).total;
  await admin.from("purchase_orders_v2").update({ grand_total: grand }).eq("id", poId);

  // 3. บันทึกเข้าตารางราคาหลายร้านกลาง (supplier_items) — จับคู่ร้านจากชื่อบนใบ
  let savedToPriceList = false;
  const skuId = l.item_sku_id ? String(l.item_sku_id) : null;
  if (skuId) {
    const { data: po } = await admin.from("purchase_orders_v2").select("seller_name, currency").eq("id", poId).maybeSingle();
    const sellerName = String((po as Record<string, unknown> | null)?.seller_name ?? "").trim();
    const currency = String((po as Record<string, unknown> | null)?.currency ?? "THB") || "THB";
    if (sellerName) {
      // ⚠️ ห้ามกรอง is_supplier=true — ร้านบนใบหลายร้านยังไม่ได้ติ๊ก "เป็นผู้จำหน่าย" ราคาจะไม่ถูกเก็บเข้าตารางร้าน
      // จับคู่ผ่านของกลาง lib/partner-match (รองรับชื่อสลับคำ/วงเล็บ/เว้นวรรคต่าง)
      const { data: partners } = await admin.from("partners_v2").select("id, display_name, name_th, is_supplier, is_active");
      const partner = buildPartnerMatcher((partners ?? []) as unknown as { id: string; display_name: string | null; name_th: string | null; is_supplier: boolean | null; is_active: boolean | null }[])
        .match(sellerName) as Record<string, unknown> | undefined;
      if (partner) {
        const partnerId = String(partner.id);
        const { data: existing } = await admin.from("supplier_items")
          .select("id, price").eq("item_sku_id", skuId).eq("supplier_partner_id", partnerId).maybeSingle();
        if (existing) {
          const ex = existing as Record<string, unknown>;
          const oldPrice = ex.price == null ? null : num(ex.price);
          await admin.from("supplier_items").update({ price, currency, is_active: true }).eq("id", String(ex.id));
          if (oldPrice !== price) {
            await admin.from("supplier_price_history").insert({
              supplier_item_id: String(ex.id), item_sku_id: skuId, supplier_partner_id: partnerId,
              old_price: oldPrice, new_price: price, currency,
              changed_by: user?.id ?? null, changed_by_name: (user?.user_metadata?.name as string) ?? user?.email ?? null,
            });
          }
        } else {
          // ร้านแรกของสินค้านี้ → ตั้งเป็นร้านหลักให้เลย
          const { count } = await admin.from("supplier_items").select("id", { count: "exact", head: true }).eq("item_sku_id", skuId);
          await admin.from("supplier_items").insert({
            item_sku_id: skuId, supplier_partner_id: partnerId, price, currency, is_active: true, is_default: (count ?? 0) === 0,
          });
        }
        savedToPriceList = true;
      }
    }
  }

  await writeAudit(admin, {
    action: "update", entityType: "purchase_order_lines_v2", entityId: lineId,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { item_name: l.item_name, price, line_total: lineTotal, grand_total: grand, saved_to_price_list: savedToPriceList },
  });

  return NextResponse.json({ ok: true, price, line_total: lineTotal, grand_total: grand, saved_to_price_list: savedToPriceList, error: null });
}
