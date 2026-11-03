/**
 * อัลบั้ม Contents (คลังไฟล์ › Contents) — รายการ + สร้าง
 * GET  /api/content-albums?brand_id=&trash=1   → { data: ContentAlbum[] } (สถานะคิดสดจากโพสต์ที่ผูก)
 * POST /api/content-albums  body = { name, description?, brand_id?, assignee_ids?, due_date?, planned_platforms?, caption_draft? }
 *
 * สิทธิ์: ดู = assets.view · สร้าง = assets.upload · ไฟล์ตัวจริงอยู่ Drive (lib/content-albums-server)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { loadContentAlbums } from "@/lib/content-albums-server";
import { cleanAlbumFields, isUuid } from "./shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const brandId = sp.get("brand_id");
  try {
    const data = await loadContentAlbums(supabaseAdmin(), { trash: sp.get("trash") === "1", brandId: isUuid(brandId) ? brandId : null });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: `โหลดอัลบั้มไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!String(body.name ?? "").trim()) return NextResponse.json({ error: "ต้องมีชื่ออัลบั้ม" }, { status: 400 });
  const clean = cleanAlbumFields(body);
  if ("error" in clean) return NextResponse.json({ error: clean.error }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { data: col, error: colErr } = await admin.from("asset_collections")
    .insert({ name: clean.collection.name, description: clean.collection.description ?? null }).select("id").single();
  if (colErr || !col) return NextResponse.json({ error: `สร้างอัลบั้มไม่สำเร็จ: ${colErr?.message ?? ""}` }, { status: 500 });
  const { error } = await admin.from("content_albums").insert({ id: col.id, ...clean.album, closed_at: null, created_by: user?.email ?? user?.id ?? null });
  if (error) {
    await admin.from("asset_collections").delete().eq("id", col.id);   // ไม่ให้เหลืออัลบั้มกลางลอย ๆ
    return NextResponse.json({ error: `สร้างอัลบั้มไม่สำเร็จ: ${error.message}` }, { status: 500 });
  }
  await writeAudit(admin, { action: "create", entityType: "content_album", entityId: col.id as string, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name: clean.collection.name, ...clean.album } });
  const [created] = await loadContentAlbums(admin, { ids: [col.id as string] });
  return NextResponse.json({ data: created ?? null, error: null });
}
