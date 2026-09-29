/**
 * Lookup Types — GET list ของ type ทั้งหมด (สำหรับ admin UI dropdown)
 * POST   — สร้าง type ใหม่
 * PATCH  — { lookup_type, label?, icon?, description? } เปลี่ยนชื่อ/ไอคอน/คำอธิบาย (รหัส type เปลี่ยนไม่ได้ — ฟิลด์อื่นอ้างถึง)
 * DELETE — ?type=  ลบ type ที่สร้างผิด (ต้องไม่มีค่าข้างใน + ไม่มีฟิลด์ไหนใช้อยู่ · type ของระบบลบไม่ได้)
 * เขียน (POST/PATCH/DELETE) ต้องมีสิทธิ์ admin.field_registry.edit + audit
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

const WRITE_PERM = "admin.field_registry.edit";

export type LookupType = {
  lookup_type: string;
  label:       string;
  icon:        string | null;
  description: string | null;
  is_system:   boolean;
  has_parent:  boolean;
  created_at:  string;
};

const SAFE = /^[a-z_][a-z0-9_]*$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = supabaseFromRequest(request);
  const { data, error } = await supabase
    .from("erp_lookup_types")
    .select("lookup_type, label, icon, description, is_system, has_parent, created_at")
    .order("is_system", { ascending: false })
    .order("label",     { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, WRITE_PERM); if (denied) return denied;
  let body: Partial<LookupType> & { lookup_type?: string; label?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const type  = (body.lookup_type ?? "").toLowerCase().trim();
  const label = (body.label ?? "").trim();
  if (!type || !SAFE.test(type)) return NextResponse.json({ error: "invalid lookup_type — ใช้ตัวอักษร a-z + _" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });

  const supabase = supabaseFromRequest(request);
  const { data, error } = await supabase
    .from("erp_lookup_types")
    .insert({
      lookup_type: type,
      label,
      icon:        body.icon ?? null,
      description: body.description ?? null,
      is_system:   false,
      has_parent:  body.has_parent ?? false,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, WRITE_PERM); if (denied) return denied;
  let body: { lookup_type?: string; label?: string; icon?: string | null; description?: string | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const type = (body.lookup_type ?? "").toLowerCase().trim();
  if (!type) return NextResponse.json({ error: "ต้องระบุ type" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("erp_lookup_types").select("lookup_type, label, icon, description").eq("lookup_type", type).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบ type นี้" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) {
    const label = String(body.label ?? "").trim();
    if (!label) return NextResponse.json({ error: "ชื่อห้ามว่าง" }, { status: 400 });
    patch.label = label;
  }
  if (body.icon !== undefined) patch.icon = String(body.icon ?? "").trim() || null;
  if (body.description !== undefined) patch.description = String(body.description ?? "").trim() || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ data: cur, error: null });

  const { data, error } = await admin.from("erp_lookup_types").update(patch).eq("lookup_type", type).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "update", entityType: "erp_lookup_type", actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { lookup_type: type, old: cur, new: patch } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, WRITE_PERM); if (denied) return denied;
  const type = (new URL(request.url).searchParams.get("type") ?? "").toLowerCase().trim();
  if (!type) return NextResponse.json({ error: "ต้องระบุ type" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("erp_lookup_types").select("lookup_type, label, icon, description, is_system").eq("lookup_type", type).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบ type นี้" }, { status: 404 });
  if ((cur as { is_system?: boolean }).is_system) return NextResponse.json({ error: "type นี้เป็นของระบบ ลบไม่ได้" }, { status: 400 });

  const { count: values } = await admin.from("erp_lookups").select("id", { count: "exact", head: true }).eq("lookup_type", type);
  if ((values ?? 0) > 0) return NextResponse.json({ error: `ยังมีค่าอยู่ ${values} รายการใน type นี้ — ลบค่าข้างในให้หมดก่อน` }, { status: 400 });

  const { data: used } = await admin.from("erp_module_fields").select("field_key, field_label").eq("relation_config->>lookup_type", type).not("is_active", "is", false).limit(5);
  if (used && used.length > 0) {
    const names = (used as { field_key?: string; field_label?: string }[]).map((u) => u.field_label || u.field_key || "?").join(", ");
    return NextResponse.json({ error: `มีฟิลด์ใช้ type นี้อยู่ (${names}) — เปลี่ยนฟิลด์ไปใช้ตัวอื่นก่อน` }, { status: 400 });
  }

  const { error } = await admin.from("erp_lookup_types").delete().eq("lookup_type", type);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "delete", entityType: "erp_lookup_type", actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { lookup_type: type, snapshot: cur } });
  return NextResponse.json({ data: { deleted: type }, error: null });
}
