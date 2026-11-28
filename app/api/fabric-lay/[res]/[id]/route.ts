/**
 * ✂️ วางแบบบนผ้าลาย — อ่าน / แก้ / ลบ รายการเดียว   (res = fabrics | patterns | plans)
 * GET    /api/fabric-lay/<res>/<id>         → { data: row } · plans แนบ fabric + patterns (แบบตัดของทุกใบในแผน) + cut_zones (ส่วนที่ตัดไปแล้วจากแผนอื่น)
 * PATCH  /api/fabric-lay/<res>/<id>         → ส่งเฉพาะช่องที่แก้ · is_active:true = กู้คืน · plans: cut_done true/false + cut_area_cm2
 * DELETE /api/fabric-lay/<res>/<id>         → ย้ายเข้าถังขยะ · ?hard=1 = ลบถาวร (เฉพาะที่อยู่ในถังขยะ)
 * แผนที่ตัดแล้ว/ยกเลิก/ลบ/กู้คืน → คิดพื้นที่ผ้าที่ใช้ไปใหม่ (used_area_cm2 = รวมแผนที่ตัดแล้วและยังไม่ลบ)
 * สิทธิ์ fabric_lay.view / fabric_lay.edit · audit ทุกการเขียน (changes: auditDiff · ก้อน JSON = แก้รายละเอียด)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { auditChangeMeta, writeAuditFor } from "@/lib/audit";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { RESOURCES, FABRICS, PLANS, UUID, VIEW_PERM, EDIT_PERM, auditSummary, bad, knownDbError } from "../../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ res: string; id: string }> };
type Admin = ReturnType<typeof supabaseAdmin>;

async function recomputeFabricUse(admin: Admin, fabricId: string) {
  const { data } = await admin.from(PLANS.table).select("cut_area_cm2").eq("fabric_id", fabricId).eq("is_active", true).not("cut_done_at", "is", null);
  const used = (data ?? []).reduce((s, r) => s + (Number(r.cut_area_cm2) || 0), 0);
  await admin.from(FABRICS.table).update({ used_area_cm2: Math.round(used * 100) / 100 }).eq("id", fabricId);
}

export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const { res, id } = await ctx.params;
  const r = RESOURCES[res];
  if (!r || !UUID.test(id)) return bad("ไม่พบข้อมูล", 404);
  const admin = supabaseAdmin();
  const { data, error } = await admin.from(r.table).select("*").eq("id", id).maybeSingle();
  if (error) return bad(friendlyDbError(error.message), 500);
  if (!data) return bad(`ไม่พบ${r.noun}นี้`, 404);
  if (r !== PLANS) return NextResponse.json({ data, error: null });

  const [fab, others] = await Promise.all([
    admin.from(FABRICS.table).select("*").eq("id", data.fabric_id).maybeSingle(),
    admin.from(PLANS.table).select("id, code, name, bags, items, settings").eq("fabric_id", data.fabric_id).eq("is_active", true).not("cut_done_at", "is", null).neq("id", id),
  ]);
  // แบบตัดของทุกใบในแผนนี้ + แผนอื่นที่ตัดแล้ว (ไว้วาดส่วนผ้าที่ตัดไปแล้ว)
  const bagsOf = (rows: { bags?: unknown }[]) => rows.flatMap((r) => ((r.bags ?? []) as { pattern_id: string }[]).map((b) => b.pattern_id));
  const pids = [...new Set([...bagsOf([data]), ...bagsOf(others.data ?? [])])].filter((x) => UUID.test(x));
  const pats = pids.length ? await admin.from("fabric_lay_patterns").select("id, code, name, parent_code, design_sheet_code, bag_image, pieces, note, is_active").in("id", pids) : { data: [] };
  return NextResponse.json({ data: { ...data, fabric: fab.data ?? null, patterns: pats.data ?? [], cut_plans: others.data ?? [] }, error: null });
}

export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  const { res, id } = await ctx.params;
  const r = RESOURCES[res];
  if (!r || !UUID.test(id)) return bad("ไม่พบข้อมูล", 404);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const admin = supabaseAdmin();
  const { data: before } = await admin.from(r.table).select("*").eq("id", id).maybeSingle();
  if (!before) return bad(`ไม่พบ${r.noun}นี้`, 404);
  const v = r.clean(body, true, before);
  if (!v.ok) return bad(v.error);

  const out: Record<string, unknown> = { ...v.patch, updated_at: new Date().toISOString() };
  if (v.patch.is_active === true) out.deleted_at = null;
  if (v.patch.is_active === false) out.deleted_at = new Date().toISOString();
  if (r === PLANS && "cut_done_at" in v.patch) {
    if (v.patch.cut_done_at && before.cut_done_at) delete out.cut_done_at;   // ตัดแล้วอยู่แล้ว ไม่ต้องเปลี่ยนเวลา
    else if (v.patch.cut_done_at) {
      let email: string | null = null;
      try { const { data: { user } } = await supabaseFromRequest(request).auth.getUser(); email = user?.email ?? null; } catch { /* ไม่มีตัวตน */ }
      out.cut_done_by = email;
    } else out.cut_done_by = null;
  }
  const { data, error } = await admin.from(r.table).update(out).eq("id", id).select("*").single();
  if (error) return bad(knownDbError(error.message) ?? friendlyDbError(error.message));
  if (r === PLANS && ("cut_done_at" in v.patch || "is_active" in v.patch || "cut_area_cm2" in v.patch)) await recomputeFabricUse(admin, String(data.fabric_id));

  const meta = auditChangeMeta(before, v.patch, { opaque: r.opaque });
  const action = v.patch.is_active === true && before.is_active === false ? "restore"
    : v.patch.is_active === false && before.is_active ? "archive"
    : r === PLANS && "cut_done_at" in v.patch && !!v.patch.cut_done_at !== !!before.cut_done_at ? (v.patch.cut_done_at ? "cut_done" : "cut_undo")
    : "update";
  await writeAuditFor(request, admin, {
    action, entityType: r.entity, entityId: id,
    metadata: { code: data.code, name: data.name, ...auditSummary(r, data), ...meta },
  });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  const { res, id } = await ctx.params;
  const r = RESOURCES[res];
  if (!r || !UUID.test(id)) return bad("ไม่พบข้อมูล", 404);
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const admin = supabaseAdmin();
  const { data: before } = await admin.from(r.table).select("*").eq("id", id).maybeSingle();
  if (!before) return bad(`ไม่พบ${r.noun}นี้`, 404);
  if (hard) {
    if (before.is_active) return bad("ลบถาวรได้เฉพาะรายการที่อยู่ในถังขยะ — ย้ายเข้าถังขยะก่อน", 409);
    const { error } = await admin.from(r.table).delete().eq("id", id);
    if (error) return bad(knownDbError(error.message) ?? friendlyDbError(error.message));
    if (r === PLANS) await recomputeFabricUse(admin, String(before.fabric_id));
    await writeAuditFor(request, admin, { action: "delete", entityType: r.entity, entityId: id, metadata: { hard: true, code: before.code, name: before.name } });
    return NextResponse.json({ id, error: null });
  }
  const now = new Date().toISOString();
  const { error } = await admin.from(r.table).update({ is_active: false, deleted_at: now, updated_at: now }).eq("id", id);
  if (error) return bad(friendlyDbError(error.message));
  if (r === PLANS) await recomputeFabricUse(admin, String(before.fabric_id));
  await writeAuditFor(request, admin, { action: "archive", entityType: r.entity, entityId: id, metadata: { hard: false, code: before.code, name: before.name } });
  return NextResponse.json({ id, error: null });
}
