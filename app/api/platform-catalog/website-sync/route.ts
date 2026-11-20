/**
 * ดึงสินค้าจากเว็บของเราเอง → รายการสินค้าของร้าน Website + จับคู่ — /api/platform-catalog/website-sync
 *  POST { brand_id }  (products.platforms.edit)
 *   → อ่านสินค้าบนเว็บทุกร้าน (store_listings) ของแบรนด์นี้ ด้วยของกลาง lib/website-catalog-sync (ชื่อ/ราคา/รูปที่ลูกค้าเห็นจริง)
 *   → บันทึก + จับคู่รหัสตรงด้วยของกลาง lib/platform-catalog-sync (แบบเดียวกับ LINE)
 *   → ตัวที่เอาออกจากเว็บแล้ว = ติดป้าย "ไม่อยู่บนร้านแล้ว" (ได้ครบทั้งร้านเสมอ เพราะอ่านจากฐานข้อมูลเราเอง)
 * อ่านอย่างเดียวฝั่งเว็บ — ไม่แตะการตั้งค่า/การซ่อน-แสดงสินค้าบนเว็บจริง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { upsertCatalogListings } from "@/lib/platform-catalog-sync";
import { loadWebsiteCatalogItems } from "@/lib/website-catalog-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brand_id = (body.brand_id ?? "").trim();
  if (!brand_id) return NextResponse.json({ error: "ต้องเลือกแบรนด์ก่อน" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", "website").maybeSingle();
  const platform_id = (pf as { id?: string } | null)?.id;
  if (!platform_id) return NextResponse.json({ error: "ยังไม่มีร้าน Website ในรายชื่อแพลตฟอร์ม" }, { status: 400 });

  let loaded;
  try { loaded = await loadWebsiteCatalogItems(admin, brand_id); }
  catch (e) { return NextResponse.json({ error: `อ่านสินค้าบนเว็บไม่ครบ — ลองใหม่อีกครั้ง (${(e as Error).message})`, retryable: true }, { status: 503 }); }
  const { items, shops } = loaded;
  if (!items.length) return NextResponse.json({ ok: true, fetched: 0, created: 0, updated: 0, matched: 0, newly_matched: 0, removed: 0, restored: 0, removed_skipped: 0, shops, error: null });

  let saved;
  try { saved = await upsertCatalogListings(admin, { platformId: platform_id, brandId: brand_id, source: "api", items, markMissing: true }); }
  catch (e) { return NextResponse.json({ error: `บันทึกไม่สำเร็จ: ${(e as Error).message}` }, { status: 400 }); }

  // ดึงเองทุกครั้งที่เปิดแท็บ → ลงประวัติเฉพาะรอบที่มีของเปลี่ยน (เพิ่มใหม่/จับคู่ใหม่/เอาออก/กลับมา) ไม่ให้ประวัติรก
  if (saved.created || saved.newly_matched || saved.removed || saved.restored) {
    await writeAudit(admin, { action: "import", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { source: "website_db", brand_id, fetched: items.length, shops, ...saved } });
  }
  return NextResponse.json({ ok: true, fetched: items.length, complete: true, shops, ...saved, error: null });
}
