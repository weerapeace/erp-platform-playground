/**
 * /api/menu/sections — หมวดเมนู (ต่อแอป) สำหรับไอคอน + ลำดับหมวด
 * GET (ทุก user, ผ่าน RLS select) · PATCH (admin.users) upsert/rename/reorder
 * ของกลาง: ใช้ทั้งหน้า /admin/menu และเมนูซ้ายจริง (playground-shell)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MenuSection = {
  id?: string; app_key: string; name: string;
  icon: string | null; icon_url: string | null; sort_order: number;
};

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (error) return error.message;
  if (data !== true) return "ไม่มีสิทธิ์จัดการหมวดเมนู (admin.users)";
  return null;
}

export async function GET(request: NextRequest) {
  const { data, error } = await supabaseFromRequest(request)
    .from("erp_menu_sections").select("*").order("app_key", { ascending: true }).order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null }, { headers: { "Cache-Control": "private, max-age=30" } });
}

type PatchBody =
  | { kind?: "upsert"; app_key: string; name: string; patch: Partial<Pick<MenuSection, "icon" | "icon_url" | "sort_order">> }
  | { kind: "rename"; app_key: string; name: string; rename: string }
  | { kind: "reorder"; app_key: string; order: string[] };

export async function PATCH(request: NextRequest) {
  const err = await requireAdmin(request);
  if (err) return NextResponse.json({ error: err }, { status: 403 });
  let body: PatchBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  // เปลี่ยนชื่อหมวด (ของแอปนั้น) — ถ้าชื่อใหม่ชนของเดิม รวมเข้าด้วยกัน (ลบตัวชนก่อน)
  if (body.kind === "rename") {
    const app_key = (body.app_key ?? "").trim(); const name = (body.name ?? "").trim(); const rename = (body.rename ?? "").trim();
    if (!app_key || !name || !rename) return NextResponse.json({ error: "ต้องมี app_key, name, rename" }, { status: 400 });
    if (rename === name) return NextResponse.json({ ok: true, error: null });
    await admin.from("erp_menu_sections").delete().eq("app_key", app_key).eq("name", rename);
    const { error } = await admin.from("erp_menu_sections").update({ name: rename, updated_at: now }).eq("app_key", app_key).eq("name", name);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, error: null });
  }

  // เรียงลำดับหมวดของแอป — upsert sort_order ตามลำดับชื่อที่ส่งมา (lazy create แถวที่ยังไม่มี)
  if (body.kind === "reorder") {
    const app_key = (body.app_key ?? "").trim();
    if (!app_key || !Array.isArray(body.order)) return NextResponse.json({ error: "ต้องมี app_key + order[]" }, { status: 400 });
    const rows = body.order.map((name, i) => ({ app_key, name, sort_order: (i + 1) * 10, updated_at: now }));
    const { error } = await admin.from("erp_menu_sections").upsert(rows, { onConflict: "app_key,name" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, error: null });
  }

  // upsert ไอคอน/ลำดับ ของหมวดเดียว (lazy create)
  const app_key = (body.app_key ?? "").trim(); const name = (body.name ?? "").trim();
  if (!app_key || !name || !body.patch) return NextResponse.json({ error: "ต้องมี app_key, name, patch" }, { status: 400 });
  const { data, error } = await admin.from("erp_menu_sections")
    .upsert({ app_key, name, ...body.patch, updated_at: now }, { onConflict: "app_key,name" })
    .select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
