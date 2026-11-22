/**
 * 🖼 กรอบโปรอัตโนมัติ — แปะกรอบ PNG พื้นใสทับปกในระบบของแต่ละรุ่น → ปกโปร (JPG จัตุรัส 1500px ในคลังรูปเรา)
 *  POST { item_ids?: string[] (ทำใหม่เฉพาะรุ่นนี้) }  → ทีละ 8 รุ่น · { done, failed, left } (left > 0 = เรียกซ้ำ)   (products.platforms.publish)
 *  ไม่แตะร้าน — แค่สร้างรูปปกโปรให้ดูก่อนยืนยัน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { applyFrameToItems, loadCampaignFull } from "@/lib/promo-cover-server";
import { syncPromoAlbum } from "@/lib/promo-cover-album";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await ctx.params;
  let b: { item_ids?: unknown } = {};
  try { b = await request.json(); } catch { /* ไม่ส่ง body = ทำทุกรุ่นที่ใช้กรอบ */ }
  const admin = supabaseAdmin();
  const full = await loadCampaignFull(admin, id);
  if (!full) return NextResponse.json({ error: "ไม่พบชุดโปร" }, { status: 404 });
  if (full.campaign.status !== "draft" && full.campaign.status !== "scheduled") return NextResponse.json({ error: "ชุดนี้ส่งขึ้นร้านแล้ว — เปลี่ยนรูปไม่ได้ (ย้อนปกเดิมก่อน)" }, { status: 409 });
  if (!full.campaign.frame_key) return NextResponse.json({ error: "ยังไม่ได้อัปรูปกรอบโปร" }, { status: 400 });
  const only = Array.isArray(b.item_ids) ? (b.item_ids as unknown[]).map(String) : undefined;
  try {
    const r = await applyFrameToItems(admin, full.campaign, full.items, { only, limit: 8 });
    if (r.done) await writeAudit(admin, { action: "update", entityType: "promo_cover_campaign", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name: full.campaign.name, kind: "frame", done: r.done, failed: r.failed.length } });
    // กลับเป็นร่างถ้ารูปเปลี่ยนหลังยืนยัน
    if (r.done && full.campaign.status === "scheduled") await admin.from("promo_cover_campaigns").update({ status: "draft", confirmed_at: null, confirmed_by: null, updated_at: new Date().toISOString() }).eq("id", id);
    // ปกที่แปะกรอบแล้ว → เก็บลงอัลบั้มปกโปร
    if (r.done) { const after = await loadCampaignFull(admin, id); if (after) await syncPromoAlbum(admin, after.campaign, after.items); }
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `แปะกรอบไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }
}
