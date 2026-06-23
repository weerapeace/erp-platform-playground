/**
 * POST /api/assets/bulk — ทำกับหลายไฟล์พร้อมกัน
 *   body: { action: "tag" | "untag" | "move", asset_ids: string[], tag?: string, collection_id?: string | null }
 *   - tag   : ติดแท็ก (สร้างแท็กถ้ายังไม่มี) ให้ทุกไฟล์
 *   - untag : เอาแท็กออกจากทุกไฟล์
 *   - move  : ย้ายทุกไฟล์ไปอัลบั้ม (collection_id=null = เอาออกจากอัลบั้ม)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { actorId } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "assets.edit");
  if (denied) return denied;

  let b: { action?: string; asset_ids?: string[]; tag?: string; collection_id?: string | null };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const action = b.action;
  const ids = Array.isArray(b.asset_ids) ? [...new Set(b.asset_ids.filter(Boolean))] : [];
  if (!action || ids.length === 0) return NextResponse.json({ error: "ต้องมี action + asset_ids" }, { status: 400 });

  const admin = supabaseAdmin();

  if (action === "move") {
    const { error } = await admin.from("assets")
      .update({ collection_id: b.collection_id || null, updated_at: new Date().toISOString() }).in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === "tag" || action === "untag") {
    const name = String(b.tag ?? "").trim();
    if (!name) return NextResponse.json({ error: "ต้องมีชื่อแท็ก" }, { status: 400 });
    // หา/สร้าง tag id
    let tagId: string | null = null;
    const { data: ex } = await admin.from("asset_tags").select("id").eq("name", name).maybeSingle();
    if (ex?.id) tagId = ex.id as string;
    else if (action === "tag") {
      const { data: created } = await admin.from("asset_tags").insert({ name }).select("id").maybeSingle();
      tagId = (created?.id as string) ?? null;
    }
    if (!tagId) return NextResponse.json({ ok: true, error: null });   // untag แท็กที่ไม่มี = ไม่ต้องทำอะไร

    if (action === "tag") {
      const { error } = await admin.from("asset_tag_map")
        .upsert(ids.map((asset_id) => ({ asset_id, tag_id: tagId })), { onConflict: "asset_id,tag_id", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await admin.from("asset_tag_map").delete().eq("tag_id", tagId).in("asset_id", ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  }

  await writeAudit(admin, {
    action: `bulk_${action}`, entityType: "asset", actorId: await actorId(request),
    metadata: { count: ids.length, tag: b.tag ?? null, collection_id: b.collection_id ?? null },
  });
  return NextResponse.json({ ok: true, count: ids.length, error: null });
}
