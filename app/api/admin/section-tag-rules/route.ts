/**
 * POST /api/admin/section-tag-rules
 * ตั้งกฎ "section โชว์เฉพาะแท็ก…" (whitelist) — เก็บใน erp_modules.config.section_tag_rules
 *
 * body: { module: string, rules: Record<sectionKey, string[]>, actor? }
 *   rules[sectionKey] = รายการ tag id ที่จะโชว์ section นี้ (ว่าง/ไม่มี = โชว์ทุกแท็ก)
 *
 * อ่านกฎกลับผ่าน /api/admin/field-registry-v2 (field section_tag_rules)
 * ตรวจสิทธิ์ admin.module_layout.edit · audit ลง audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.module_layout.edit");
  if (denied) return denied;

  let body: { module?: string; rules?: Record<string, string[]>; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.module) return NextResponse.json({ error: "ต้องระบุ module" }, { status: 400 });

  // ทำความสะอาด: ตัด section ที่รายการแท็กว่าง (= โชว์ทุกแท็ก ไม่ต้องเก็บ)
  const clean: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(body.rules ?? {})) {
    const arr = Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && x))] : [];
    if (arr.length) clean[k] = arr;
  }

  const admin = supabaseAdmin();
  const { data: mod, error: modErr } = await admin
    .from("erp_modules").select("id, config").eq("module_key", body.module).maybeSingle();
  if (modErr || !mod) return NextResponse.json({ error: "ไม่พบโมดูล " + body.module }, { status: 404 });

  const config = { ...((mod.config ?? {}) as Record<string, unknown>), section_tag_rules: clean };
  const { error: upErr } = await admin.from("erp_modules").update({ config }).eq("id", mod.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const userClient = supabaseFromRequest(request);
  const { data: { user } } = await userClient.auth.getUser();
  await writeAudit(admin, {
    action: "module.section_tag_rules_update", entityType: "erp_modules", entityId: mod.id as string,
    actorId: user?.id ?? null, actorName: body.actor ?? user?.email ?? null,
    metadata: { module: body.module, sections: Object.keys(clean).length },
  });

  return NextResponse.json({ ok: true, section_tag_rules: clean, error: null });
}
