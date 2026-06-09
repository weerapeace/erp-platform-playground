/**
 * GET /api/purchasing/receivable
 * รายการ "สินค้าที่รอเข้า" — ทุกบรรทัดของ PO ที่ยังรับไม่ครบ (qty - qty_received > 0)
 * join skus_v2 (รหัส + รูปปก) + supplier_items (ลีดไทม์ร้านหลัก) เพื่อโชว์การ์ดรับของ
 * คำนวณ "วันคาดการณ์ของเข้า": ① PO.expected_date ถ้ามี → ② order_date + lead_time → ③ null
 * ใช้ในหน้า "รับสินค้าเข้า" แท็บ "สินค้าที่รอเข้า"
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const today = () => new Date().toISOString().slice(0, 10);
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

  // 1) ใบสั่งซื้อที่ยังไม่ปิด (ตัด received/cancelled)
  const { data: pos, error: poErr } = await admin
    .from("purchase_orders_v2")
    .select("id, po_no, seller_name, currency, status, order_date, expected_date")
    .not("status", "in", "(received,cancelled)")
    .limit(1000);
  if (poErr) return NextResponse.json({ data: [], error: poErr.message }, { status: 500 });
  const poMap = new Map((pos ?? []).map((p) => [String(p.id), p as Record<string, unknown>]));
  const poIds = [...poMap.keys()];
  if (poIds.length === 0) return NextResponse.json({ data: [], error: null });

  // 2) บรรทัด PO ที่ยังรับไม่ครบ
  const lines: Record<string, unknown>[] = [];
  for (let i = 0; i < poIds.length; i += 300) {
    const chunk = poIds.slice(i, i + 300);
    const { data: ls, error: lErr } = await admin
      .from("purchase_order_lines_v2")
      .select("id, po_id, item_sku_id, item_name, qty, uom, qty_received")
      .in("po_id", chunk)
      .limit(5000);
    if (lErr) return NextResponse.json({ data: [], error: lErr.message }, { status: 500 });
    for (const l of (ls ?? []) as Record<string, unknown>[]) {
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

  const t = today();
  const rows = lines.map((l) => {
    const po = poMap.get(String(l.po_id))!;
    const sk = l.item_sku_id ? skuMap.get(String(l.item_sku_id)) : null;
    const cover = sk?.cover ?? null;
    const orderDate = (po.order_date as string) || null;
    const lead = l.item_sku_id ? (leadMap.get(String(l.item_sku_id)) ?? null) : null;

    // วันคาดการณ์: ① PO.expected_date → ② order_date + lead → ③ null
    let expected: string | null = (po.expected_date as string) || null;
    let expectedSource: "po" | "lead" | null = expected ? "po" : null;
    if (!expected && orderDate && lead != null) { expected = addDays(orderDate, lead); expectedSource = "lead"; }

    return {
      id: String(l.id),                          // = po_line_id
      po_id: String(l.po_id),
      po_no: (po.po_no as string) ?? "",
      seller_name: (po.seller_name as string) ?? "—",
      item_sku_id: l.item_sku_id ?? null,
      item_name: (l.item_name as string) ?? "",
      code: sk?.code ?? "",
      image_url: cover ? `/api/r2-image?key=${encodeURIComponent(cover)}` : null,
      uom: (l.uom as string) ?? "",
      remaining: Math.max(0, num(l.qty) - num(l.qty_received)),
      currency: (po.currency as string) ?? "THB",
      order_date: orderDate,
      expected_date: expected,
      expected_source: expectedSource,           // 'po' | 'lead' | null
      lead_time_days: lead,
      days_remaining: expected ? dayDiff(t, expected) : null,
    };
  });

  return NextResponse.json({ data: rows, error: null });
}
