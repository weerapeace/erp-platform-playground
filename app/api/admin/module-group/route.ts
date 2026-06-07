/**
 * จัดการ "กลุ่มโมดูล" (Module Group) — ของกลาง
 *
 * PATCH /api/admin/module-group
 *   body: { old: string, new?: string, icon?: string, actor? }
 *   - เปลี่ยนชื่อกลุ่ม: อัปเดต erp_modules.group_label ทุกตัว (old → new) + ย้าย/แก้เมนูกลุ่ม
 *   - เปลี่ยนไอคอนกลุ่ม: แก้ icon ของเมนูกลุ่ม
 *
 * เมนูกลุ่ม = erp_menu_items ที่ href = /master/group/<encodeURIComponent(name)>
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (error) return error.message;
  if (data !== true) return "ไม่มีสิทธิ์จัดการกลุ่มโมดูล (admin.users)";
  return null;
}

const ghref = (name: string) => `/master/group/${encodeURIComponent(name)}`;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await requireAdmin(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

  let b: { old?: string; new?: string; icon?: string; actor?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const oldName = String(b.old ?? "").trim();
  if (!oldName) return NextResponse.json({ error: "ต้องระบุชื่อกลุ่มเดิม (old)" }, { status: 400 });
  const newName = b.new !== undefined ? String(b.new).trim() : undefined;
  const icon = b.icon !== undefined ? String(b.icon).trim() : undefined;

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  // หาเมนูกลุ่มเดิม
  const { data: gMenu } = await admin.from("erp_menu_items").select("id, app_keys, section").eq("href", ghref(oldName)).maybeSingle();

  // 1) เปลี่ยนชื่อกลุ่ม (ถ้ามี new และต่างจากเดิม)
  if (newName && newName !== oldName) {
    const { error: e1 } = await admin.from("erp_modules").update({ group_label: newName }).eq("group_label", oldName);
    if (e1) return NextResponse.json({ error: "เปลี่ยนชื่อกลุ่มไม่สำเร็จ: " + e1.message }, { status: 500 });
    // ย้ายเมนูกลุ่ม (href + label) — ถ้ามีเมนูปลายทางชื่อใหม่อยู่แล้วให้ข้าม (กันชน)
    if (gMenu) {
      const { data: clash } = await admin.from("erp_menu_items").select("id").eq("href", ghref(newName)).maybeSingle();
      if (!clash) {
        await admin.from("erp_menu_items").update({
          href: ghref(newName), label: newName, ...(icon ? { icon } : {}),
        }).eq("id", gMenu.id);
      }
    }
  } else if (icon !== undefined && gMenu) {
    // 2) เปลี่ยนเฉพาะไอคอน
    await admin.from("erp_menu_items").update({ icon: icon || "🗂️" }).eq("id", gMenu.id);
  }

  await writeAudit(admin, {
    action: "module_group.update", entityType: "erp_modules",
    actorId: user?.id ?? null, actorName: b.actor ?? user?.email ?? null,
    metadata: { old: oldName, new: newName ?? null, icon: icon ?? null },
  });

  return NextResponse.json({ ok: true, group: newName || oldName });
}
