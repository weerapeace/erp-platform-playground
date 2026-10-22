/**
 * POST /api/admin/entry-modes
 * ตั้งค่า "โหมดลงรายละเอียด" ของโมดูล — เก็บใน erp_modules.config.entry_modes (ของกลาง lib/entry-modes)
 *
 * body: { module: string, modes?: EntryMode[], reset?: boolean, actor? }
 *   reset = true → ลบค่าที่ตั้งไว้ กลับไปใช้ชุดตั้งต้นในโค้ด
 *
 * อ่านกลับผ่าน /api/admin/field-registry-v2 (field entry_modes)
 * ตรวจสิทธิ์ admin.module_layout.edit · audit ลง audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { normalizeEntryModes } from "@/lib/entry-modes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.module_layout.edit");
  if (denied) return denied;

  let body: { module?: string; modes?: unknown; reset?: boolean; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.module) return NextResponse.json({ error: "ต้องระบุ module" }, { status: 400 });
  if (!body.reset && !Array.isArray(body.modes)) return NextResponse.json({ error: "ต้องส่งรายการโหมด" }, { status: 400 });

  const modes = body.reset ? null : normalizeEntryModes(body.modes);

  const admin = supabaseAdmin();
  const { data: mod, error: modErr } = await admin
    .from("erp_modules").select("id, config").eq("module_key", body.module).maybeSingle();
  if (modErr || !mod) return NextResponse.json({ error: "ไม่พบโมดูล " + body.module }, { status: 404 });

  const prev = (mod.config ?? {}) as Record<string, unknown>;
  const config = { ...prev };
  if (modes === null) delete config.entry_modes; else config.entry_modes = modes;
  const { error: upErr } = await admin.from("erp_modules").update({ config }).eq("id", mod.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const userClient = supabaseFromRequest(request);
  const { data: { user } } = await userClient.auth.getUser();
  const summary = (list: unknown) => (Array.isArray(list) ? list : []).map((m) => {
    const r = m as { key?: string; label?: string; items?: unknown[] };
    return `${r.label ?? r.key} (${Array.isArray(r.items) ? r.items.length : 0} ช่อง)`;
  });
  await writeAudit(admin, {
    action: "module.entry_modes_update", entityType: "erp_modules", entityId: mod.id as string,
    actorId: user?.id ?? null, actorName: body.actor ?? user?.email ?? null,
    metadata: {
      module: body.module, reset: !!body.reset,
      before: "entry_modes" in prev ? summary(prev.entry_modes) : "ชุดตั้งต้น",
      after: modes === null ? "ชุดตั้งต้น" : summary(modes),
    },
  });

  return NextResponse.json({ ok: true, entry_modes: modes, error: null });
}
