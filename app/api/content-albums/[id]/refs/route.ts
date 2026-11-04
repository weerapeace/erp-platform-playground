/**
 * Reference ของรายการที่อยากได้ / อัลบั้ม Contents
 * GET    /api/content-albums/[id]/refs                 → { data: AlbumRef[] }
 * POST   /api/content-albums/[id]/refs   body = { kind: "image", r2_key } | { kind: "link", url, title?, thumb_url? } | { kind: "text", body } (+ note?)
 * PATCH  /api/content-albums/[id]/refs   body = { ref_id, note? } | { order: ref_id[] }   (โน้ต "ชอบตรงไหน" / เรียงใหม่)
 * DELETE /api/content-albums/[id]/refs?ref_id=
 *
 * รูป = ย่อแล้วอัปผ่านตัวอัปกลาง (โฟลเดอร์ content-refs · ไม่ลงคลัง) · ลิงก์ = เก็บแค่ลิงก์ + ชื่อ/รูปพรีวิว (ไม่ก๊อปวิดีโอ)
 * สิทธิ์: ดู assets.view · เพิ่ม/แก้/ลบ assets.upload · audit content_album ref_add / ref_update / ref_remove
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { loadAlbumRefs } from "@/lib/content-albums-server";
import { cleanRefUrl, refProvider } from "@/lib/content-album-refs";
import { isUuid, uuidList } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };
const MAX_REFS = 200;
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n) || null;

async function albumOk(admin: ReturnType<typeof supabaseAdmin>, id: string) {
  const { data } = await admin.from("content_albums").select("id, trashed_at").eq("id", id).maybeSingle();
  return data as { id: string; trashed_at: string | null } | null;
}

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.view"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  try { return NextResponse.json({ data: await loadAlbumRefs(supabaseAdmin(), id), error: null }); }
  catch (e) { return NextResponse.json({ data: [], error: (e as Error).message }, { status: 500 }); }
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const album = await albumOk(admin, id);
  if (!album) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  if (album.trashed_at) return NextResponse.json({ error: "รายการนี้อยู่ในถังขยะ — กู้คืนก่อน" }, { status: 400 });

  const kind = String(body.kind ?? "");
  const row: Record<string, unknown> = { album_id: id, kind, note: clip(body.note, 500) };
  if (kind === "image") {
    // ต้องเป็นรูปที่เพิ่งอัปผ่านตัวอัปกลาง (โฟลเดอร์ content-refs) — กันชี้ไฟล์คนอื่น
    const key = typeof body.r2_key === "string" && /^content-refs\/[\w./-]+$/.test(body.r2_key) ? body.r2_key : null;
    if (!key) return NextResponse.json({ error: "รูปไม่ถูกต้อง" }, { status: 400 });
    row.r2_key = key;
  } else if (kind === "link") {
    const url = cleanRefUrl(String(body.url ?? ""));
    if (!url) return NextResponse.json({ error: "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
    row.url = url; row.provider = refProvider(url); row.title = clip(body.title, 300);
    row.thumb_url = cleanRefUrl(String(body.thumb_url ?? ""));
  } else if (kind === "text") {
    const text = clip(body.body, 2000);
    if (!text) return NextResponse.json({ error: "พิมพ์ข้อความก่อน" }, { status: 400 });
    row.body = text;
  } else {
    return NextResponse.json({ error: "ชนิด Reference ไม่ถูกต้อง" }, { status: 400 });
  }
  const { count } = await admin.from("content_album_refs").select("id", { count: "exact", head: true }).eq("album_id", id);
  if ((count ?? 0) >= MAX_REFS) return NextResponse.json({ error: `Reference ได้ไม่เกิน ${MAX_REFS} ชิ้นต่อรายการ` }, { status: 400 });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  // ของใหม่ขึ้นก่อน (ลำดับติดลบจากของเดิม)
  const { data: first } = await admin.from("content_album_refs").select("sort_order").eq("album_id", id).order("sort_order", { ascending: true }).limit(1).maybeSingle();
  row.sort_order = ((first as { sort_order?: number } | null)?.sort_order ?? 0) - 1;
  row.created_by = user?.email ?? user?.id ?? null;
  const { data, error } = await admin.from("content_album_refs").insert(row).select("id").single();
  if (error || !data) return NextResponse.json({ error: `เพิ่ม Reference ไม่สำเร็จ: ${error?.message ?? ""}` }, { status: 500 });
  await writeAudit(admin, { action: "ref_add", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { ref_id: data.id, kind, url: row.url ?? null, r2_key: row.r2_key ?? null, body: row.body ?? null } });
  return NextResponse.json({ data: { id: data.id }, error: null });
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  if (Array.isArray(body.order)) {
    const order = uuidList(body.order).slice(0, MAX_REFS);
    await Promise.all(order.map((refId, i) => admin.from("content_album_refs").update({ sort_order: i }).eq("id", refId).eq("album_id", id)));
    await writeAudit(admin, { action: "ref_update", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { reordered: order.length } });
    return NextResponse.json({ data: { ok: true }, error: null });
  }
  if (!isUuid(body.ref_id)) return NextResponse.json({ error: "ต้องระบุ Reference" }, { status: 400 });
  const { data: cur } = await admin.from("content_album_refs").select("note").eq("id", body.ref_id).eq("album_id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบ Reference" }, { status: 404 });
  const note = clip(body.note, 500);
  const { error } = await admin.from("content_album_refs").update({ note }).eq("id", body.ref_id).eq("album_id", id);
  if (error) return NextResponse.json({ error: `บันทึกไม่สำเร็จ: ${error.message}` }, { status: 500 });
  await writeAudit(admin, { action: "ref_update", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { ref_id: body.ref_id, note: { old: (cur as { note: string | null }).note, new: note } } });
  return NextResponse.json({ data: { ok: true }, error: null });
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  const { id } = await params;
  const refId = new URL(request.url).searchParams.get("ref_id");
  if (!isUuid(id) || !isUuid(refId)) return NextResponse.json({ error: "ต้องระบุ Reference" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("content_album_refs").select("*").eq("id", refId).eq("album_id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบ Reference" }, { status: 404 });
  const { error } = await admin.from("content_album_refs").delete().eq("id", refId).eq("album_id", id);
  if (error) return NextResponse.json({ error: `ลบไม่สำเร็จ: ${error.message}` }, { status: 500 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  // เก็บสำเนาในประวัติ เผื่อต้องเพิ่มคืน (รูปใน R2 ไม่ลบ — ราคาถูกมาก และอาจถูกอ้างที่อื่น)
  await writeAudit(admin, { action: "ref_remove", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { snapshot: cur } });
  return NextResponse.json({ data: { ok: true }, error: null });
}
