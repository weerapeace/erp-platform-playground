/**
 * Field Registry v2 — update single field config
 *
 * PATCH /api/admin/field-registry-v2/<id>
 *   body: { field_label?, group_key?, is_visible?, is_filterable?, is_sortable?, is_required?, width?, display_order?, ... }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_FIELDS = [
  "field_label", "group_key", "ui_field_type",
  "is_visible", "is_required", "is_editable", "is_filterable", "is_sortable", "is_pinned", "is_searchable",
  "is_sensitive", "sensitive_permission",
  "show_in_form", "form_column_span", "placeholder", "help_text",
  "width", "min_width", "display_order", "is_active",
  "options", "validation_rules", "relation_config",
  // Sprint 12
  "default_value", "default_expression", "is_inline_editable",
  // Sprint 13
  "condition_rules",
  // Studio style presets
  "ui_style",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // เก็บเฉพาะ field ที่อนุญาตให้แก้
  const patch: Record<string, unknown> = {};
  for (const k of ALLOWED_FIELDS) {
    if (body[k] !== undefined) patch[k] = body[k];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "ไม่มี field ที่ต้อง update" }, { status: 400 });
  }

  // ตรวจ user login (auth role = authenticated)
  const userClient = supabaseFromRequest(request);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  // ใช้ service-role client เขียน (กัน RLS) — sprint 2 จะใส่ erp_can() check
  const admin = supabaseAdmin();

  // Sprint 10: fetch before-state for audit
  const before = await admin.from("erp_module_fields").select("*").eq("id", id).single();

  const { data, error } = await admin
    .from("erp_module_fields")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sprint 10: audit log — บันทึก field ที่เปลี่ยน + before/after
  if (before.data) {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(patch)) {
      const oldV = (before.data as Record<string, unknown>)[k];
      const newV = patch[k];
      if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
        changes[k] = { from: oldV, to: newV };
      }
    }
    if (Object.keys(changes).length > 0) {
      // fire-and-forget — ไม่ block response
      admin.from("erp_field_registry_audit").insert({
        module_field_id: id,
        actor_email:     user.email,
        action:          "update",
        changes,
      }).then(() => {}, () => {});
    }
  }

  return NextResponse.json({ data, error: null });
}
