/**
 * GET  /api/assets/tags  — รายการแท็กทั้งหมด + จำนวนไฟล์ที่ติดแท็กนั้น
 * POST /api/assets/tags  — สร้างแท็กใหม่ ({ name, color? })
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type AssetTag = { id: string; name: string; color: string | null; count: number };

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;

  const admin = supabaseAdmin();
  const { data: tags, error } = await admin.from("asset_tags").select("id, name, color").order("name");
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const { data: maps } = await admin.from("asset_tag_map").select("tag_id");
  const counts = new Map<string, number>();
  for (const m of (maps ?? []) as { tag_id: string }[]) counts.set(m.tag_id, (counts.get(m.tag_id) ?? 0) + 1);

  const out: AssetTag[] = (tags ?? []).map((t) => {
    const r = t as { id: string; name: string; color: string | null };
    return { id: r.id, name: r.name, color: r.color, count: counts.get(r.id) ?? 0 };
  });
  return NextResponse.json({ data: out, error: null });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "assets.manage");
  if (denied) return denied;

  let body: { name?: string; color?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องมีชื่อแท็ก" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("asset_tags")
    .upsert({ name, color: body.color ?? null }, { onConflict: "name", ignoreDuplicates: false })
    .select("id, name, color").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
