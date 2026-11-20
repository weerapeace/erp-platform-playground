/**
 * 🖼 ยืนยันชุดโปร (หลังดูปกก่อน/หลังในหน้ายืนยัน) → สร้างรายการรายร้าน + รอถึงเวลา (ตัวตั้งเวลาส่งให้เอง)
 *  POST { ack: true }          → status scheduled (ไม่ตั้งเวลาเริ่ม = เริ่มทันทีรอบถัดไป / กด "ทำเดี๋ยวนี้")   (products.platforms.publish)
 *  POST { undo: true }         → กลับเป็นร่าง (ได้เฉพาะยังไม่มีร้านไหนขึ้นปกโปร)
 *  ⚠️ ยืนยัน ≠ ส่งทันที: การส่งจริงเกิดตอนถึงเวลา (cron) หรือกด "ทำเดี๋ยวนี้" (/run)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { validateCampaign } from "@/lib/promo-cover";
import { hasOnShop, loadCampaignFull, syncTargets } from "@/lib/promo-cover-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await ctx.params;
  let b: { ack?: unknown; undo?: unknown } = {};
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const full = await loadCampaignFull(admin, id);
  if (!full) return NextResponse.json({ error: "ไม่พบชุดโปร" }, { status: 404 });
  const c = full.campaign;
  if (c.deleted_at) return NextResponse.json({ error: "ชุดนี้อยู่ในถังขยะ" }, { status: 400 });
  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };
  const now = new Date().toISOString();

  if (b.undo === true) {
    if (c.status !== "scheduled") return NextResponse.json({ error: "ยกเลิกการยืนยันได้เฉพาะชุดที่รอเริ่ม" }, { status: 409 });
    if (hasOnShop(full.targets)) return NextResponse.json({ error: "มีร้านขึ้นปกโปรไปแล้ว — ใช้ \"ย้อนปกเดิมเดี๋ยวนี้\" แทน" }, { status: 409 });
    await admin.from("promo_cover_campaigns").update({ status: "draft", confirmed_at: null, confirmed_by: null, updated_at: now }).eq("id", id);
    await writeAudit(admin, { action: "update", entityType: "promo_cover_campaign", entityId: id, ...actor, metadata: { name: c.name, changes: [{ field: "status", label: "สถานะ", old: c.status, new: "draft" }] } });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  if (b.ack !== true) return NextResponse.json({ error: "ต้องติ๊กยืนยันว่าเข้าใจว่าจะเปลี่ยนรูปบนร้านจริง" }, { status: 400 });
  if (c.status !== "draft") return NextResponse.json({ error: "ชุดนี้ยืนยันไปแล้ว" }, { status: 409 });
  const errors = validateCampaign(c, { forConfirm: true });
  if (!full.items.length) errors.push("ยังไม่ได้เลือกรุ่น");
  if (full.items.every((i) => !i.promo_key)) errors.push("ยังไม่มีปกโปรเลยสักรุ่น");
  if (errors.length) return NextResponse.json({ error: errors.join(" · ") }, { status: 400 });
  try {
    const r = await syncTargets(admin, c, full.items);
    if (!r.created) return NextResponse.json({ error: "ไม่มีสินค้าบนร้านที่ส่งได้เลย (ยังไม่จับคู่ / ร้านยังไม่เชื่อม / ปิดขายอยู่ทั้งหมด)", ...r }, { status: 400 });
    await admin.from("promo_cover_campaigns").update({ status: "scheduled", confirmed_at: now, confirmed_by: user?.id ?? null, revert_requested_at: null, updated_at: now }).eq("id", id);
    await writeAudit(admin, { action: "approve", entityType: "promo_cover_campaign", entityId: id, ...actor,
      metadata: { name: c.name, targets: r.created, skipped: r.skipped, starts_at: c.starts_at, ends_at: c.ends_at, platforms: c.platforms, changes: [{ field: "status", label: "สถานะ", old: "draft", new: "scheduled" }] } });
    return NextResponse.json({ ok: true, ...r }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
