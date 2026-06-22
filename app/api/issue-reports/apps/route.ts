/**
 * /api/issue-reports/apps — รายการแอปใน dropdown (จัดการเอง)
 *
 * GET            → รายการ (report.create) · ?all=1 รวมที่ปิด (report.manage)
 * POST {name}    → เพิ่ม (report.manage)
 * PATCH {id,patch}→ แก้ (report.manage)
 * DELETE ?id=    → ลบ (report.manage)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "report.create");
  if (guard) return guard;
  const all = new URL(request.url).searchParams.get("all") === "1";
  const db = supabaseAdmin();
  let q = db.from("issue_report_apps").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (!all) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "report.manage");
  if (guard) return guard;
  let body: { name?: string; sort_order?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.name?.trim()) return NextResponse.json({ error: "กรุณาใส่ชื่อแอป" }, { status: 400 });
  const db = supabaseAdmin();
  const { data, error } = await db.from("issue_report_apps").insert({ name: body.name.trim(), sort_order: body.sort_order ?? 0 }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest) {
  const guard = await guardApi(request, "report.manage");
  if (guard) return guard;
  let body: { id?: string; patch?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ไม่มี id" }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("issue_report_apps").update(body.patch ?? {}).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApi(request, "report.manage");
  if (guard) return guard;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ไม่มี id" }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("issue_report_apps").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
