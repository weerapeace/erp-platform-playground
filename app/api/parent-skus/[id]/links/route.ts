/**
 * /api/parent-skus/[id]/links — "รายการที่เชื่อมกับสินค้านี้" ทุกแหล่ง (แท็บภาพรวมของ Parent SKU)
 *   แหล่งข้อมูล/วิธีผูก/ลิงก์ = ทะเบียนกลาง lib/parent-links-registry · ตัวอ่าน = lib/parent-links-server
 *   อ่านอย่างเดียว · guardApi products.view
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { loadParentLinks } from "@/lib/parent-links-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
  const a = supabaseAdmin();

  const [{ data: parent, error: pErr }, { data: skus }] = await Promise.all([
    a.from("parent_skus_v2").select("code").eq("id", id).maybeSingle(),
    a.from("skus_v2").select("id, code").eq("parent_sku_id", id),
  ]);
  if (pErr) return NextResponse.json({ error: "โหลดสินค้าไม่สำเร็จ" }, { status: 500 });
  if (!parent) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const skuRows = (skus ?? []) as { id: string; code: string }[];

  // ?only=assets,... = โหลดเฉพาะแหล่งนั้น (ปุ่ม "ค้น…" ของแหล่งช้า) · ไม่ส่ง = ทุกแหล่ง (แหล่งช้าคืนเป็นปุ่ม)
  const only = (new URL(request.url).searchParams.get("only") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const out = await loadParentLinks(a, {
    parentId: id, parentCode: String((parent as { code?: string }).code ?? ""),
    skuIds: skuRows.map((s) => s.id), skuCodes: skuRows.map((s) => s.code).filter(Boolean),
  }, { only });
  return NextResponse.json({ ...out, error: null }, { headers: { "Cache-Control": "no-store" } });
}
