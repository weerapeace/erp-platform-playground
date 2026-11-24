/**
 * บัญชีโฆษณาที่ดึงยอด — PATCH /api/marketing/ads/accounts { platform, account_id, is_active }
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 3) · ปิด = หยุดดึงบัญชีนี้ (ยอดเก่ายังอยู่) · เปิดกลับได้ · มี audit · หน้าเว็บมีปุ่มย้อนกลับ
 * ไม่มีลบถาวร: ข้อมูลโฆษณาเก่าใช้ดูย้อนหลัง · "ตัดการเชื่อม Meta" = ปิดทุกบัญชี + ลบกุญแจ (disconnect: true)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit, auditChangeMeta } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  let body: { platform?: string; account_id?: string; is_active?: boolean; disconnect?: boolean; brand_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  const platform = String(body.platform ?? "").trim();
  if (!["shopee", "meta"].includes(platform)) return NextResponse.json({ error: "ช่องทางไม่ถูกต้อง" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  if (body.disconnect) {
    if (platform !== "meta" || !body.brand_id) return NextResponse.json({ error: "ตัดการเชื่อมได้เฉพาะ Meta ของแบรนด์ที่เลือก" }, { status: 400 });
    const { error } = await admin.from("marketing_ads_accounts").update({ is_active: false, token_enc: null, updated_by: user?.id ?? null, updated_at: now }).eq("platform", "meta").eq("brand_id", body.brand_id);
    if (error) return NextResponse.json({ error: "ตัดการเชื่อมไม่สำเร็จ" }, { status: 400 });
    await writeAudit(admin, { action: "update", entityType: "marketing_ads_account", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform, brand_id: body.brand_id, label: "ตัดการเชื่อม Meta Ads" } });
    return NextResponse.json({ ok: true, error: null });
  }

  const accountId = String(body.account_id ?? "").trim();
  if (!accountId || typeof body.is_active !== "boolean") return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  const { data: cur } = await admin.from("marketing_ads_accounts").select("is_active, account_name").eq("platform", platform).eq("account_id", accountId).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบบัญชีนี้" }, { status: 404 });
  const { error } = await admin.from("marketing_ads_accounts").update({ is_active: body.is_active, updated_by: user?.id ?? null, updated_at: now }).eq("platform", platform).eq("account_id", accountId);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 400 });
  await writeAudit(admin, {
    action: "update", entityType: "marketing_ads_account", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { platform, account_id: accountId, label: `บัญชีโฆษณา ${(cur as { account_name?: string }).account_name ?? accountId}`, ...auditChangeMeta({ is_active: (cur as { is_active: boolean }).is_active }, { is_active: body.is_active }) },
  });
  return NextResponse.json({ ok: true, before: (cur as { is_active: boolean }).is_active, error: null });
}
