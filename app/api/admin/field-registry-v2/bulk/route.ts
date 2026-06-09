/**
 * Field Registry v2 — bulk update + reorder
 *
 * POST /api/admin/field-registry-v2/bulk
 *   body: { ids: string[], patch: Record<string, unknown> }
 *   → update หลาย row พร้อมกัน (ใช้ใน bulk action bar)
 *
 * PATCH /api/admin/field-registry-v2/bulk
 *   body: { reorder: { id: string, display_order: number }[] }
 *   → reorder fields (drag-drop)
 *
 * ทั้งสองจะบันทึก audit log อัตโนมัติ (Sprint 10)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_BULK_FIELDS = [
  "is_visible", "is_required", "is_editable", "is_filterable", "is_sortable",
  "is_pinned", "is_searchable", "is_sensitive", "show_in_form", "is_active",
  "group_key", "ui_field_type", "sensitive_permission",
  // Sprint 12
  "is_inline_editable",
  "is_bulk_editable",
  // สิทธิ์ระดับฟิลด์ตาม role (ของกลาง)
  "view_roles", "edit_roles",
  "description",
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { ids?: unknown; patch?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const ids = Array.isArray(body.ids) ? (body.ids as string[]) : null;
  const rawPatch = (body.patch ?? {}) as Record<string, unknown>;

  if (!ids || ids.length === 0) return NextResponse.json({ error: "ต้องระบุ ids" }, { status: 400 });
  if (ids.length > 200)         return NextResponse.json({ error: "เกิน 200 row ต่อครั้ง" }, { status: 400 });

  // filter เฉพาะ field ที่อนุญาตให้ bulk
  const patch: Record<string, unknown> = {};
  for (const k of ALLOWED_BULK_FIELDS) {
    if (rawPatch[k] !== undefined) patch[k] = rawPatch[k];
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มี field ที่ bulk ได้" }, { status: 400 });

  // auth
  const userClient = supabaseFromRequest(request);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const admin = supabaseAdmin();

  // before-state สำหรับ audit
  const before = await admin.from("erp_module_fields").select("id, " + Object.keys(patch).join(", ")).in("id", ids);

  const { data, error } = await admin
    .from("erp_module_fields")
    .update(patch)
    .in("id", ids)
    .select("id");

  if (error) return NextResponse.json({ error: error.message, success: 0, failed: ids.length }, { status: 500 });

  // audit (fire-and-forget) — 1 row ต่อ id
  if (before.data) {
    const beforeMap = new Map(
      (before.data as unknown as Array<Record<string, unknown>>).map((r) => [r.id as string, r])
    );
    const auditRows = ids.map((id) => {
      const b = beforeMap.get(id) ?? {};
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const k of Object.keys(patch)) {
        const oldV = b[k];
        const newV = patch[k];
        if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
          changes[k] = { from: oldV, to: newV };
        }
      }
      return Object.keys(changes).length > 0
        ? { module_field_id: id, actor_email: user.email, action: "bulk_update", changes }
        : null;
    }).filter((r): r is NonNullable<typeof r> => r !== null);
    if (auditRows.length > 0) {
      admin.from("erp_field_registry_audit").insert(auditRows).then(() => {}, () => {});
    }
  }

  return NextResponse.json({ success: data?.length ?? 0, failed: 0, error: null });
}

// PUT = อัปเดตหลายแถว ค่าต่างกันได้ในคำขอเดียว (ใช้ตอน Studio บันทึก — แทนการ PATCH ทีละ field)
//   body: { updates: { id: string, patch: Record<string, unknown> }[] }
const ALLOWED_ROW_FIELDS = [
  ...ALLOWED_BULK_FIELDS,
  "display_order", "form_column_span", "help_text", "placeholder", "default_value", "ui_style", "width",
];
export async function PUT(request: NextRequest): Promise<NextResponse> {
  let body: { updates?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const updates = Array.isArray(body.updates) ? (body.updates as Array<{ id: string; patch: Record<string, unknown> }>) : null;
  if (!updates || updates.length === 0) return NextResponse.json({ error: "ต้องระบุ updates[]" }, { status: 400 });
  if (updates.length > 300)            return NextResponse.json({ error: "เกิน 300 row ต่อครั้ง" }, { status: 400 });

  const userClient = supabaseFromRequest(request);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const admin = supabaseAdmin();

  // อัปเดตทีละแถวแบบขนาน (แต่ละแถว = 1 id, ไม่ทับกัน → ไม่มี lock contention/deadlock)
  const results = await Promise.all(updates.map((u) => {
    if (!u?.id) return Promise.resolve({ error: { message: "missing id" } } as { error: { message: string } | null });
    const patch: Record<string, unknown> = {};
    for (const k of ALLOWED_ROW_FIELDS) if (u.patch?.[k] !== undefined) patch[k] = u.patch[k];
    if (Object.keys(patch).length === 0) return Promise.resolve({ error: null } as { error: { message: string } | null });
    return admin.from("erp_module_fields").update(patch).eq("id", u.id).select("id");
  }));

  const failed = results.filter((r) => r.error).length;
  const success = updates.length - failed;

  // audit สรุป 1 row (เลี่ยง before/after รายแถว → เร็ว)
  admin.from("erp_field_registry_audit").insert({
    module_field_id: updates[0]?.id ?? null,
    actor_email: user.email,
    action: "studio_save",
    changes: { updated_count: updates.length },
  }).then(() => {}, () => {});

  return NextResponse.json({ success, failed, error: failed > 0 ? `${failed} row failed` : null });
}

// PATCH = reorder
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: { reorder?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const list = Array.isArray(body.reorder) ? (body.reorder as Array<{ id: string; display_order: number }>) : null;
  if (!list || list.length === 0) return NextResponse.json({ error: "ต้องระบุ reorder[]" }, { status: 400 });
  if (list.length > 500)          return NextResponse.json({ error: "เกิน 500 row" }, { status: 400 });

  const userClient = supabaseFromRequest(request);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const admin = supabaseAdmin();

  // ใช้ Promise.all + update ทีละ row (Supabase ไม่มี bulk upsert พร้อม case-when)
  // ปลอดภัย: id เป็น PK, update เฉพาะ display_order
  const results = await Promise.all(
    list.map((r) =>
      admin.from("erp_module_fields").update({ display_order: r.display_order }).eq("id", r.id).select("id")
    )
  );

  const failed = results.filter((r) => r.error).length;
  const success = list.length - failed;

  // audit รวม 1 row (ไม่ต้องบันทึก before/after ของทุก row)
  admin.from("erp_field_registry_audit").insert({
    module_field_id: list[0]?.id ?? null,
    actor_email: user.email,
    action: "reorder",
    changes: { reorder_count: list.length, ids: list.map((r) => r.id) },
  }).then(() => {}, () => {});

  return NextResponse.json({ success, failed, error: failed > 0 ? `${failed} row failed` : null });
}
