/**
 * โกดัง QC — จัดการ "ที่มา" ของของบนชั้น
 * POST { name } · PATCH { id, name } · DELETE ?id=...
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.receive"); if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ใส่ชื่อที่มาก่อน" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: mx } = await admin.from("qc_sources").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await admin.from("qc_sources").insert({ name, sort_order: Number(mx?.sort_order ?? 0) + 10 });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.receive"); if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabaseAdmin().from("qc_sources").update({ name: String(body.name ?? "").trim() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.receive"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const { error } = await supabaseAdmin().from("qc_sources").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: null });
}
