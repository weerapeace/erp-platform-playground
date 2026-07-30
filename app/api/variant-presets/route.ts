/**
 * /api/variant-presets — "ชุดสำเร็จ" ของแบบ/ไซส์ ที่ใช้ในป๊อปเพิ่ม SKU ลูก
 *   GET                                          → ทุกชุด (เรียงตาม sort_order)
 *   POST   { id?, label, option_name, items[] }  → เพิ่ม/แก้
 *   DELETE ?id=                                  → ลบ
 *
 * เดิมชุดสำเร็จ (ไซส์ S–XXL / แบบพิมพ์) hardcode ในโค้ด — ย้ายมา DB ให้เจ้าของเพิ่ม/แก้/ลบเองได้
 * สิทธิ์: อ่าน = products.view · แก้/ลบ = products.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Item = { code?: string; value?: string };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin()
    .from("erp_variant_presets").select("id, label, option_name, items, sort_order")
    .eq("is_active", true).order("sort_order", { ascending: true }).order("label", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 400 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "products.edit")))
    return NextResponse.json({ error: "ต้องมีสิทธิ์แก้สินค้า (products.edit) จึงแก้ชุดสำเร็จได้" }, { status: 401 });
  let b: { id?: string; label?: string; option_name?: string; items?: Item[]; sort_order?: number };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const label = (b.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "ตั้งชื่อชุดก่อน (เช่น ไซส์ S–XXL)" }, { status: 400 });
  const items = (Array.isArray(b.items) ? b.items : [])
    .map((x) => ({ code: String(x?.code ?? "").trim(), value: String(x?.value ?? "").trim() }))
    .filter((x) => x.code && x.value).slice(0, 50);
  if (items.length === 0) return NextResponse.json({ error: "ต้องมีอย่างน้อย 1 รายการ (ตัวย่อ + ชื่อที่โชว์)" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const row = {
    label, option_name: (b.option_name ?? "").trim(), items,
    sort_order: Number.isFinite(b.sort_order) ? Number(b.sort_order) : 0,
    updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
  };
  const res = b.id
    ? await admin.from("erp_variant_presets").update(row).eq("id", b.id).select("id").maybeSingle()
    : await admin.from("erp_variant_presets").insert(row).select("id").maybeSingle();
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 400 });
  await writeAudit(admin, {
    action: b.id ? "update" : "create", entityType: "variant_preset", entityId: res.data?.id ?? null,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { label, items: items.length },
  });
  return NextResponse.json({ data: res.data, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!(await apiCan(request, "products.edit")))
    return NextResponse.json({ error: "ต้องมีสิทธิ์แก้สินค้า (products.edit) จึงลบได้" }, { status: 401 });
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_variant_presets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "delete", entityType: "variant_preset", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null });
  return NextResponse.json({ success: true, error: null });
}
