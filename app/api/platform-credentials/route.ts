/**
 * กุญแจ API ต่อ (แบรนด์ × แพลตฟอร์ม) — /api/platform-credentials
 *  GET   ?brand_id=  (products.platforms.view)            → { keys: {[platform_id]: true} }  (บอกแค่ "มีคีย์ไหม" ไม่คืนค่าจริง)
 *  PATCH { brand_id, platform_id, api_key }  (products.platforms.manage_accounts) → บันทึก/ล้างคีย์ (api_key ว่าง = ลบ)
 * เก็บใน platform_credentials (RLS ปิด client — service role เท่านั้น) · ไม่ส่งค่าคีย์กลับทาง API
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { encryptSecret, hasMasterKey } from "@/lib/secret-box";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  const keys: Record<string, boolean> = {};
  if (brandId) {
    const { data } = await supabaseAdmin().from("platform_credentials").select("platform_id, api_key").eq("brand_id", brandId);
    for (const r of ((data ?? []) as Record<string, unknown>[])) if (r.api_key) keys[String(r.platform_id)] = true;
  }
  return NextResponse.json({ keys, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; platform_id?: string; api_key?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brand_id = (body.brand_id ?? "").trim();
  const platform_id = (body.platform_id ?? "").trim();
  if (!brand_id || !platform_id) return NextResponse.json({ error: "ต้องมี brand_id + platform_id" }, { status: 400 });
  const rawKey = (body.api_key ?? "").trim();
  // มีคีย์ใหม่ → ต้องมีกุญแจหลักก่อน แล้วเข้ารหัสก่อนเก็บ (กันเก็บแบบ plaintext)
  let stored: string | null = null;
  if (rawKey) {
    if (!hasMasterKey()) return NextResponse.json({ error: "ยังไม่ได้ตั้งกุญแจหลัก (PLATFORM_SECRET_KEY) ในโฮสต์ — ต้องตั้งก่อนจึงจะบันทึกคีย์ได้อย่างปลอดภัย" }, { status: 400 });
    try { stored = await encryptSecret(rawKey); } catch (e) { return NextResponse.json({ error: "เข้ารหัสคีย์ไม่สำเร็จ: " + (e as Error).message }, { status: 400 }); }
  }
  const admin = supabaseAdmin();
  const { error } = await admin.from("platform_credentials").upsert(
    { brand_id, platform_id, api_key: stored, meta: { enc: stored ? "v1" : null }, updated_by: user?.id ?? null, updated_at: new Date().toISOString() },
    { onConflict: "brand_id,platform_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // audit: ไม่บันทึกค่าคีย์ บันทึกแค่ว่ามีการตั้ง/ล้าง
  await writeAudit(admin, { action: "update", entityType: "platform_credential", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brand_id, platform_id, set: !!stored } });
  return NextResponse.json({ ok: true, has_key: !!stored, error: null });
}
