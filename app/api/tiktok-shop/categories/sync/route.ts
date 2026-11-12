/**
 * ดึงหมวดหมู่ TikTok Shop → รายการหมวดให้เลือก (platform_category_options) — /api/tiktok-shop/categories/sync
 *  POST { brand_id? }  (products.platforms.edit) · brand_id ไม่ส่ง = แบรนด์เดียวที่เชื่อม TikTok
 *   → GET /product/202309/categories (ไทย th-TH + อังกฤษ en-US) → เก็บเฉพาะใบสุด ชื่อเต็ม "ราก > … > ใบ"
 *   → upsert (platform × external_id) · ไม่ลบของเดิม (การจับคู่หมวดกลางเก็บเป็นรหัส)
 *   ← { imported, leaves, available }
 * ใช้ที่: หน้าหมวดหมู่แพลตฟอร์ม › นำเข้าหมวดของร้าน › TikTok › "ดึงจาก TikTok อัตโนมัติ"
 * ⚠️ อ่านอย่างเดียว — ไม่แก้อะไรบนร้าน TikTok
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ttsGetCategories, ttsCategoryLeafPaths, ttsErrorText } from "@/lib/tiktok-shop";
import { getPlatformId, ttsTokenOrReason, ttsConnectedBrandIds } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string } = {};
  try { body = await request.json(); } catch { /* ไม่ส่ง body ก็ได้ */ }

  const admin = supabaseAdmin();
  const ttId = await getPlatformId(admin, "tiktok");
  if (!ttId) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม TikTok ในระบบ" }, { status: 400 });
  let brandId = (body.brand_id ?? "").trim();
  if (!brandId) {
    const connected = await ttsConnectedBrandIds(admin, ttId);
    if (connected.length === 0) return NextResponse.json({ error: "ยังไม่มีแบรนด์ไหนเชื่อม TikTok Shop — เชื่อมที่ บัญชีแพลตฟอร์ม › TikTok ก่อน" }, { status: 400 });
    brandId = connected[0];   // หมวดของ TikTok ไทยเหมือนกันทุกร้าน ใช้ร้านไหนดึงก็ได้
  }
  const tok = await ttsTokenOrReason(admin, brandId, ttId, user?.id ?? null);
  if (!tok.ok) return NextResponse.json({ error: tok.reason }, { status: 400 });
  const shop = tok.meta.shops?.[0];
  if (!shop?.cipher) return NextResponse.json({ error: "ยังไม่รู้รหัสร้าน TikTok — กด ตรวจการเชื่อมต่อ ที่บัญชีแพลตฟอร์มก่อน" }, { status: 400 });

  let th: Record<string, unknown>[], en: Record<string, unknown>[];
  try {
    th = await ttsGetCategories(tok.accessToken, shop.cipher, "th-TH");
    en = await ttsGetCategories(tok.accessToken, shop.cipher, "en-US").catch(() => []);   // อังกฤษไม่ได้ก็ยังใช้ไทยได้
  } catch (e) { return NextResponse.json({ error: `ดึงหมวดหมู่จาก TikTok ไม่สำเร็จ: ${ttsErrorText(e)}` }, { status: 400 }); }

  const leavesTh = ttsCategoryLeafPaths(th);
  if (leavesTh.length === 0) return NextResponse.json({ error: "TikTok ไม่ส่งหมวดหมู่กลับมา ลองใหม่อีกครั้ง" }, { status: 400 });
  const enById = new Map(ttsCategoryLeafPaths(en).map((l) => [l.id, l.path]));
  const now = new Date().toISOString();
  const rows = leavesTh.map((l) => ({ platform_id: ttId, external_id: l.id, name_th: l.path, name_en: enById.get(l.id) ?? "", updated_at: now }));
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await admin.from("platform_category_options").upsert(rows.slice(i, i + 1000), { onConflict: "platform_id,external_id" });
    if (error) return NextResponse.json({ error: `บันทึกไม่สำเร็จ: ${error.message} (บันทึกไปแล้ว ${i} จาก ${rows.length})` }, { status: 400 });
  }
  const available = leavesTh.filter((l) => !l.permission || l.permission.includes("AVAILABLE")).length;
  await writeAudit(admin, {
    action: "import", entityType: "platform_category_options", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { platform_id: ttId, source: "tiktok_api_categories", shop: shop.name, categories: th.length, leaves: rows.length, available, with_english: enById.size },
  });
  return NextResponse.json({ ok: true, imported: rows.length, leaves: rows.length, available, error: null });
}
