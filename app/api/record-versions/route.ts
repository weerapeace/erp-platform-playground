/**
 * 🕘 Record Versions — เวอร์ชันเก่าของ Parent SKU / SKU (ของกลาง lib/record-versions)
 *
 * GET /api/record-versions?entity_type=parent_skus_v2&entity_id=<uuid>[&field_key=description][&limit=100]
 *     → { versions: RecordVersion[] } เรียงใหม่ → เก่า · รูปมี image_url (ผ่าน /api/r2-image)
 * (ดู/ย้อนกลับในหน้าจอ = ขั้นถัดไป · ตอนนี้ระบบจดเงียบ ๆ อยู่เบื้องหลัง)
 * guardApi products.view — คนที่ดูสินค้าได้ ดูประวัติได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { listVersions, VERSIONED_TABLES } from "@/lib/record-versions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD = /^[a-z0-9_]+$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const entityType = (sp.get("entity_type") ?? "").trim();
  const entityId = (sp.get("entity_id") ?? "").trim();
  const fieldKey = (sp.get("field_key") ?? "").trim();
  if (!VERSIONED_TABLES.includes(entityType)) return NextResponse.json({ error: "entity_type ไม่รองรับ" }, { status: 400 });
  if (!UUID.test(entityId)) return NextResponse.json({ error: "entity_id ไม่ถูกต้อง" }, { status: 400 });
  if (fieldKey && !FIELD.test(fieldKey)) return NextResponse.json({ error: "field_key ไม่ถูกต้อง" }, { status: 400 });
  try {
    const versions = await listVersions(supabaseAdmin(), entityType, entityId, { fieldKey: fieldKey || null, limit: Number(sp.get("limit")) || 100 });
    return NextResponse.json({ versions, error: null });
  } catch (e) {
    return NextResponse.json({ error: "โหลดประวัติเวอร์ชันไม่สำเร็จ กรุณาลองใหม่", detail: e instanceof Error ? e.message : null }, { status: 500 });
  }
}
