/**
 * GET /api/purchasing/receivable            → สินค้าที่รอเข้า (ยังรับไม่ครบ + ยังไม่ปิดยอด)
 * GET /api/purchasing/receivable?mode=done  → รายการที่ปิดแล้ว (รับครบ / ปิดยอดขาด) ไว้ดู/แก้
 * join skus_v2 (รหัส + รูปปก) + supplier_items (ลีดไทม์ร้านหลัก) เพื่อโชว์การ์ดรับของ
 * คำนวณ "วันคาดการณ์ของเข้า": ① PO.expected_date ถ้ามี → ② order_date + lead_time → ③ null
 * ใช้ในหน้า "รับสินค้าเข้า" แท็บ "สินค้าที่รอเข้า" + "รับครบแล้ว"
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const today = () => new Date().toISOString().slice(0, 10);
const CHINA_DEFAULT_LEAD = 14;   // ร้านจีน (สกุล RMB/หยวน) ที่ไม่มีลีดไทม์ → ใช้ค่านี้
const isCNYCur = (c: unknown) => { const s = String(c ?? "").toUpperCase(); return s === "RMB" || s === "YUAN" || s === "CNY"; };
// บวกวันจากวันที่ฐาน (YYYY-MM-DD) → คืน YYYY-MM-DD
const addDays = (date: string, days: number): string => {
  const d = new Date(date + "T00:00:00Z");
  if (isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// จำนวนวันระหว่าง 2 วันที่ (to - from) แบบจำนวนวันเต็ม
const dayDiff = (from: string, to: string): number => {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const mode = request.nextUrl.searchParams.get("mode") === "done" ? "done" : "pending";

  // 1) ใบสั่งซื้อ — pending: ตัด received/cancelled · done: ตัดเฉพาะ cancelled (ใบที่รับครบต้องยังเห็น)
  let poQuery = admin
    .from("purchase_orders_v2")
    .select("id, po_no, seller_name, currency, status, order_date, expected_date, payment_status, paid_date")
    .limit(1000);
  poQuery = mode === "done" ? poQuery.neq("status", "cancelled") : poQuery.not("status", "in", "(received,cancelled)");
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
      const closed = st === "received" || st === "short_closed";
      if (mode === "done") { if (closed) lines.push(l); continue; }
      // pending: ข้ามที่ปิดแล้ว แม้จะยังมีคงเหลือ
      if (closed) continue;
      if (Math.max(0, num(l.qty) - num(l.qty_received)) > 0) lines.push(l);
    }
  }
  if (lines.length === 0) return NextResponse.json({ data: [], error: null });

  // 3) รหัส + รูปปก จาก SKU (batch)
  const skuIds = [...new Set(lines.map((l) => l.item_sku_id).filter(Boolean) as string[])];
  const skuMap = new Map<string, { code: string | null; cover: string | null }>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const chunk = skuIds.slice(i, i + 300);
    const { data: sk } = await admin.from("skus_v2").select("id, code, cover_image_r2_key").in("id", chunk);
    for (const s of (sk ?? []) as Record<string, unknown>[]) skuMap.set(String(s.id), { code: (s.code as string) ?? null, cover: (s.cover_image_r2_key as string) ?? null });
  }

  // 4) ลีดไทม์ร้านหลัก (is_default) — ไว้คำนวณวันคาดเมื่อ PO ไม่ได้ระบุ
  const leadMap = new Map<string, number | null>();
  for (let i = 0; i < skuIds.length; i += 300) {
    const chunk = skuIds.slice(i, i + 300);
    const { data: si } = await admin.from("supplier_items").select("item_sku_id, lead_time_days").eq("is_default", true).in("item_sku_id", chunk);
    for (const s of (si ?? []) as Record<string, unknown>[]) leadMap.set(String(s.item_sku_id), s.lead_time_days == null ? null : Number(s.lead_time_days));
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

  const t = today();
  const rows = lines.map((l) => {
    const po = poMap.get(String(l.po_id))!;
    const sk = l.item_sku_id ? skuMap.get(String(l.item_sku_id)) : null;
    const cover = sk?.cover ?? null;
    const orderDate = (po.order_date as string) || null;
    const lead = l.item_sku_id ? (leadMap.get(String(l.item_sku_id)) ?? null) : null;

    // สถานะจ่ายเงิน + ร้านส่งก่อนจ่าย → จุดเริ่มนับวันส่ง
    const sellerName = (po.seller_name as string) ?? "";
    const shipBefore = shipBeforePay.has(sellerName);
    const paymentStatus = (po.payment_status as string) || "unpaid";
    const paidDate = (po.paid_date as string) || null;
    const isPaid = paymentStatus === "paid";
    // เริ่มนับ: ร้านส่งก่อนจ่าย=วันสั่ง · ร้านปกติ=วันจ่าย (ยังไม่จ่าย=ยังไม่เริ่ม)
    const shipStart = shipBefore ? orderDate : (isPaid ? (paidDate || orderDate) : null);
    // ลีดไทม์ที่ใช้: ลีดไทม์ร้าน (ถ้ามี) → ไม่มี + ร้านจีน = 14 วัน → ไม่มี + ไม่ใช่จีน = null
    const isChina = isCNYCur(po.currency);
    const effLead = lead != null ? lead : (isChina ? CHINA_DEFAULT_LEAD : null);
    const leadFromChina = lead == null && isChina;

    // วันคาดการณ์: ① PO.expected_date → ② ship_start + ลีดไทม์ → ③ null (รอจ่าย/ไม่มีลีดไทม์)
    let expected: string | null = (po.expected_date as string) || null;
    let expectedSource: "po" | "lead" | "china" | null = expected ? "po" : null;
    if (!expected && shipStart && effLead != null) { expected = addDays(shipStart, effLead); expectedSource = leadFromChina ? "china" : "lead"; }
    const pr = l.pr_id ? prMap.get(String(l.pr_id)) : null;

    return {
      id: String(l.id),                          // = po_line_id
      po_id: String(l.po_id),
      po_no: (po.po_no as string) ?? "",
      po_status: (po.status as string) ?? "",
      seller_name: (po.seller_name as string) ?? "—",
      item_sku_id: l.item_sku_id ?? null,
      item_name: (l.item_name as string) ?? "",
      code: sk?.code ?? "",
      image_url: cover ? `/api/r2-image?key=${encodeURIComponent(cover)}` : null,
      uom: (l.uom as string) ?? "",
      qty: num(l.qty),
      qty_received: num(l.qty_received),
      qty_defective: num(l.qty_defective),
      line_status: (l.line_status as string) ?? "",
      remaining: Math.max(0, num(l.qty) - num(l.qty_received)),
      currency: (po.currency as string) ?? "THB",
      order_date: orderDate,
      expected_date: expected,
      expected_source: expectedSource,           // 'po' | 'lead' | null
      lead_time_days: lead,
      days_remaining: expected ? dayDiff(t, expected) : null,
      source_mo_no: pr?.mo ?? null,               // ใบสั่งผลิตต้นทาง (ถ้าขอซื้อมาจาก MO)
      used_for_label: pr?.usedFor ?? null,        // สินค้าที่ผลิต (ป้ายช่วยจำ)
      receive_count: recvCount.get(String(l.id)) ?? 0,   // รับมาแล้วกี่ครั้ง (ใบรับ GR)
      // สถานะจ่ายเงิน + วันส่ง
      payment_status: paymentStatus,              // 'unpaid' | 'paid'
      paid_date: paidDate,
      ship_before_pay: shipBefore,
      duration_days: shipStart ? dayDiff(shipStart, t) : null,   // ค้างมากี่วัน (ตั้งแต่เริ่มนับ)
    };
  });

  return NextResponse.json({ data: rows, error: null });
}
