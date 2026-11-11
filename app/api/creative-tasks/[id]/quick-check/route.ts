/**
 * ข้อมูลแผงตรวจสินค้าเร็ว (ดูอย่างเดียว) — ปุ่ม "ตรวจเร็ว" ในลิ้นชักงาน Task Manager
 *
 * GET /api/creative-tasks/[id]/quick-check
 *   → { data: { parents: [{ id, code, name, introduction, description, english_description, size, parent_images, description_images,
 *                           skus: [{ code, color_th, color_en, list_price, fake_price, images }] }] } }
 *   ตัวเช็ก (lib/product-listing-checks) รันฝั่งหน้าเว็บจากข้อมูลนี้
 *
 * Parent / SKU / จำนวนรูป มาจากตัวโหลดเดียวกับปุ่ม "ดูรูป" (lib/task-images-server) → นับรูปตรงกันเสมอ
 * ราคา = ราคาขาย (list_price) + ราคาขีดฆ่า (fake_price) เท่านั้น — ไม่ส่งต้นทุน (standard_price)
 * สิทธิ์: tasks.view · อ่านอย่างเดียว ไม่แก้ข้อมูล → ไม่มีประวัติ (audit)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import { loadTaskImages } from "@/lib/task-images-server";
import { plainColor, type QuickCheckParent } from "@/lib/product-listing-checks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;
const num = (v: unknown): number | null => { const n = Number(v); return v == null || v === "" || !Number.isFinite(n) ? null : n; };
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ data: null, error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });

  const r = await loadTaskImages(supabaseAdmin(), id, {
    parentCols: ", introduction, description, english_description, size_length_cm, size_height_cm, size_thickness_cm",
    skuCols: ", color_platform_th, color_platform_en, list_price, fake_price",
  });
  if (!r.ok) return NextResponse.json({ data: null, error: r.status === 404 ? r.error : friendlyDbError(r.error) }, { status: r.status });

  const pRow = new Map(r.parentRows.map((x) => [String(x.id), x]));
  const sRow = new Map(r.skuRows.map((x) => [String(x.id), x]));
  const parents: QuickCheckParent[] = r.data.parents.map((p) => {
    const row = pRow.get(p.id) ?? {};
    const l = num(row.size_length_cm), h = num(row.size_height_cm), t = num(row.size_thickness_cm);
    return {
      id: p.id, code: p.code, name: p.name,
      introduction: str(row.introduction), description: str(row.description), english_description: str(row.english_description),
      size: l || h || t ? { length: l, height: h, thickness: t } : null,
      parent_images: p.images.length, description_images: p.description.length, thumbs: p.images.slice(0, 6).map((x) => x.key),
      skus: p.skus.map((s) => {
        const sr = sRow.get(s.id) ?? {};
        return {
          code: s.code,
          color_th: str(sr.color_th) ?? (plainColor(str(sr.color_platform_th)) || null),
          color_en: str(sr.color_platform_en),
          list_price: num(sr.list_price), fake_price: num(sr.fake_price),
          images: s.images.length,
        };
      }),
    };
  });
  return NextResponse.json({ data: { parents }, error: null }, { headers: { "Cache-Control": "no-store" } });
}
