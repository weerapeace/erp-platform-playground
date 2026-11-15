/**
 * /api/parent-skus/[id]/desc-facts — ข้อมูลจริงสำหรับ "เติมจากข้อมูล" ในป๊อปแทรก Description (ฟรี ไม่ใช้ AI · เฟส 3 เจ้าของ 2026-11-15)
 *   GET → { data: { colors: [{ th, en }], warranty } }
 *   colors = สีไม่ซ้ำของ SKU ลูกที่เปิดใช้ (color_th · color = อังกฤษ) · warranty = ช่องรับประกันของรุ่น
 *   อ่านอย่างเดียว · guardApi products.view · กติกาบรรทัด = lib/detail-snippets (uniqueColors / colorLine / warrantyLine)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { uniqueColors } from "@/lib/detail-snippets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
  const a = supabaseAdmin();
  const [{ data: p }, { data: kids }] = await Promise.all([
    a.from("parent_skus_v2").select("id, warranty").eq("id", id).maybeSingle(),
    a.from("skus_v2").select("color_th, color, is_active").eq("parent_sku_id", id).limit(300),
  ]);
  if (!p) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const rows = ((kids ?? []) as { color_th: string | null; color: string | null; is_active: boolean | null }[]).filter((k) => k.is_active !== false);
  const w = p.warranty == null ? null : String(p.warranty).trim() || null;
  return NextResponse.json({ data: { colors: uniqueColors(rows), warranty: w }, error: null });
}
