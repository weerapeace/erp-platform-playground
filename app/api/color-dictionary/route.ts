/**
 * /api/color-dictionary — พจนานุกรมคำแปลสี/วัสดุ ("เจอคำนี้ให้แปลเป็นคำนี้")
 *   GET                            → ทุกคำ (ใช้แปลฝั่งหน้าเว็บ ไม่ต้องเรียก AI)
 *   POST   { id?, th, en, note? }  → เพิ่ม/แก้ (มี id = แก้)
 *   DELETE ?id=                    → ลบ
 *
 * ทำไมต้องมี: ตัวแปลอัตโนมัติแปลชื่อสีเพี้ยนบ่อย (เจอจริง "น้ำตาล" → "Sugar" ที่ควรเป็น "Brown")
 * ปุ่มแปลสีจะใช้พจนานุกรมนี้ก่อน แล้วค่อยถาม AI เฉพาะคำที่ยังไม่มีในรายการ
 *
 * สิทธิ์: อ่าน = products.view (ทุกคนที่เห็นสินค้า) · แก้/ลบ = products.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin()
    .from("erp_color_dictionary").select("id, th, en, note, is_active")
    .eq("is_active", true).order("th", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 400 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "products.edit")))
    return NextResponse.json({ error: "ต้องมีสิทธิ์แก้สินค้า (products.edit) จึงแก้พจนานุกรมได้" }, { status: 401 });
  let b: { id?: string; th?: string; en?: string; note?: string | null };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const th = (b.th ?? "").trim(), en = (b.en ?? "").trim();
  if (!th || !en) return NextResponse.json({ error: "ต้องกรอกทั้งคำไทยและคำอังกฤษ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const row = { th, en, note: (b.note ?? null) || null, updated_at: new Date().toISOString(), updated_by: user?.id ?? null };
  const res = b.id
    ? await admin.from("erp_color_dictionary").update(row).eq("id", b.id).select("id").maybeSingle()
    : await admin.from("erp_color_dictionary").insert(row).select("id").maybeSingle();
  if (res.error) {
    const dup = /duplicate|unique/i.test(res.error.message);
    return NextResponse.json({ error: dup ? `มีคำว่า "${th}" อยู่แล้ว — แก้ที่รายการเดิมได้เลย` : res.error.message }, { status: 400 });
  }
  await writeAudit(admin, {
    action: b.id ? "update" : "create", entityType: "color_dictionary", entityId: res.data?.id ?? null,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { th, en },
  });
  return NextResponse.json({ data: res.data, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "products.edit")))
    return NextResponse.json({ error: "ต้องมีสิทธิ์แก้สินค้า (products.edit) จึงลบได้" }, { status: 401 });
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_color_dictionary").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "delete", entityType: "color_dictionary", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null });
  return NextResponse.json({ success: true, error: null });
}
