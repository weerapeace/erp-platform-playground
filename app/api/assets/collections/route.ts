/**
 * GET  /api/assets/collections  — รายการอัลบั้ม + จำนวนไฟล์ในอัลบั้ม
 * POST /api/assets/collections  — สร้างอัลบั้มใหม่ ({ name, description? })
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { actorId } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type AssetCollection = { id: string; name: string; description: string | null; count: number };

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;

  const admin = supabaseAdmin();
  const { data: cols, error } = await admin.from("asset_collections")
    .select("id, name, description").order("sort_order").order("name");
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  // จำนวนไฟล์ active ต่ออัลบั้ม (asset อยู่ได้หลายอัลบั้ม → นับผ่าน map)
  const { data: maps }    = await admin.from("asset_collection_map").select("asset_id, collection_id");
  const { data: actives } = await admin.from("assets").select("id").eq("status", "active");
  const activeSet = new Set((actives ?? []).map((a) => (a as { id: string }).id));
  const counts = new Map<string, number>();
  for (const m of (maps ?? []) as { asset_id: string; collection_id: string }[])
    if (activeSet.has(m.asset_id)) counts.set(m.collection_id, (counts.get(m.collection_id) ?? 0) + 1);

  const out: AssetCollection[] = (cols ?? []).map((c) => {
    const r = c as { id: string; name: string; description: string | null };
    return { id: r.id, name: r.name, description: r.description, count: counts.get(r.id) ?? 0 };
  });
  return NextResponse.json({ data: out, error: null });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "assets.manage");
  if (denied) return denied;

  let body: { name?: string; description?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องมีชื่ออัลบั้ม" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("asset_collections")
    .insert({ name, description: body.description ?? null }).select("id, name, description").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(admin, { action: "create", entityType: "asset_collection", entityId: data?.id as string, actorId: await actorId(request), metadata: { name } });
  return NextResponse.json({ data, error: null });
}
