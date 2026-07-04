/**
 * /api/platform-central-categories — หมวดกลาง (owner สร้างเอง) สำหรับจับคู่หมวดแพลตฟอร์ม
 *   GET → รายการ (active) · POST {name} เพิ่ม · PATCH {id,name?} แก้ · DELETE ?id= ลบ (+mapping)
 * guardApi products.platforms.view / manage_accounts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("platform_central_categories")
    .select("id, name, sort_order").eq("is_active", true).order("sort_order").order("name");
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  let b: { name?: string }; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = String(b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องมีชื่อหมวด" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("platform_central_categories").insert({ name }).select("id, name, sort_order").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  let b: { id?: string; name?: string; sort_order?: number }; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name != null) patch.name = String(b.name).trim();
  if (b.sort_order != null) patch.sort_order = b.sort_order;
  const { error } = await supabaseAdmin().from("platform_central_categories").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
  const admin = supabaseAdmin();
  await admin.from("platform_category_mappings").delete().eq("central_category_id", id);   // ลบการจับคู่ของหมวดนี้ด้วย
  const { error } = await admin.from("platform_central_categories").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
