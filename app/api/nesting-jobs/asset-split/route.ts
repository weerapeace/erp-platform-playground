/**
 * /api/nesting-jobs/asset-split — "แยกชิ้นในภาพ" ที่จำไว้กับลายในคลัง (assets.nest_split)
 *   GET ?ids=a,b,c          → { data: { [asset_id]: { gap_mm, joins } } } (เฉพาะลายที่ตั้งไว้) — nesting.view
 *   PUT { asset_id, split } → บันทึก/ล้าง (split = null = เลิกแยก) — nesting.run · audit
 * แยกที่ตัวช่วยในเครื่อง (ภาพเดิม + ค่าเดิม = ชิ้นเดิมทุกครั้ง) — ERP เก็บแค่ค่าที่ใช้แยก
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cleanSplit, cleanUuid } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.view"); if (denied) return denied;
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").map(cleanUuid).filter((x): x is string => !!x))].slice(0, 300);
  if (!ids.length) return NextResponse.json({ data: {}, error: null });
  const { data, error } = await supabaseAdmin().from("assets").select("id, nest_split").in("id", ids).not("nest_split", "is", null);
  if (error) return NextResponse.json({ data: {}, error: error.message }, { status: 500 });
  const out: Record<string, unknown> = {};
  for (const r of data ?? []) { const s = cleanSplit(r.nest_split); if (s) out[r.id as string] = s; }
  return NextResponse.json({ data: out, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.run"); if (denied) return denied;
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = cleanUuid(b.asset_id);
  if (!id) return NextResponse.json({ error: "ไม่พบลายนี้ในคลัง" }, { status: 404 });
  const split = b.split == null ? null : cleanSplit(b.split);
  if (b.split != null && !split) return NextResponse.json({ error: "ค่าแยกชิ้นไม่ถูกต้อง" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("assets").update({ nest_split: split }).eq("id", id).select("id, title").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "ไม่พบลายนี้ในคลัง" }, { status: 404 });
  await writeAuditFor(request, admin, { action: "update", entityType: "asset", entityId: id,
    metadata: { field: "nest_split", title: data.title, split } });
  return NextResponse.json({ data: { asset_id: id, split }, error: null });
}
