/**
 * อัลบั้ม Contents 1 อัลบั้ม
 * GET    /api/content-albums/[id]          → { data: ContentAlbum & { files: AlbumFile[] } }
 * PATCH  /api/content-albums/[id]          body = ช่องที่จะเปลี่ยน (ชื่อ/แบรนด์/ผู้รับผิดชอบ/วันที่ต้องลง/แพลตฟอร์ม/แคปชั่นร่าง (+ caption_drafts แยกแพลตฟอร์ม)/รูปที่เลือก/ลำดับไฟล์ file_order/ปก/closed) · { restore: true } = กู้จากถังขยะ
 * DELETE /api/content-albums/[id]          → ย้ายไปถังขยะ (ไฟล์ใน Drive ไม่ถูกแตะ · กู้คืนได้)
 *
 * สิทธิ์: ดู = assets.view · แก้ = assets.upload · ลบ = assets.manage · ทุกการเปลี่ยนลง audit_logs (content_album)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { loadContentAlbums, loadAlbumFiles, loadAlbumRefs } from "@/lib/content-albums-server";
import { cleanAlbumFields, isUuid } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.view"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  const admin = supabaseAdmin();
  try {
    const [album] = await loadContentAlbums(admin, { ids: [id] });
    if (!album) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
    // ?lite=1 = แค่ชื่อ/สถานะ (ป้าย "จากอัลบั้ม" ในป๊อปโพสต์) ไม่ต้องโหลดไฟล์
    const lite = new URL(request.url).searchParams.get("lite") === "1";
    const [files, refs] = lite ? [[], []] : await Promise.all([loadAlbumFiles(admin, id, album.picked_asset_ids, album.file_order), loadAlbumRefs(admin, id)]);
    return NextResponse.json({ data: { ...album, files, refs }, error: null });
  } catch (e) {
    return NextResponse.json({ error: `โหลดอัลบั้มไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const [{ data: curAlbum }, { data: curCol }] = await Promise.all([
    admin.from("content_albums").select("*").eq("id", id).maybeSingle(),
    admin.from("asset_collections").select("name, description, cover_asset_id").eq("id", id).maybeSingle(),
  ]);
  if (!curAlbum || !curCol) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });

  const restore = body.restore === true;
  const clean = cleanAlbumFields(body);
  if ("error" in clean) return NextResponse.json({ error: clean.error }, { status: 400 });
  const albumPatch: Record<string, unknown> = { ...clean.album, ...(restore ? { trashed_at: null } : {}) };
  // ย้อนอัลบั้มกลับเป็น "รายการที่อยากได้" ได้เฉพาะตอนยังไม่มีไฟล์ (ไฟล์จากการถ่ายต้องอยู่ในอัลบั้ม)
  if (albumPatch.phase === "wish" && (curAlbum as { phase?: string }).phase !== "wish") {
    const { count } = await admin.from("asset_collection_map").select("asset_id", { count: "exact", head: true }).eq("collection_id", id);
    if (count) return NextResponse.json({ error: "อัลบั้มนี้มีไฟล์แล้ว ย้อนกลับเป็นรายการที่อยากได้ไม่ได้" }, { status: 400 });
  }
  // เปลี่ยนแบรนด์หลังมีโฟลเดอร์ Drive แล้ว = ไฟล์เดิมยังอยู่โฟลเดอร์เดิม (ไม่ย้ายให้) · ไฟล์ใหม่ก็ไปที่เดิม เพื่อให้อยู่ด้วยกัน
  if (!Object.keys(albumPatch).length && !Object.keys(clean.collection).length) {
    const [same] = await loadContentAlbums(admin, { ids: [id] });
    return NextResponse.json({ data: same ?? null, error: null });
  }
  const now = new Date().toISOString();
  if (Object.keys(clean.collection).length) {
    const { error } = await admin.from("asset_collections").update(clean.collection).eq("id", id);
    if (error) return NextResponse.json({ error: `บันทึกไม่สำเร็จ: ${error.message}` }, { status: 500 });
  }
  const { error } = await admin.from("content_albums").update({ ...albumPatch, updated_at: now }).eq("id", id);
  if (error) return NextResponse.json({ error: `บันทึกไม่สำเร็จ: ${error.message}` }, { status: 500 });

  // เก็บเฉพาะช่องที่เปลี่ยนจริงลงประวัติ (เก่า → ใหม่)
  const before = { ...(curAlbum as Record<string, unknown>), ...(curCol as Record<string, unknown>) };
  const after = { ...albumPatch, ...clean.collection };
  const changes = Object.fromEntries(Object.entries(after)
    .filter(([k, v]) => k !== "closed_at" || !!v !== !!before[k])
    .filter(([k, v]) => JSON.stringify(before[k] ?? null) !== JSON.stringify(v ?? null))
    .map(([k, v]) => [k, k === "file_order" ? { old: `${((before[k] as string[] | null) ?? []).length} ไฟล์`, new: `จัดลำดับใหม่ ${(v as string[]).length} ไฟล์` }
      : k === "caption_drafts" ? { old: Object.keys((before[k] as object | null) ?? {}).join(", ") || null, new: `แก้แคปชั่น: ${Object.keys((v as object) ?? {}).join(", ") || "-"}` }
      : { old: before[k] ?? null, new: v ?? null }]));
  if (Object.keys(changes).length) {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    await writeAudit(admin, { action: restore ? "restore" : "update", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name: (curCol as { name: string }).name, changes } });
  }
  const [album] = await loadContentAlbums(admin, { ids: [id] });
  return NextResponse.json({ data: album ?? null, error: null });
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.manage"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  const admin = supabaseAdmin();
  const { data: col } = await admin.from("asset_collections").select("name").eq("id", id).maybeSingle();
  if (!col) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
  const { error } = await admin.from("content_albums").update({ trashed_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: `ลบไม่สำเร็จ: ${error.message}` }, { status: 500 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "trash", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name: (col as { name: string }).name } });
  return NextResponse.json({ data: { id }, error: null });
}
