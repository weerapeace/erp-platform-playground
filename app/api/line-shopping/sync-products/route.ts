/**
 * ดึงสินค้าจาก LINE SHOPPING → เก็บลง platform_catalog_listings + จับคู่ ERP — /api/line-shopping/sync-products
 *  POST { brand_id }  (products.platforms.edit)
 *   → โหลด api_key (ถอดรหัส) ของ (แบรนด์ × line_shopping) → วนดึงสินค้าทุกหน้า (GET /products)
 *   → แปลงเป็นรายการสินค้า → บันทึก + จับคู่รหัสตรงด้วยของกลาง lib/platform-catalog-sync (เหมือน Lazada)
 * 🐛 เดิมบันทึกเองทีเดียวทั้งร้าน (Louis Montini 921 ตัว) → เกิน 8 วิ ฐานข้อมูลตัดทิ้ง ("statement timeout")
 *    + เดิมเอาคู่ที่เดาจากรหัสทับคู่ที่คนจับไว้ (รวมตัวที่กด "ไม่ต้องจับคู่") → ใช้ของกลางที่ส่งทีละชุดและไม่ทับคู่เดิม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { decryptSecret } from "@/lib/secret-box";
import { syncLineProductsFull } from "../products-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brand_id = (body.brand_id ?? "").trim();
  if (!brand_id) return NextResponse.json({ error: "ต้องเลือกแบรนด์/ร้านก่อน" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", "line_shopping").maybeSingle();
  const platform_id = (pf as { id?: string } | null)?.id;
  if (!platform_id) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม LINE SHOPPING" }, { status: 400 });

  const { data: cred } = await admin.from("platform_credentials").select("api_key").eq("brand_id", brand_id).eq("platform_id", platform_id).maybeSingle();
  const stored = (cred as { api_key?: string } | null)?.api_key;
  if (!stored) return NextResponse.json({ error: "ยังไม่ได้ใส่ API Key ของแบรนด์นี้" }, { status: 400 });
  let apiKey: string;
  try { apiKey = await decryptSecret(stored); } catch { return NextResponse.json({ error: "ถอดรหัสคีย์ไม่ได้ (กุญแจหลักไม่ตรง/หาย?)" }, { status: 400 }); }

  // ดึงทั้งร้าน + บันทึก + จับคู่ = ตัวดึงตัวเดียวของ LINE (../products-sync · ใช้ร่วมกับตัวดึงทุกชั่วโมง)
  const r = await syncLineProductsFull(admin, { platformId: platform_id, brandId: brand_id, apiKey });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const { ok: _ok, api_total: apiTotal, ...saved } = r;
  await writeAudit(admin, { action: "import", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { source: "line_api", brand_id, api_total: apiTotal, ...saved } });
  return NextResponse.json({ ok: true, api_total: apiTotal, ...saved, error: null });
}
