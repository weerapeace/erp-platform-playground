/**
 * GET  /api/assets/tags  — รายการแท็กทั้งหมด + จำนวนไฟล์ที่ติดแท็กนั้น
 * POST /api/assets/tags  — สร้างแท็กใหม่ ({ name, color? })
 * PATCH  { id, name?, color? }  — เปลี่ยนชื่อแท็ก (ไฟล์ที่ติดแท็กนี้ได้ชื่อใหม่ตาม)
 * DELETE ?id=                   — ลบแท็ก (ไฟล์ไม่ถูกลบ แค่หลุดแท็กนี้)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { actorId } from "../shared";

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

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "assets.manage");
  if (denied) return denied;

  let body: { id?: string; name?: string; color?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุแท็ก" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("asset_tags").select("id, name, color").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบแท็กนี้" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "ต้องมีชื่อแท็ก" }, { status: 400 });
    if (name !== (cur as { name: string }).name) {
      const { data: dup } = await admin.from("asset_tags").select("id").eq("name", name).neq("id", id).maybeSingle();
      if (dup) return NextResponse.json({ error: `มีแท็ก “${name}” อยู่แล้ว` }, { status: 400 });
      patch.name = name;
    }
  }
  if (body.color !== undefined) patch.color = String(body.color ?? "").trim() || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ data: cur, error: null });

  const { data, error } = await admin.from("asset_tags").update(patch).eq("id", id).select("id, name, color").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, { action: "update", entityType: "asset_tag", entityId: id, actorId: await actorId(request), metadata: { old: cur, new: patch } });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "assets.manage");
  if (denied) return denied;
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุแท็ก" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("asset_tags").select("id, name, color").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบแท็กนี้" }, { status: 404 });
  const { data: maps } = await admin.from("asset_tag_map").select("asset_id").eq("tag_id", id);
  const assetIds = ((maps ?? []) as { asset_id: string }[]).map((m) => m.asset_id);

  const { error } = await admin.from("asset_tags").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, { action: "delete", entityType: "asset_tag", entityId: id, actorId: await actorId(request), metadata: { snapshot: cur, files: assetIds.length, asset_ids: assetIds.slice(0, 500) } });
  return NextResponse.json({ data: { id, files: assetIds.length }, error: null });
}
