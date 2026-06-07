/**
 * ตั้งค่าทั่วไปของโมดูล (Module General Settings) — ของกลาง
 *
 * GET   /api/admin/module-settings/<moduleKey>
 *   อ่านข้อมูลโมดูล (erp_modules) + เมนูที่ผูก (erp_menu_items) + รายชื่อ App (erp_app_groups)
 *   + รายชื่อ field (สำหรับเลือก primary field)
 *
 * PATCH /api/admin/module-settings/<moduleKey>
 *   body: { module?: {...}, menu?: {...}, actor? }
 *   - อัปเดต erp_modules (label/description/primary_field/icon/is_active/sort_order)
 *   - อัปเดต/สร้าง erp_menu_items ที่ href = /m/<table> (app_keys, แสดงในเมนู/launcher)
 *   ตรวจสิทธิ์ admin.users · audit ลง audit_logs
 *
 * รวมการตั้งค่า "ระดับโมดูล" ไว้ที่เดียว → เจ้าของที่ไม่ใช่ dev ตั้งเองได้ (CLAUDE.md §35)
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
  if (data !== true) return "ไม่มีสิทธิ์ตั้งค่าโมดูล (admin.users)";
  return null;
}

// ---- GET — รวมข้อมูลที่ต้องใช้ในหน้าตั้งค่าทั่วไป ----
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await params;
  const admin = supabaseAdmin();

  const { data: mod, error } = await admin
    .from("erp_modules")
    .select("id, module_key, table_name, label, description, primary_field, group_label, config, is_active, sort_order")
    .eq("module_key", key)
    .maybeSingle();
  if (error || !mod) return NextResponse.json({ data: null, error: "ไม่พบโมดูล" }, { status: 404 });

  const cfg = (mod.config ?? {}) as Record<string, unknown>;
  const href = `/m/${mod.table_name}`;
  const [fieldsRes, appsRes, menuRes] = await Promise.all([
    admin.from("erp_module_fields")
      .select("column_name, field_label, display_order")
      .eq("module_id", mod.id).eq("is_active", true)
      .order("display_order", { ascending: true }),
    admin.from("erp_app_groups")
      .select("key, label, icon").eq("is_active", true)
      .order("sort_order", { ascending: true }),
    admin.from("erp_menu_items")
      .select("id, app_keys, show_in_sidebar, show_in_launcher, section")
      .eq("href", href).maybeSingle(),
  ]);

  const fields = (fieldsRes.data ?? [])
    .filter((f) => f.column_name)
    .map((f) => ({ value: String(f.column_name), label: String(f.field_label ?? f.column_name) }));

  return NextResponse.json({
    data: {
      module: {
        key:           mod.module_key,
        table:         mod.table_name,
        label:         mod.label ?? "",
        description:   mod.description ?? "",
        primary_field: mod.primary_field ?? "",
        group_label:   mod.group_label ?? "",
        icon:          (cfg.icon as string) ?? "🧩",
        is_active:     mod.is_active !== false,
        sort_order:    mod.sort_order ?? 100,
      },
      fields,
      apps: appsRes.data ?? [],
      menu: menuRes.data ?? null,
    },
    error: null,
  });
}

// ---- PATCH — บันทึกการตั้งค่า ----
type PatchBody = {
  module?: {
    label?: string; description?: string; primary_field?: string; group_label?: string;
    icon?: string; is_active?: boolean; sort_order?: number;
  };
  menu?: { app_keys?: string[]; show_in_sidebar?: boolean; show_in_launcher?: boolean };
  actor?: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await params;
  const denied = await requireAdmin(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  const { data: mod } = await admin
    .from("erp_modules").select("id, table_name, config, label")
    .eq("module_key", key).maybeSingle();
  if (!mod) return NextResponse.json({ error: "ไม่พบโมดูล" }, { status: 404 });

  // ---- 1) อัปเดต erp_modules ----
  const m = body.module ?? {};
  const cfg = { ...((mod.config ?? {}) as Record<string, unknown>) };
  if (typeof m.icon === "string" && m.icon.trim()) cfg.icon = m.icon.trim();

  const modPatch: Record<string, unknown> = { config: cfg };
  if (m.label !== undefined)         modPatch.label = String(m.label).trim() || mod.label;
  if (m.description !== undefined)   modPatch.description = m.description;
  if (m.primary_field !== undefined) modPatch.primary_field = m.primary_field || null;
  if (m.group_label !== undefined)   modPatch.group_label = (m.group_label ?? "").trim() || null;
  if (m.is_active !== undefined)     modPatch.is_active = !!m.is_active;
  if (m.sort_order !== undefined)    modPatch.sort_order = Number(m.sort_order) || 0;

  const { error: modErr } = await admin.from("erp_modules").update(modPatch).eq("id", mod.id);
  if (modErr) return NextResponse.json({ error: modErr.message }, { status: 400 });

  // ---- 2) อัปเดต/สร้าง เมนูที่ผูกกับโมดูล (href = /m/<table>) ----
  const mn = body.menu ?? {};
  const href = `/m/${mod.table_name}`;
  const label = (modPatch.label as string) ?? mod.label ?? key;
  const icon  = (cfg.icon as string) ?? "🧩";

  const { data: existing } = await admin
    .from("erp_menu_items").select("id, section, app_keys").eq("href", href).maybeSingle();

  const menuPatch: Record<string, unknown> = { label, icon };
  if (mn.app_keys !== undefined)        menuPatch.app_keys = mn.app_keys;
  if (mn.show_in_sidebar !== undefined) menuPatch.show_in_sidebar = !!mn.show_in_sidebar;
  if (mn.show_in_launcher !== undefined) menuPatch.show_in_launcher = !!mn.show_in_launcher;

  if (existing) {
    const { error: e } = await admin.from("erp_menu_items").update(menuPatch).eq("id", existing.id);
    if (e) return NextResponse.json({ error: e.message }, { status: 400 });
  } else {
    // ยังไม่มีเมนู → สร้างใหม่ (ค่าเริ่มต้นหมวด "โมดูลที่สร้างเอง")
    const { error: e } = await admin.from("erp_menu_items").insert({
      section: "โมดูลที่สร้างเอง", section_order: 90,
      sort_order: (m.sort_order as number) ?? 100,
      icon, label, href,
      show_in_sidebar:  mn.show_in_sidebar ?? false,
      show_in_launcher: mn.show_in_launcher ?? false,
      app_keys: mn.app_keys ?? [], is_active: true,
    });
    if (e) return NextResponse.json({ error: e.message }, { status: 400 });
  }

  // ---- 2.5) เมนูกลุ่ม (auto) — ตั้ง group_label แล้วให้กลุ่มโผล่ใน sidebar เอง ----
  // ชี้ไปหน้ารวมแท็บ /master/group/<กลุ่ม> · ใช้ section + app_keys เดียวกับโมดูล
  const groupVal = m.group_label !== undefined ? ((m.group_label ?? "").trim() || null) : undefined;
  if (groupVal) {
    const ghref = `/master/group/${encodeURIComponent(groupVal)}`;
    const gSection = (existing?.section as string | null) ?? "Master Data";
    const { data: gExisting } = await admin.from("erp_menu_items").select("id, app_keys").eq("href", ghref).maybeSingle();
    // กัน app_keys ของเมนูกลุ่มโดนรีเซ็ต: ใช้ที่ส่งมา > ของเมนูกลุ่มเดิม > ของเมนูโมดูล
    const gAppKeys = mn.app_keys ?? (gExisting?.app_keys as string[] | null) ?? (existing?.app_keys as string[] | null) ?? [];
    const gPatch: Record<string, unknown> = {
      label: groupVal, icon: "🗂️", app_keys: gAppKeys, show_in_sidebar: true, is_active: true,
    };
    if (gExisting) {
      await admin.from("erp_menu_items").update(gPatch).eq("id", gExisting.id).then(() => {}, () => {});
    } else {
      await admin.from("erp_menu_items").insert({
        section: gSection, section_order: 20, sort_order: 50, href: ghref, ...gPatch,
      }).then(() => {}, () => {});
    }
    // ซ่อนเมนูย่อยของโมดูลนี้จาก sidebar (กันซ้ำกับเมนูกลุ่ม) — ออกจากกลุ่มค่อยเปิดคืนเอง
    if (existing) await admin.from("erp_menu_items").update({ show_in_sidebar: false }).eq("id", existing.id).then(() => {}, () => {});
  }

  // ---- 3) audit (ของกลาง — ลง audit_logs, ไม่ throw) ----
  await writeAudit(admin, {
    action: "module.settings_update", entityType: "erp_modules", entityId: mod.id,
    actorId: user?.id ?? null, actorName: body.actor ?? user?.email ?? null,
    metadata: { module: key, module_patch: modPatch, menu_patch: menuPatch },
  });

  return NextResponse.json({ ok: true, error: null });
}
