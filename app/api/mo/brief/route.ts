/**
 * 🏭 ข้อมูลย่อของใบสั่งผลิต (ของกลาง) — GET ?nos=MO-2026-00389,MO-2026-00390 (สูงสุด 300 ใบ)
 *   → [{ mo_no, product_sku, product_name, qty, due_date, image_url }] · กำหนดส่ง = internal_due_date ก่อน due_date
 *   รูป = รูปปกของ SKU ที่ผลิต (ไม่มี → รูป Parent SKU · lib/sku-cover) · ใช้ที่: หน้าพิมพ์สรุปสั่งซื้อ/รอรับ (ช่องใบสั่งผลิต)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { SKU_COVER_SELECT, coverUrl, resolveSkuCover } from "@/lib/sku-cover";
import type { MoBrief } from "@/lib/purchasing-print";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const nos = [...new Set((new URL(request.url).searchParams.get("nos") ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 300);
  if (!nos.length) return NextResponse.json({ data: [] });
  const admin = supabaseAdmin();
  const { data: mos, error } = await admin.from("manufacturing_orders")
    .select("mo_no, product_sku, product_name, qty, due_date, internal_due_date").in("mo_no", nos);
  if (error) return NextResponse.json({ data: [], error: "โหลดใบสั่งผลิตไม่สำเร็จ" }, { status: 500 });
  const rows = (mos ?? []) as { mo_no: string; product_sku: string | null; product_name: string | null; qty: number | string | null; due_date: string | null; internal_due_date: string | null }[];

  const skus = [...new Set(rows.map((m) => m.product_sku).filter(Boolean) as string[])];
  const img = new Map<string, string | null>();
  for (let i = 0; i < skus.length; i += 300) {
    const { data: sk } = await admin.from("skus_v2").select("code, " + SKU_COVER_SELECT).in("code", skus.slice(i, i + 300));
    for (const s of (sk ?? []) as unknown as Record<string, unknown>[]) {
      const code = String(s.code ?? "");
      if (code && !img.get(code)) img.set(code, coverUrl(resolveSkuCover(s).key));
    }
  }
  const data: MoBrief[] = rows.map((m) => ({
    mo_no: m.mo_no, product_sku: m.product_sku, product_name: m.product_name,
    qty: Number(m.qty) || 0, due_date: m.internal_due_date ?? m.due_date ?? null,
    image_url: m.product_sku ? img.get(m.product_sku) ?? null : null,
  }));
  return NextResponse.json({ data });
}
