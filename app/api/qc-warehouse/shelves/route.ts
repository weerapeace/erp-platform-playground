/**
 * โกดัง QC — จัดการชั้น (เพิ่ม/แก้/ลบ)
 * POST   { name, kind }      → เพิ่มชั้น
 * PATCH  { id, name?, kind? } → แก้ชั้น
 * DELETE ?id=...             → ลบชั้น (เฉพาะชั้นว่าง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const cleanKind = (v: unknown) => (v === "defect" ? "defect" : "store");

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.move"); if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ใส่ชื่อชั้นก่อน" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: mx } = await admin.from("qc_shelves").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await admin.from("qc_shelves").insert({ name, kind: cleanKind(body.kind), sort_order: Number(mx?.sort_order ?? 0) + 10 });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.move"); if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("name" in body) patch.name = String(body.name ?? "").trim();
  if ("kind" in body) patch.kind = cleanKind(body.kind);
  const { error } = await supabaseAdmin().from("qc_shelves").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.move"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const admin = supabaseAdmin();
  const { count } = await admin.from("qc_warehouse_items").select("id", { count: "exact", head: true }).eq("shelf_id", id);
  if ((count ?? 0) > 0) return NextResponse.json({ error: "ย้ายของออกจากชั้นนี้ก่อนถึงจะลบได้" }, { status: 400 });
  const { error } = await admin.from("qc_shelves").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: null });
}
