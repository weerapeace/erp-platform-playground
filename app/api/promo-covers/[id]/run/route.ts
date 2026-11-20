/**
 * 🖼 ทำงานของชุดโปรเดี๋ยวนี้ (ยิงร้านจริง · หน้าเว็บถามยืนยันก่อนเสมอ) — ทีละไม่เกิน ~45 วิ แล้วตอบ remaining (หน้าเรียกซ้ำจนครบ)
 *  POST { mode }   (products.platforms.publish)
 *    run          = ทำงานที่ถึงเวลาแล้ว (ส่ง/ย้อน)
 *    start_now    = เลื่อนเวลาเริ่มเป็นตอนนี้ แล้วส่งเลย (ชุดที่ยืนยันแล้ว)
 *    revert       = "ย้อนปกเดิมเดี๋ยวนี้" ทั้งชุด (จดเวลาที่กด → ตัวตั้งเวลาทำต่อถ้ายังไม่ครบ)
 *    retry        = ลองใหม่: ส่งไม่ผ่าน → รอส่ง · ย้อนไม่ผ่าน → ลองย้อนอีกครั้ง  (target_ids? = เฉพาะรายการ)
 *    force_revert = ย้อนทับเลย (รายการที่มีคนเปลี่ยนปกเอง) · target_ids บังคับ
 *  → RunResult
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { loadCampaignFull, revertTarget, runPromoCovers, type RunResult } from "@/lib/promo-cover-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;
const BUDGET = 42_000;
const MODES = new Set(["run", "start_now", "revert", "retry", "force_revert"]);

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await ctx.params;
  let b: { mode?: unknown; target_ids?: unknown } = {};
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const mode = String(b.mode ?? "run");
  if (!MODES.has(mode)) return NextResponse.json({ error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
  const ids = Array.isArray(b.target_ids) ? (b.target_ids as unknown[]).map(String) : null;
  const admin = supabaseAdmin();
  const full = await loadCampaignFull(admin, id);
  if (!full) return NextResponse.json({ error: "ไม่พบชุดโปร" }, { status: 404 });
  const c = full.campaign;
  if (c.deleted_at) return NextResponse.json({ error: "ชุดนี้อยู่ในถังขยะ" }, { status: 400 });
  const actor = { id: user?.id ?? null, name: user?.email ?? null };
  const now = new Date().toISOString();
  const audit = (meta: Record<string, unknown>) => writeAudit(admin, { action: "update", entityType: "promo_cover_campaign", entityId: id, actorId: actor.id, actorName: actor.name, metadata: { name: c.name, ...meta } });

  if (mode === "force_revert") {
    if (!ids?.length) return NextResponse.json({ error: "เลือกรายการที่จะย้อนทับก่อน" }, { status: 400 });
    const res: RunResult = { applied: 0, reverted: 0, failed: 0, conflict: 0, remaining: 0, campaigns: 1, timedOut: false };
    const started = Date.now();
    for (const t of full.targets.filter((x) => ids.includes(x.id) && (x.status === "conflict" || x.status === "revert_failed" || x.status === "review"))) {
      if (Date.now() - started > BUDGET) { res.timedOut = true; res.remaining++; continue; }
      const o = await revertTarget(admin, t, actor, true);
      if (o.status === "reverted") res.reverted++; else res.failed++;
    }
    await audit({ kind: "force_revert", targets: ids.length, ...res });
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  }

  if (c.status === "draft") return NextResponse.json({ error: "ชุดนี้ยังเป็นร่าง — กดตรวจก่อน/หลัง แล้วยืนยันก่อน" }, { status: 409 });
  if (mode === "start_now") {
    if (c.status !== "scheduled") return NextResponse.json({ error: "เริ่มเดี๋ยวนี้ได้เฉพาะชุดที่รอเริ่ม" }, { status: 409 });
    await admin.from("promo_cover_campaigns").update({ starts_at: now, updated_at: now }).eq("id", id);
    await audit({ kind: "start_now", changes: [{ field: "starts_at", label: "เวลาเริ่ม", old: c.starts_at, new: now }] });
  }
  if (mode === "revert") {
    if (c.status === "ended") return NextResponse.json({ error: "ชุดนี้จบแล้ว" }, { status: 409 });
    if (!c.revert_requested_at) {
      await admin.from("promo_cover_campaigns").update({ revert_requested_at: now, updated_at: now }).eq("id", id);
      await audit({ kind: "revert_now" });
    }
  }
  if (mode === "retry") {
    const pick = (s: string) => full.targets.filter((t) => t.status === s && (!ids || ids.includes(t.id))).map((t) => t.id);
    const failed = pick("failed"); const revFailed = pick("revert_failed");
    if (failed.length) await admin.from("promo_cover_targets").update({ status: "pending", error: null, updated_at: now }).in("id", failed);
    if (revFailed.length) await admin.from("promo_cover_targets").update({ status: "applied", error: null, updated_at: now }).in("id", revFailed);
    if (c.status === "ended" && (failed.length || revFailed.length)) await admin.from("promo_cover_campaigns").update({ status: "live", updated_at: now }).eq("id", id);
    await audit({ kind: "retry", failed: failed.length, revert_failed: revFailed.length });
  }
  try {
    const r = await runPromoCovers(admin, { campaignId: id, budgetMs: BUDGET, actor });
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `ทำงานไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }
}
