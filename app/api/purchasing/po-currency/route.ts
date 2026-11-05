/**
 * /api/purchasing/po-currency — แก้สกุลเงินของใบสั่งซื้อ (บาท ⇄ หยวน) ทั้งใบ
 * เจ้าของสั่ง 2026-11-05 ("ทำไมบางอันเป็นบาท ต้องเป็น ¥ สิ อยากให้แก้ได้ด้วย") — เปิดจากใบรับสินค้า / ป๊อปแก้สกุล
 *
 * GET  ?po_id=  → ข้อมูลไว้ดูก่อนแก้: หัวใบ + ร้าน + รายการ + เรทล่าสุด + เหตุที่แก้ไม่ได้ (ถ้ามี) + ราคาร้านใน SKU ที่จะแก้ตาม
 * POST { po_id, to: "RMB"|"THB", mode: "relabel"|"convert", rate?, update_shop_prices?, set_shop_currency? }
 *   relabel = ตัวเลขถูกแล้ว แค่ป้ายผิด · convert = แปลงตามเรท (บาท ต่อ 1 หยวน) — กติกา lib/po-currency
 *   แก้ตาม: บรรทัดใบสั่งซื้อ (ราคา/ยอด/สกุล) + หัวใบ (สกุล/เรท/ยอด) + ใบขอซื้อที่ผูก
 *   เลือกได้: ราคาร้านใน SKU (supplier_items ร้านนี้ × SKU ในใบ) · สกุลตั้งต้นของร้าน (partners_v2.default_currency)
 * กันพลาด: ใบที่ผูกบิลโอนเงินจีน หรือมีรายการอยู่ในใบสำคัญรับแล้ว = แก้ไม่ได้ (ราคาถูกคัดลอกไปแล้ว)
 * audit: update purchase_orders_v2 (ก่อน/หลังทุกบรรทัด)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { computePoTotals } from "@/lib/po-total";
import { fxRateForDate } from "@/lib/purchase-voucher-server";
import { convertPrice, isChinaShop, normCurrency, type CurrencyFixMode } from "@/lib/po-currency";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
type Admin = ReturnType<typeof supabaseAdmin>;
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const str = (v: unknown) => String(v ?? "").trim();
const r2 = (n: number) => Math.round(n * 100) / 100;

async function loadPo(admin: Admin, poId: string) {
  const { data: po } = await admin.from("purchase_orders_v2")
    .select("id, po_no, seller_name, seller_partner_id, currency, fx_rate, vat_rate, vat_included, status, order_date, china_bill_id, grand_total, is_active")
    .eq("id", poId).maybeSingle();
  if (!po) return null;
  const p = po as Row;
  const [{ data: lines }, shopRes, { data: vls }] = await Promise.all([
    admin.from("purchase_order_lines_v2").select("id, pr_id, item_sku_id, item_name, qty, uom, price_est, line_total, currency, is_active")
      .eq("po_id", poId).not("is_active", "is", false).order("sort_order"),
    p.seller_partner_id
      ? admin.from("partners_v2").select("id, display_name, name_th, shop_country, default_currency, is_taobao").eq("id", String(p.seller_partner_id)).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("purchase_voucher_lines_v2").select("voucher_id").eq("po_id", poId).not("is_active", "is", false).limit(1),
  ]);
  const shop = (shopRes.data as Row | null) ?? null;
  let lock: string | null = null;
  if (p.china_bill_id) lock = "ใบนี้ผูกบิลโอนเงินจีนแล้ว — ปลดผูกบิลก่อนถึงจะแก้สกุลได้";
  else if ((vls ?? []).length) {
    const { data: v } = await admin.from("purchase_vouchers_v2").select("pv_no, status, is_active").eq("id", String((vls as Row[])[0].voucher_id)).maybeSingle();
    if (v && (v as Row).is_active !== false) lock = `รายการของใบนี้อยู่ในใบสำคัญรับ ${str((v as Row).pv_no) || "(ร่าง)"} แล้ว — เอารายการออกจากใบสำคัญก่อน หรือแก้สกุลที่ใบสำคัญ`;
  }
  return { po: p, lines: (lines ?? []) as Row[], shop, lock };
}

/** ราคาร้านใน SKU (ร้านนี้ × SKU ในใบ) ที่ยังเป็นสกุลเดิม */
async function shopPriceRows(admin: Admin, shopId: string | null, skuIds: string[], fromCur: string) {
  if (!shopId || !skuIds.length) return [] as Row[];
  const { data } = await admin.from("supplier_items").select("id, item_sku_id, price, currency")
    .eq("supplier_partner_id", shopId).in("item_sku_id", skuIds).eq("is_active", true);
  return ((data ?? []) as Row[]).filter((r) => normCurrency(r.currency ?? "THB") === normCurrency(fromCur));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const poId = str(request.nextUrl.searchParams.get("po_id"));
  if (!poId) return NextResponse.json({ error: "ไม่ระบุใบสั่งซื้อ" }, { status: 400 });
  const admin = supabaseAdmin();
  const d = await loadPo(admin, poId);
  if (!d) return NextResponse.json({ error: "ไม่พบใบสั่งซื้อ" }, { status: 404 });
  const skuIds = [...new Set(d.lines.map((l) => str(l.item_sku_id)).filter(Boolean))];
  const [rate, sp] = await Promise.all([
    fxRateForDate(admin, (d.po.order_date as string) ?? null),
    shopPriceRows(admin, d.shop ? String(d.shop.id) : null, skuIds, String(d.po.currency ?? "THB")),
  ]);
  return NextResponse.json({
    data: {
      po_id: poId, po_no: d.po.po_no, seller_name: d.po.seller_name, currency: normCurrency(d.po.currency),
      fx_rate: d.po.fx_rate ?? null, status: d.po.status,
      shop: d.shop ? { id: d.shop.id, name: d.shop.display_name || d.shop.name_th, china: isChinaShop(d.shop), default_currency: normCurrency(d.shop.default_currency) } : null,
      lines: d.lines.map((l) => ({ id: l.id, item_name: l.item_name, qty: num(l.qty), uom: l.uom ?? "", price: num(l.price_est) })),
      rate, lock: d.lock, shop_price_rows: sp.length,
    },
    error: null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  let body: { po_id?: string; to?: string; mode?: string; rate?: number; update_shop_prices?: boolean; set_shop_currency?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const poId = str(body.po_id);
  const to = normCurrency(body.to);
  const mode: CurrencyFixMode = body.mode === "convert" ? "convert" : "relabel";
  const rate = num(body.rate);
  if (!poId) return NextResponse.json({ error: "ไม่ระบุใบสั่งซื้อ" }, { status: 400 });
  if (mode === "convert" && !(rate > 0)) return NextResponse.json({ error: "ใส่เรทแลกเปลี่ยน (บาท ต่อ 1 หยวน) ก่อนแปลงราคา" }, { status: 400 });

  const admin = supabaseAdmin();
  const d = await loadPo(admin, poId);
  if (!d) return NextResponse.json({ error: "ไม่พบใบสั่งซื้อ" }, { status: 404 });
  if (d.lock) return NextResponse.json({ error: d.lock }, { status: 409 });
  const from = normCurrency(d.po.currency);
  if (from === to) return NextResponse.json({ error: `ใบนี้เป็น${to === "RMB" ? "หยวน" : "บาท"}อยู่แล้ว` }, { status: 400 });

  // ---- บรรทัดใบสั่งซื้อ ----
  const before: { id: string; item_name: string; price: number }[] = [];
  const after: { id: string; price: number }[] = [];
  let lineSum = 0;
  for (const l of d.lines) {
    const price = convertPrice(num(l.price_est), from, to, mode, rate);
    const total = r2(num(l.qty) * price);
    lineSum += num(l.qty) * price;
    before.push({ id: String(l.id), item_name: str(l.item_name), price: num(l.price_est) });
    after.push({ id: String(l.id), price });
    const { error } = await admin.from("purchase_order_lines_v2").update({ price_est: price, line_total: total, currency: to }).eq("id", String(l.id));
    if (error) return NextResponse.json({ error: "แก้รายการไม่สำเร็จ: " + error.message }, { status: 400 });
  }

  // ---- หัวใบ ----
  const totals = computePoTotals(lineSum, num(d.po.vat_rate), d.po.vat_included === true);
  const fx = to === "RMB" ? (rate > 0 ? rate : (num(d.po.fx_rate) > 0 ? num(d.po.fx_rate) : null)) : null;
  const { error: upErr } = await admin.from("purchase_orders_v2").update({ currency: to, fx_rate: fx, grand_total: totals.total }).eq("id", poId);
  if (upErr) return NextResponse.json({ error: "บันทึกใบสั่งซื้อไม่สำเร็จ: " + upErr.message }, { status: 400 });

  // ---- ใบขอซื้อที่ผูก (ให้ประวัติการขอซื้อโชว์สกุลตรงกัน) ----
  for (const l of d.lines) {
    if (!l.pr_id) continue;
    const price = after.find((a) => a.id === String(l.id))?.price ?? num(l.price_est);
    await admin.from("purchase_requests_v2").update({ currency: to, price_est: price }).eq("id", String(l.pr_id));
  }

  // ---- เลือกได้: ราคาร้านใน SKU + สกุลตั้งต้นของร้าน ----
  let shopPricesUpdated = 0;
  const shopId = d.shop ? String(d.shop.id) : null;
  if (body.update_shop_prices && shopId) {
    const skuIds = [...new Set(d.lines.map((l) => str(l.item_sku_id)).filter(Boolean))];
    for (const r of await shopPriceRows(admin, shopId, skuIds, from)) {
      const price = r.price == null ? null : convertPrice(num(r.price), from, to, mode, rate);
      const { error } = await admin.from("supplier_items").update({ currency: to, price }).eq("id", String(r.id));
      if (!error) shopPricesUpdated++;
    }
  }
  let shopCurrencySet = false;
  if (body.set_shop_currency && shopId && normCurrency(d.shop?.default_currency) !== to) {
    const { error } = await admin.from("partners_v2").update({ default_currency: to }).eq("id", shopId);
    shopCurrencySet = !error;
  }

  await writeAudit(admin, {
    action: "update",
    entityType: "purchase_orders_v2",
    entityId: poId,
    actorId: user.id,
    actorName: user.email ?? "system",
    metadata: {
      po_no: d.po.po_no, change: "currency", from, to, mode, rate: rate || null,
      lines_before: before, lines_after: after, grand_total_before: num(d.po.grand_total ?? 0), totals,
      shop_prices_updated: shopPricesUpdated, shop_currency_set: shopCurrencySet ? to : null,
    },
  });

  return NextResponse.json({ data: { po_id: poId, currency: to, ...totals, shop_prices_updated: shopPricesUpdated, shop_currency_set: shopCurrencySet }, error: null });
}
