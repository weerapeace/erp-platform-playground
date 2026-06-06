/**
 * /api/menu — ทะเบียนเมนูกลาง (sidebar + App Launcher)
 *
 * GET            → รายการเมนู (default: เฉพาะ active; ?all=1 = ทั้งหมด สำหรับหน้าจัดการ)
 * POST {items}   → นำเข้าหลายเมนู (seed จาก default) — upsert ตาม href
 * POST {item}    → เพิ่มเมนูเดียว
 * PATCH {id,patch}→ แก้เมนู
 * DELETE ?id=    → ลบเมนู
 *
 * อ่านได้ทุก user (authenticated) — เขียนต้องมีสิทธิ์ admin.users
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MenuItem = {
  id?: string;
  section: string; section_order: number; sort_order: number;
  icon: string | null; label: string; href: string;
  show_in_sidebar: boolean; show_in_launcher: boolean;
  permission_key: string | null; is_active: boolean;
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
  // Phase 1 — cache เมนู 10 นาที (เปลี่ยนเฉพาะ admin) ลดดึงซ้ำทุก page load
  return NextResponse.json({ data: data ?? [], error: null }, { headers: { "Cache-Control": "private, max-age=600" } });
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
  let body: { id?: string; patch?: Partial<MenuItem> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id || !body.patch) return NextResponse.json({ error: "ต้องมี id + patch" }, { status: 400 });
  const { id: _drop, ...patch } = body.patch as Record<string, unknown>;
  void _drop;
  const { data, error } = await supabaseAdmin().from("erp_menu_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", body.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
