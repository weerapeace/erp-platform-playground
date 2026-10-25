/**
 * /api/menu — ทะเบียนเมนูกลาง (sidebar + App Launcher)
 *
 * GET            → รายการเมนู (default: เฉพาะ active; ?all=1 = ทั้งหมด สำหรับหน้าจัดการ)
 * POST {items}   → นำเข้าหลายเมนู (seed จาก default) — upsert ตาม href
 * POST {item}    → เพิ่มเมนูเดียว
 * PATCH {id,patch}→ แก้เมนู (มีประวัติใน audit_logs · patch.audience = ใครเห็นเมนูนี้ — lib/menu-audience)
 *   + app_override {app_key, set:{sort?,place?}} = จัดเรียง/ซ่อนเมนูเฉพาะแอปนั้น (รวมเข้า app_overrides ฝั่งเซิร์ฟเวอร์ — lib/app-menu-layout)
 * DELETE ?id=    → ลบเมนู
 *
 * อ่านได้ทุก user (authenticated) — เขียนต้องมีสิทธิ์ admin.users
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { cleanAudience } from "@/lib/menu-audience";
import { mergeAppOverride, type AppMenuOverrideSet } from "@/lib/app-menu-layout";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MenuItem = {
  id?: string;
  section: string; section_order: number; sort_order: number;
  icon: string | null; label: string; href: string;
  show_in_sidebar: boolean; show_in_launcher: boolean;
  permission_key: string | null; is_active: boolean;
  parent_id?: string | null;   // เมนูแม่ (null = เมนูหลัก)
};

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (error) return error.message;
  if (data !== true) return "ไม่มีสิทธิ์จัดการเมนู (admin.users)";
  return null;
}

export async function GET(request: NextRequest) {
  const all = new URL(request.url).searchParams.get("all") === "1";
  let q = supabaseFromRequest(request).from("erp_menu_items").select("*")
    .order("section_order", { ascending: true }).order("sort_order", { ascending: true });
  if (!all) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  // cache เมนูสั้น ๆ (30 วิ) — แก้เมนู/กลุ่มแล้วเห็นไว แต่ยังลดดึงซ้ำตอนสลับหน้าเร็ว ๆ
  return NextResponse.json({ data: data ?? [], error: null }, { headers: { "Cache-Control": "private, max-age=30" } });
}

export async function POST(request: NextRequest) {
  const err = await requireAdmin(request);
  if (err) return NextResponse.json({ error: err }, { status: 403 });
  let body: { items?: MenuItem[]; item?: MenuItem };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();

  if (Array.isArray(body.items)) {
    // seed/import — upsert ตาม href (ไม่ทับของที่มีอยู่)
    const rows = body.items.filter((i) => i.href && i.label);
    if (rows.length === 0) return NextResponse.json({ ok: true, inserted: 0, error: null });
    const { error, count } = await admin.from("erp_menu_items").upsert(rows, { onConflict: "href", ignoreDuplicates: true, count: "exact" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, inserted: count ?? rows.length, error: null });
  }
  if (body.item) {
    const { data, error } = await admin.from("erp_menu_items").insert(body.item).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  }
  return NextResponse.json({ error: "ไม่มีข้อมูล" }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const err = await requireAdmin(request);
  if (err) return NextResponse.json({ error: err }, { status: 403 });
  let body: { id?: string; patch?: Partial<MenuItem>; app_override?: { app_key?: string; set?: AppMenuOverrideSet } };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ao = body.app_override;
  if (!body.id || (!body.patch && !ao)) return NextResponse.json({ error: "ต้องมี id + patch" }, { status: 400 });
  if (ao && (!ao.app_key || !ao.set)) return NextResponse.json({ error: "app_override ต้องมี app_key + set" }, { status: 400 });
  const { id: _drop, ...patch } = (body.patch ?? {}) as Record<string, unknown>;
  void _drop;
  if ("audience" in patch) patch.audience = cleanAudience(patch.audience);   // ว่าง = null (ทุกคนเห็น)
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("erp_menu_items").select("*").eq("id", body.id).maybeSingle();
  // ↕️ จัดเรียง/ซ่อนเมนูต่อแอป — รวมกับค่าล่าสุดในฐานข้อมูล (ไม่ทับค่าของแอปอื่น · lib/app-menu-layout)
  if (ao) patch.app_overrides = mergeAppOverride((before as { app_overrides?: unknown } | null)?.app_overrides, ao.app_key!, ao.set!);
  const { data, error } = await admin.from("erp_menu_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", body.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // ประวัติ: ช่องที่เปลี่ยนจริง (ก่อน → หลัง)
  const prev = (before ?? {}) as Record<string, unknown>;
  const changes = Object.fromEntries(Object.keys(patch).filter((k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(patch[k] ?? null)).map((k) => [k, { from: prev[k] ?? null, to: patch[k] ?? null }]));
  if (Object.keys(changes).length) {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    await writeAudit(admin, {
      action: "menu.update", entityType: "erp_menu_items", entityId: body.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { label: prev.label ?? null, href: prev.href ?? null, changes },
    });
  }
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest) {
  const err = await requireAdmin(request);
  if (err) return NextResponse.json({ error: err }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
  const { error } = await supabaseAdmin().from("erp_menu_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
