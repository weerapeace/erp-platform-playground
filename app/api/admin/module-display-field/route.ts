/**
 * POST /api/admin/module-display-field
 * ตั้ง "ฟิลด์ชื่อหลัก (display)" ของโมดูล + ทำให้มีผลจริงทั่วระบบ
 *
 * body: { module_key, field }   // field = column_name ที่จะใช้เป็นชื่อตัวแทน (ว่าง = ยกเลิก)
 *
 * ทำ 2 อย่าง:
 *  1) erp_modules.primary_field = field
 *  2) อัปเดต relation ทุกตัว (ในโมดูลอื่น) ที่ชี้มาที่โมดูลนี้ → ตั้ง target_label_field = field
 *     เพื่อให้ picker / dropdown / ป้าย relation โชว์ฟิลด์นี้ทันที (ใช้เส้นทาง resolve เดิม)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "admin.field_registry.edit"); if (denied) return denied;
  let b: { module_key?: string; field?: string; actor?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!b.module_key) return NextResponse.json({ error: "ต้องมี module_key" }, { status: 400 });
  const field = String(b.field ?? "").trim();   // ว่าง = ล้างค่า

  const admin = supabaseAdmin();

  // 1) หาโมดูลนี้
  const { data: mod, error: modErr } = await admin
    .from("erp_modules").select("id, module_key, table_name").eq("module_key", b.module_key).maybeSingle();
  if (modErr || !mod) return NextResponse.json({ error: "ไม่พบโมดูล " + b.module_key }, { status: 404 });

  // 2) ตั้ง primary_field
  const { error: upErr } = await admin.from("erp_modules").update({ primary_field: field || null }).eq("id", mod.id);
  if (upErr) return NextResponse.json({ error: "บันทึก primary_field ไม่สำเร็จ: " + upErr.message }, { status: 500 });

  // 3) propagate → relation ในโมดูลอื่นที่ชี้มาที่โมดูลนี้ (ให้โชว์ฟิลด์ใหม่)
  let propagated = 0;
  if (field) {
    const { data: rels } = await admin.from("erp_module_fields")
      .select("id, relation_config")
      .eq("ui_field_type", "relation").eq("is_active", true);
    for (const r of (rels ?? []) as { id: string; relation_config: Record<string, unknown> | null }[]) {
      const rc = (r.relation_config ?? {}) as Record<string, unknown>;
      const pointsHere = String(rc.target_table ?? "") === mod.table_name || String(rc.target_module_key ?? "") === mod.module_key;
      if (!pointsHere) continue;
      const next = { ...rc, target_label_field: field, target_search_fields: [field] };
      const { error: rErr } = await admin.from("erp_module_fields").update({ relation_config: next }).eq("id", r.id);
      if (!rErr) propagated += 1;
    }
  }

  // 4) audit
  await writeAudit(admin, {
    action: "module.set_display_field", entityType: mod.table_name as string,
    actorName: b.actor ?? "system",
    metadata: { module: b.module_key, display_field: field || null, relations_updated: propagated },
  });

  return NextResponse.json({ ok: true, primary_field: field || null, relations_updated: propagated });
}
