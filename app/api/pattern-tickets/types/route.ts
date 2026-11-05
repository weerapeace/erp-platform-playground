/**
 * /api/pattern-tickets/types — ตั้งค่าประเภทงานตั๋ว Pattern (ตอนนี้ = เปลี่ยนไอคอนของแผ่นกดเปิดตั๋ว)
 *
 * PATCH { key, icon }   (pattern.manage)
 *   icon = "img:pattern-icons/…" (รูปที่อัปผ่าน /api/admin/upload folder pattern-icons) · "i:<ไอคอนระบบ>" · "" = กลับเป็นไอคอนเดิม
 *   → { data: type, error } · เขียน audit_logs (entity_type = pattern_ticket_types)
 * ตรวจค่าด้วย cleanTypeIcon (lib/pattern-tickets) — รูปนอกโฟลเดอร์ pattern-icons ไม่รับ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { cleanTypeIcon } from "@/lib/pattern-tickets";
import { loadActor, PATTERN_TYPES_TABLE } from "@/lib/pattern-tickets-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.manage"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const key = String(body.key ?? "").trim();
  if (!key) return NextResponse.json({ error: "ไม่ได้ระบุประเภทงาน" }, { status: 400 });
  const icon = cleanTypeIcon(body.icon, key);
  if (!icon) return NextResponse.json({ error: "รูปไอคอนไม่ถูกต้อง ลองอัปโหลดใหม่" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin.from(PATTERN_TYPES_TABLE).select("key, label_th, icon").eq("key", key).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบประเภทงานนี้" }, { status: 404 });
  if (before.icon === icon) return NextResponse.json({ data: before, error: null });

  const { data, error } = await admin.from(PATTERN_TYPES_TABLE).update({ icon }).eq("key", key).select("*").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "บันทึกไอคอนไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });

  const actor = await loadActor(request, admin);
  await writeAudit(admin, {
    action: "update", entityType: PATTERN_TYPES_TABLE, entityId: null, actorId: actor.userId, actorName: actor.name,
    metadata: { type: key, label: before.label_th, field: "icon", old_value: before.icon, new_value: icon },
  });
  return NextResponse.json({ data, error: null });
}
