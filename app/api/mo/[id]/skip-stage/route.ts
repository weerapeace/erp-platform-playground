/**
 * ข้ามขั้นตอน / เอาคืน ของใบสั่งผลิต — PATCH /api/mo/[id]/skip-stage   (เฉพาะแอดมิน: admin.users)
 *   body: { stages: ("buy"|"prep"|"cut"|"dispatch"|"receive")[], skip: boolean, reason?: string }
 *   skip=true  → ติดป้ายข้ามที่ manufacturing_orders.skipped_stages (เก็บ ใคร/เมื่อไหร่/เหตุผล)
 *   skip=false → ลบป้าย (กลับเป็นเหมือนเดิม — ข้อมูลอื่นไม่เคยถูกแตะ)
 * ขั้นที่ต้องใส่เหตุผล (จ่ายงาน / รับคืน) ดูที่ของกลาง lib/mo-skip (MO_SKIP_META) · audit ลง audit_logs รายขั้น
 *
 * ข้อยกเว้นเดียว (เจ้าของอนุมัติ 2026-10-28): โหมด "🔄 อัปเดตงาน" บนบอร์ดจ่ายงาน ติดป้าย "ของครบ" ได้ด้วยสิทธิ์จ่ายงาน
 *   body { stages: ["buy"], skip: true, via: "catch_up" } + work_board.dispatch → ผ่าน (เอาป้ายออก/ขั้นอื่น ยังต้องแอดมิน)
 *   ย้อนการอัปเดต: { stages: ["buy"], skip: false, via: "catch_up" } เอาออกได้เฉพาะป้ายที่โหมดอัปเดตงานติดเอง (เหตุผลขึ้นต้น "อัปเดตงานย้อนหลัง")
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi, apiCan } from "@/lib/api-auth";
import { requestActor } from "@/lib/request-actor";
import { MO_SKIP_META, isMoSkipStage, parseSkipped, type MoSkipStage } from "@/lib/mo-skip";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  let body: { stages?: unknown; skip?: unknown; reason?: unknown; via?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const stages = Array.isArray(body.stages) ? [...new Set(body.stages.filter(isMoSkipStage))] as MoSkipStage[] : [];
  const skip = body.skip !== false;
  const catchUpBuy = body.via === "catch_up" && stages.length === 1 && stages[0] === "buy";
  let catchUpOk = false;
  if (catchUpBuy && await apiCan(request, "work_board.dispatch")) {
    if (skip) catchUpOk = true;
    else {   // ย้อน: เฉพาะป้ายที่โหมดอัปเดตงานติดไว้
      const { data: cur } = await supabaseAdmin().from("manufacturing_orders").select("skipped_stages").eq("id", id).maybeSingle();
      catchUpOk = (parseSkipped((cur as { skipped_stages?: unknown } | null)?.skipped_stages).buy?.reason ?? "").startsWith("อัปเดตงานย้อนหลัง");
    }
  }
  const denied = catchUpOk ? null : await guardApi(request, "admin.users");
  if (denied) return denied;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (stages.length === 0) return NextResponse.json({ error: "ไม่ได้เลือกขั้นตอน" }, { status: 400 });
  const needReason = stages.filter((s) => MO_SKIP_META[s].needReason);
  if (skip && needReason.length > 0 && !reason) {
    return NextResponse.json({ error: `ข้ามขั้น ${needReason.map((s) => MO_SKIP_META[s].label).join(" / ")} ต้องใส่เหตุผลก่อน` }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: mo } = await admin.from("manufacturing_orders").select("id, mo_no, status, skipped_stages").eq("id", id).maybeSingle();
  if (!mo) return NextResponse.json({ error: "ไม่พบใบสั่งผลิตนี้" }, { status: 404 });
  const m = mo as { id: string; mo_no: string; status: string | null; skipped_stages: unknown };
  if (m.status === "done" || m.status === "cancelled") return NextResponse.json({ error: "ใบนี้ปิด/ยกเลิกไปแล้ว" }, { status: 400 });

  const actor = await requestActor(supabaseFromRequest(request));
  const now = new Date().toISOString();
  const next = parseSkipped(m.skipped_stages);
  const changed: MoSkipStage[] = [];
  for (const s of stages) {
    if (skip && !next[s]) { next[s] = { by: actor.id, by_name: actor.name, at: now, reason: reason || null }; changed.push(s); }
    else if (!skip && next[s]) { delete next[s]; changed.push(s); }
  }
  if (changed.length === 0) return NextResponse.json({ skipped_stages: next, error: null });

  const { error } = await admin.from("manufacturing_orders").update({ skipped_stages: next }).eq("id", id);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });

  await admin.from("audit_logs").insert(changed.map((s) => ({
    actor_user_id: actor.id, action: skip ? "skip_stage" : "unskip_stage", entity_type: "mo", entity_id: id,
    metadata: { mo_no: m.mo_no, stage: s, stage_label: MO_SKIP_META[s].label, reason: skip ? reason || null : null, ...(catchUpBuy ? { via: "catch_up" } : {}) },
  }))).then(() => {}, () => {});
  return NextResponse.json({ skipped_stages: next, error: null });
}
