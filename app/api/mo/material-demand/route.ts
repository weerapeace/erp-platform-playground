/**
 * "วัตถุดิบตัวนี้ ใบงานไหนรออยู่บ้าง" — /api/mo/material-demand?code=<รหัสวัตถุดิบ>
 * ใช้ตอนรับของเข้า: รับซิปดำมา 100 → เห็นทันทีว่ามี 3 ใบงานรออยู่ ต้องใช้รวม 120 → ยังขาด 20
 * GET ?code=ZIP-001            → วัตถุดิบตัวเดียว
 * GET ?codes=A,B,C             → หลายตัว (คืน map)
 * นับเฉพาะใบสั่งผลิตที่ยังไม่จบ · เรียงใบที่ใกล้ครบกำหนดก่อน (ควรได้ของก่อน)
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DemandMo = {
  mo_id: string; mo_no: string;
  product_sku: string | null; product_name: string | null; image: string | null;
  mo_qty: number; due_date: string | null;
  required: number;        // ต้องใช้ในใบนี้
  on_hand: number;         // ที่พนักงานบันทึกว่ามีแล้ว
  short: number;           // ยังขาดเท่าไร (required − on_hand)
  is_ready: boolean;       // ติ๊ก "เตรียมแล้ว" หรือยัง
  summary_id: string | null;
};
export type MaterialDemand = {
  code: string;
  component_name: string | null;
  uom: string | null;
  mo_count: number;          // จำนวนใบงานที่ยังรอของตัวนี้
  total_required: number;    // รวมต้องใช้ (เฉพาะใบที่ยังไม่พร้อม)
  total_short: number;       // รวมที่ยังขาดจริง
  mos: DemandMo[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const codes = [...new Set(
    (sp.get("codes") ?? sp.get("code") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  )].slice(0, 50);
  if (codes.length === 0) return NextResponse.json({ data: {}, error: null });

  const admin = supabaseAdmin();
  // ⚠️ วัตถุดิบยอดฮิตตัวเดียวอาจถูกใช้ในใบเป็นร้อย → แถวเกิน 1,000 ได้
  //    `.limit(2000)` ไม่ช่วย (PostgREST ตัดที่ 1,000 เงียบ ๆ) ต้องไล่ทีละหน้า
  const sumList = await fetchAllPages<Record<string, unknown>>((from, to) => admin.from("mo_material_summary")
    .select("id, mo_no, component_sku, component_name, uom, qty_per, required_qty, on_hand_qty, is_ready")
    .in("component_sku", codes).eq("is_active", true)
    .order("mo_no", { ascending: true }).range(from, to));
  if (sumList.length === 0) {
    return NextResponse.json({ data: Object.fromEntries(codes.map((c) => [c, { code: c, component_name: null, uom: null, mo_count: 0, total_required: 0, total_short: 0, mos: [] }])), error: null });
  }

  // เอาเฉพาะใบสั่งผลิตที่ยังไม่จบ
  const moNos = [...new Set(sumList.map((s) => String(s.mo_no)))];
  const { data: mos } = await admin.from("manufacturing_orders")
    .select("id, mo_no, qty, product_sku, product_name, due_date")
    .in("mo_no", moNos).eq("is_active", true).not("status", "in", "(cancelled,done)").limit(1000);
  const moByNo = new Map(((mos ?? []) as Record<string, unknown>[]).map((m) => [String(m.mo_no), m]));

  // รูปสินค้าของใบงาน
  const prodCodes = [...new Set([...moByNo.values()].map((m) => String(m.product_sku ?? "").trim()).filter(Boolean))];
  const imgByCode = new Map<string, string>();
  if (prodCodes.length > 0) {
    const { data: skus } = await admin.from("skus_v2").select("code, cover_image_r2_key").in("code", prodCodes.slice(0, 1000)).eq("is_active", true);
    for (const s of (skus ?? []) as Record<string, unknown>[]) {
      if (s.cover_image_r2_key) imgByCode.set(String(s.code), `/api/r2-image?key=${encodeURIComponent(String(s.cover_image_r2_key))}&w=120`);
    }
  }

  const out: Record<string, MaterialDemand> = {};
  for (const c of codes) out[c] = { code: c, component_name: null, uom: null, mo_count: 0, total_required: 0, total_short: 0, mos: [] };

  for (const s of sumList) {
    const code = String(s.component_sku ?? "").trim();
    const bucket = out[code];
    if (!bucket) continue;
    const mo = moByNo.get(String(s.mo_no));
    if (!mo) continue;                                   // ใบจบแล้ว/ยกเลิก — ไม่ต้องรอของ
    if (!bucket.component_name) bucket.component_name = (s.component_name as string) ?? null;
    if (!bucket.uom) bucket.uom = (s.uom as string) ?? null;

    const moQty = num(mo.qty);
    const required = num(s.required_qty) > 0 ? num(s.required_qty) : r2(num(s.qty_per) * moQty);
    const onHand = num(s.on_hand_qty);
    const isReady = !!s.is_ready || (required > 0 && onHand >= required);
    bucket.mos.push({
      mo_id: String(mo.id), mo_no: String(mo.mo_no),
      product_sku: (mo.product_sku as string) ?? null, product_name: (mo.product_name as string) ?? null,
      image: imgByCode.get(String(mo.product_sku ?? "").trim()) ?? null,
      mo_qty: moQty, due_date: (mo.due_date as string) ?? null,
      required: r2(required), on_hand: r2(onHand), short: r2(Math.max(0, required - onHand)),
      is_ready: isReady, summary_id: s.id ? String(s.id) : null,
    });
  }

  for (const c of codes) {
    const b = out[c];
    // ใบที่ใกล้ครบกำหนดก่อน (ควรได้ของก่อน) · ใบที่เตรียมครบแล้วไปท้ายสุด
    b.mos.sort((x, y) =>
      Number(x.is_ready) - Number(y.is_ready) ||
      (x.due_date ?? "9999-12-31").localeCompare(y.due_date ?? "9999-12-31") ||
      x.mo_no.localeCompare(y.mo_no));
    const pending = b.mos.filter((m) => !m.is_ready);
    b.mo_count = pending.length;
    b.total_required = r2(pending.reduce((n, m) => n + m.required, 0));
    b.total_short = r2(pending.reduce((n, m) => n + m.short, 0));
  }

  return NextResponse.json({ data: out, error: null });
}
