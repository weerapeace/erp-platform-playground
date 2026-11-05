/**
 * GET /api/purchasing/receivable            → สินค้าที่รอเข้า (ยังรับไม่ครบ + ยังไม่ปิดยอด)
 * GET /api/purchasing/receivable?mode=done  → รายการที่ปิดแล้ว (รับครบ / ปิดยอดขาด) ไว้ดู/แก้
 * GET /api/purchasing/receivable?insights=1 → + raw_balance / linked_sku / dup_of (เครื่องมือเคลียร์ของค้างเก่า)
 * join skus_v2 (รหัส + รูปปก) + supplier_items (ลีดไทม์ร้านหลัก) เพื่อโชว์การ์ดรับของ
 * คำนวณ "วันคาดการณ์ของเข้า" = ของกลาง lib/po-eta: ① PO.expected_date → ② วันสั่ง + ลีดไทม์ร้าน (partners_v2.purchase_lead_time) → ③ วันสั่ง + 10 วัน
 *   (★ 2026-11-05 เจ้าของสั่ง "คาดเข้าตามร้าน คำนวณง่าย 10 วัน" — เดิมนับจากวันจ่าย + ลีดไทม์ร้านหลักของสินค้า · ยังไม่จ่าย = ไม่มีวันคาด · จีน 14 วัน)
 * ใช้ในหน้า "รับสินค้าเข้า" แท็บ "สินค้าที่รอเข้า" + "รับครบแล้ว"
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { skuIdsByBracketCode, resolveSkuId } from "@/lib/sku-code-lookup";
import { SKU_COVER_SELECT, resolveSkuCover, coverUrl } from "@/lib/sku-cover";
import { loadPoPay, PO_PAY_COLUMNS } from "@/lib/po-pay-server";
import { poEta } from "@/lib/po-eta";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const today = () => new Date().toISOString().slice(0, 10);
// จำนวนวันระหว่าง 2 วันที่ (to - from) แบบจำนวนวันเต็ม
const dayDiff = (from: string, to: string): number => {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const mode = request.nextUrl.searchParams.get("mode") === "done" ? "done" : "pending";

  // 1) ใบสั่งซื้อ — pending: ตัด received/cancelled · done: เห็นทุกใบที่ปิดแล้ว รวมใบที่ยกเลิกทั้งใบ (จะได้กดเปิดกลับได้)
  let poQuery = admin
    .from("purchase_orders_v2")
    .select(`id, po_no, currency, status, expected_date, ${PO_PAY_COLUMNS}`)
    .limit(1000);
  if (mode !== "done") poQuery = poQuery.not("status", "in", "(received,cancelled)");
  const { data: pos, error: poErr } = await poQuery;
  if (poErr) return NextResponse.json({ data: [], error: poErr.message }, { status: 500 });
  const poMap = new Map((pos ?? []).map((p) => [String(p.id), p as Record<string, unknown>]));
  const poIds = [...poMap.keys()];
  if (poIds.length === 0) return NextResponse.json({ data: [], error: null });

  // 2) บรรทัด PO — pending: ยังรับไม่ครบ+ยังไม่ปิดยอด · done: เฉพาะที่ปิดแล้ว (รับครบ/ปิดยอดขาด)
  const lines: Record<string, unknown>[] = [];
  for (let i = 0; i < poIds.length; i += 300) {
    const chunk = poIds.slice(i, i + 300);
    const { data: ls, error: lErr } = await admin
      .from("purchase_order_lines_v2")
      .select("id, po_id, pr_id, item_sku_id, item_name, qty, uom, qty_received, qty_defective, line_status")
      .in("po_id", chunk)
      .limit(5000);
    if (lErr) return NextResponse.json({ data: [], error: lErr.message }, { status: 500 });
    for (const l of (ls ?? []) as Record<string, unknown>[]) {
      const st = l.line_status as string | null;
      const closed = st === "received" || st === "short_closed" || st === "closed_short" || st === "cancelled";
      if (mode === "done") { if (closed) lines.push(l); continue; }
      // pending: ข้ามที่ปิดแล้ว แม้จะยังมีคงเหลือ
      if (closed) continue;
      if (Math.max(0, num(l.qty) - num(l.qty_received)) > 0) lines.push(l);
    }
  }
  if (lines.length === 0) return NextResponse.json({ data: [], error: null });

  // บรรทัดที่มาจากใบสั่งงาน (BOM) ยังไม่ผูก SKU — เก็บรหัสไว้ในชื่อ "[CODE] ชื่อ" เท่านั้น
  // → เดา SKU จากรหัสนั้น (ของกลาง lib/sku-code-lookup) ไม่งั้นรูปสินค้าไม่ขึ้นบนหน้ารับของ
  const codeSkuMap = await skuIdsByBracketCode(admin, lines.map((l) => l.item_name));
  const skuIdOf = (l: Record<string, unknown>) => resolveSkuId(l.item_sku_id, l.item_name, codeSkuMap);

  // 3) รหัส + รูปปก จาก SKU (batch) — ไม่มีรูปตัวเอง → ใช้รูป Parent SKU (ของกลาง lib/sku-cover)
  const skuIds = [...new Set(lines.map(skuIdOf).filter(Boolean) as string[])];
  const skuMap = new Map<string, { code: string | null; cover: string | null; coverFromParent: boolean }>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const chunk = skuIds.slice(i, i + 300);
    const { data: sk } = await admin.from("skus_v2").select("id, code, " + SKU_COVER_SELECT).in("id", chunk);
    for (const s of (sk ?? []) as unknown as Record<string, unknown>[]) { const c = resolveSkuCover(s); skuMap.set(String(s.id), { code: (s.code as string) ?? null, cover: c.key, coverFromParent: c.fromParent }); }
  }

  // 4) ระยะเวลาส่งของของร้าน (partners_v2.purchase_lead_time — ตั้งที่หน้าตั้งค่าร้าน / ปฏิทินจัดซื้อ) → วันคาด (lib/po-eta · ไม่ตั้ง = 10 วัน)
  const shopLead = new Map<string, string>();
  {
    const { data: ps } = await admin.from("partners_v2").select("id, purchase_lead_time").not("purchase_lead_time", "is", null).limit(5000);
    for (const p of (ps ?? []) as Record<string, unknown>[]) { const v = String(p.purchase_lead_time ?? "").trim(); if (v) shopLead.set(String(p.id), v); }
  }

  // 5) ใบสั่งผลิต (MO) ต้นทาง — ผ่าน บรรทัด PO → pr_id → ใบขอซื้อ.source_mo_no + used_for_label
  const prIds = [...new Set(lines.map((l) => l.pr_id).filter(Boolean) as string[])];
  const prMap = new Map<string, { mo: string | null; usedFor: string | null }>();
  for (let i = 0; i < prIds.length; i += 300) {
    const chunk = prIds.slice(i, i + 300);
    const { data: pr } = await admin.from("purchase_requests_v2").select("id, source_mo_no, used_for_label").in("id", chunk);
    for (const p of (pr ?? []) as Record<string, unknown>[]) prMap.set(String(p.id), { mo: (p.source_mo_no as string) ?? null, usedFor: (p.used_for_label as string) ?? null });
  }

  // 6) จำนวนครั้งที่รับ (นับใบรับ GR ต่อบรรทัด) — โชว์บนการ์ดติดตาม
  const lineIds = lines.map((l) => String(l.id));
  const recvCount = new Map<string, number>();
  for (let i = 0; i < lineIds.length; i += 300) {
    const chunk = lineIds.slice(i, i + 300);
    const { data: grl } = await admin.from("goods_receipt_lines_v2").select("po_line_id").in("po_line_id", chunk);
    for (const g of (grl ?? []) as Record<string, unknown>[]) { const k = String(g.po_line_id); recvCount.set(k, (recvCount.get(k) ?? 0) + 1); }
  }

  // 7) ร้านที่ตั้งว่า "ส่งก่อนจ่าย" (match ด้วยชื่อ — PO เก็บร้านเป็นชื่อ) → เริ่มนับวันส่งจากวันสั่ง
  const shipBeforePay = new Set<string>();
  const { data: sup } = await admin.from("partners_v2").select("name_th, display_name, code, ship_before_pay").eq("ship_before_pay", true).limit(2000);
  for (const s of (sup ?? []) as Record<string, unknown>[]) {
    for (const nm of [s.name_th, s.display_name, s.code]) { const v = String(nm ?? "").trim(); if (v) shipBeforePay.add(v); }
  }

  // สถานะจ่ายเงิน (สีป้าย) ของกลาง lib/po-pay-state — ตามเครดิตร้าน
  const payOf = await loadPoPay(admin);
  const payByPo = new Map([...poMap.entries()].map(([id, po]) => [id, payOf(po)]));

  const t = today();
  const rows = lines.map((l) => {
    const po = poMap.get(String(l.po_id)); if (!po) return null;
    const sid = skuIdOf(l);
    const sk = sid ? skuMap.get(sid) : null;
    const cover = sk?.cover ?? null;
    const orderDate = (po.order_date as string) || null;

    // สถานะจ่ายเงิน + ร้านส่งก่อนจ่าย → จุดเริ่มนับวันส่ง
    const sellerName = (po.seller_name as string) ?? "";
    const shipBefore = shipBeforePay.has(sellerName);
    const paymentStatus = (po.payment_status as string) || "unpaid";
    const paidDate = (po.paid_date as string) || null;
    const isPaid = paymentStatus === "paid";
    // เริ่มนับ "ค้างมากี่วัน": ร้านส่งก่อนจ่าย=วันสั่ง · ร้านปกติ=วันจ่าย (ยังไม่จ่าย=ยังไม่เริ่ม)
    const shipStart = shipBefore ? orderDate : (isPaid ? (paidDate || orderDate) : null);

    // วันคาดการณ์ (ของกลาง lib/po-eta): ① PO.expected_date → ② วันสั่ง + ลีดไทม์ร้าน → ③ วันสั่ง + 10 วัน
    const eta = poEta({
      expected_date: (po.expected_date as string) || null, order_date: orderDate,
      shop_lead: po.seller_partner_id ? shopLead.get(String(po.seller_partner_id)) ?? null : null,
      paid_date: isPaid ? paidDate : null, payment_due_date: (po.payment_due_date as string) || null,
    });
    const expected = eta.date;
    const pr = l.pr_id ? prMap.get(String(l.pr_id)) : null;

    return {
      id: String(l.id),                          // = po_line_id
      po_id: String(l.po_id),
      po_no: (po.po_no as string) ?? "",
      po_status: (po.status as string) ?? "",
      seller_name: (po.seller_name as string) ?? "—",
      item_sku_id: sid,   // sku ที่ผูกไว้ หรือที่เดาได้จากรหัสในชื่อ
      item_name: (l.item_name as string) ?? "",
      code: sk?.code ?? "",
      image_url: coverUrl(cover),
      image_from_parent: !!cover && !!sk?.coverFromParent,   // รูปที่โชว์เป็นของ Parent SKU (ตัวนี้ไม่มีรูปเอง)
      uom: (l.uom as string) ?? "",
      qty: num(l.qty),
      qty_received: num(l.qty_received),
      qty_defective: num(l.qty_defective),
      line_status: (l.line_status as string) ?? "",
      remaining: Math.max(0, num(l.qty) - num(l.qty_received)),
      currency: (po.currency as string) ?? "THB",
      order_date: orderDate,
      expected_date: expected,
      expected_source: eta.source,               // 'po' (ตั้งในใบ) | 'shop' (ลีดไทม์ร้าน) | 'default' (10 วัน) | null
      lead_time_days: eta.lead_days,
      days_remaining: expected ? dayDiff(t, expected) : null,
      source_mo_no: pr?.mo ?? null,               // ใบสั่งผลิตต้นทาง (ถ้าขอซื้อมาจาก MO)
      used_for_label: pr?.usedFor ?? null,        // สินค้าที่ผลิต (ป้ายช่วยจำ)
      receive_count: recvCount.get(String(l.id)) ?? 0,   // รับมาแล้วกี่ครั้ง (ใบรับ GR)
      // สถานะจ่ายเงิน + วันส่ง
      payment_status: paymentStatus,              // 'unpaid' | 'paid'
      paid_date: paidDate,
      ship_before_pay: shipBefore,
      duration_days: shipStart ? dayDiff(shipStart, t) : null,   // ค้างมากี่วัน (ตั้งแต่เริ่มนับ)
      pay: payByPo.get(String(l.po_id)) ?? null,  // สถานะจ่ายเงิน { state, label, due } (ของกลาง lib/po-pay-state)
    };
  }).filter(Boolean) as Record<string, unknown>[];

  // ?insights=1 (เครื่องมือเคลียร์ของค้างเก่า) — หลักฐานช่วยตัดสินว่า "ของมาแล้วหรือยัง"
  //  raw_balance = ยอดคลังวัตถุดิบ WH-RAW ตอนนี้ (ติดลบ = ถูกเบิกไปใช้แล้วทั้งที่ไม่เคยรับ → ของน่าจะมาแล้ว)
  //  linked_sku  = บรรทัดผูก SKU จริง (ไม่ผูก = รับได้แต่ไม่บวกสต๊อก)
  //  dup_of      = น่าจะซ้ำ: ร้าน+วันสั่ง+สินค้าเดียวกัน มีทั้งใบเลขแบบเก่า (P00xxx ย้ายมา) และใบเลขใหม่ (PO-…) → ชี้ใบเก่าที่ซ้ำ
  if (request.nextUrl.searchParams.get("insights") === "1") {
    const { data: rawWh } = await admin.from("erp_playground_warehouses").select("id").eq("code", "WH-RAW").maybeSingle();
    const rawId = (rawWh as { id?: string } | null)?.id ?? null;
    const balMap = new Map<string, number>();
    if (rawId) {
      for (let i = 0; i < skuIds.length; i += 300) {
        const { data: bs } = await admin.from("erp_playground_stock_balances").select("product_id, qty_on_hand").eq("warehouse_id", rawId).in("product_id", skuIds.slice(i, i + 300));
        for (const b of (bs ?? []) as Record<string, unknown>[]) balMap.set(String(b.product_id), num(b.qty_on_hand));
      }
    }
    const linked = new Set(lines.filter((l) => l.item_sku_id).map((l) => String(l.id)));
    const keyOf = (r: Record<string, unknown>) => `${r.seller_name}|${r.order_date ?? ""}|${r.item_sku_id ?? String(r.item_name ?? "").replace(/^\s*\[[^\]]*\]\s*/, "").trim().toLowerCase()}`;
    const oldPoOf = new Map<string, string>();   // key → เลขใบแบบเก่าในกลุ่ม
    for (const r of rows) { const no = String(r.po_no ?? ""); if (no && !no.startsWith("PO-")) { const k = keyOf(r); if (!oldPoOf.has(k)) oldPoOf.set(k, no); } }
    for (const r of rows) {
      const sid = r.item_sku_id ? String(r.item_sku_id) : null;
      r.raw_balance = sid && balMap.has(sid) ? balMap.get(sid)! : null;
      r.linked_sku = linked.has(String(r.id));
      const no = String(r.po_no ?? "");
      r.dup_of = no.startsWith("PO-") ? (oldPoOf.get(keyOf(r)) ?? null) : null;
    }
  }

  return NextResponse.json({ data: rows, error: null });
  } catch (e) {
    // คืน error message จริง (กันหน้าค้างเพราะ 500 body ว่าง) — ไว้ debug
    return NextResponse.json({ data: [], error: "receivable error: " + String((e as { message?: string })?.message ?? e) }, { status: 500 });
  }
}
