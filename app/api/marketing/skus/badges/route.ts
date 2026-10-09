import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { cleanIds } from "@/lib/marketing/sku-list";

export const dynamic = "force-dynamic";

// ป้ายเสริม (badge) ของรุ่น — ติดได้หลายป้าย/รุ่น
// PUT { parent_sku_ids, badge_ids, mode }
//   mode "set"    = ตั้งให้ตรงตามนี้ (ใช้กับรุ่นเดียวจากป๊อปแก้ป้าย)
//   mode "add"    = เพิ่มป้ายเหล่านี้ให้ทุกรุ่นที่เลือก (คงป้ายเดิมไว้)
//   mode "remove" = เอาป้ายเหล่านี้ออกจากทุกรุ่นที่เลือก
export async function PUT(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;

  let body: { parent_sku_ids?: unknown; badge_ids?: unknown; mode?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  const mode = body.mode === "add" || body.mode === "remove" ? body.mode : "set";
  const parentIds = cleanIds(body.parent_sku_ids);
  const badgeIds = cleanIds(body.badge_ids, 50);
  if (parentIds.length === 0) return NextResponse.json({ data: null, error: "ยังไม่ได้เลือกรุ่น" }, { status: 400 });
  if (mode !== "set" && badgeIds.length === 0) return NextResponse.json({ data: null, error: "ยังไม่ได้เลือกป้ายเสริม" }, { status: 400 });

  const admin = supabaseAdmin();
  // ป้ายต้องเป็นชนิด "ป้ายเสริม" ที่มีอยู่จริง (กันส่งป้ายหลักมาปน)
  if (badgeIds.length) {
    const { data: ok, error } = await admin.from("marketing_sku_labels").select("id").eq("kind", "badge").in("id", badgeIds);
    if (error) return NextResponse.json({ data: null, error: "ตรวจป้ายไม่สำเร็จ: " + error.message }, { status: 500 });
    if ((ok ?? []).length !== badgeIds.length) return NextResponse.json({ data: null, error: "มีป้ายเสริมที่ไม่พบ (อาจถูกลบไปแล้ว) — ลองโหลดหน้าใหม่" }, { status: 400 });
  }
  const { data: parents, error: pErr } = await admin.from("parent_skus_v2").select("id").in("id", parentIds);
  if (pErr) return NextResponse.json({ data: null, error: "ตรวจรุ่นไม่สำเร็จ: " + pErr.message }, { status: 500 });
  const valid = (parents ?? []).map((p) => p.id as string);
  if (valid.length === 0) return NextResponse.json({ data: null, error: "ไม่พบรุ่นที่เลือก" }, { status: 400 });

  const { data: before } = await admin.from("marketing_sku_badge_map").select("parent_sku_id, badge_id").in("parent_sku_id", valid);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  if (mode === "remove" || mode === "set") {
    let del = admin.from("marketing_sku_badge_map").delete().in("parent_sku_id", valid);
    if (mode === "remove") del = del.in("badge_id", badgeIds);
    else if (badgeIds.length) del = del.not("badge_id", "in", `(${badgeIds.join(",")})`);   // set: ลบเฉพาะที่ไม่อยู่ในชุดใหม่
    const { error } = await del;
    if (error) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 500 });
  }
  if ((mode === "add" || mode === "set") && badgeIds.length) {
    const rows = valid.flatMap((parent_sku_id) => badgeIds.map((badge_id) => ({ parent_sku_id, badge_id, created_by: user?.id ?? null })));
    const { error } = await admin.from("marketing_sku_badge_map").upsert(rows, { onConflict: "parent_sku_id,badge_id", ignoreDuplicates: true });
    if (error) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 500 });
  }

  await writeAudit(admin, {
    action: `marketing.badge.${mode}`, entityType: "marketing_sku_badge_map", entityId: valid.length === 1 ? valid[0] : null,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { parent_sku_ids: valid, badge_ids: badgeIds, before: before ?? [] },
  });

  // คืนป้ายล่าสุดของแต่ละรุ่น (ให้หน้าเว็บอัปเดตตรงกับ DB)
  const { data: after } = await admin.from("marketing_sku_badge_map").select("parent_sku_id, badge_id, created_at").in("parent_sku_id", valid).order("created_at");
  const byParent: Record<string, string[]> = Object.fromEntries(valid.map((id) => [id, [] as string[]]));
  for (const r of after ?? []) byParent[r.parent_sku_id as string]?.push(r.badge_id as string);
  return NextResponse.json({ data: { updated: valid.length, badges_by_parent: byParent }, error: null });
}
