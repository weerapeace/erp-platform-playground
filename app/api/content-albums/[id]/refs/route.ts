/**
 * Reference ของรายการที่อยากได้ / อัลบั้ม Contents
 * GET    /api/content-albums/[id]/refs                 → { data: AlbumRef[] }
 * POST   /api/content-albums/[id]/refs   body = { kind: "image", r2_key } | { kind: "link", url, title?, thumb_url? } | { kind: "text", body } (+ note?)
 *                                        | { library_ids: uuid[] }  ← หยิบจากคลัง Reference กลาง (ก๊อปแถว + library_id · ไฟล์รูปตัวเดิม · ชิ้นที่มีในรายการแล้วข้าม)
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
import { cleanRefInput, isUuid, uuidList } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };
const MAX_REFS = 200;
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n) || null;
const MAX_PICK = 100;

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

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { count } = await admin.from("content_album_refs").select("id", { count: "exact", head: true }).eq("album_id", id);
  // ของใหม่ขึ้นก่อน (ลำดับติดลบจากของเดิม)
  const { data: first } = await admin.from("content_album_refs").select("sort_order").eq("album_id", id).order("sort_order", { ascending: true }).limit(1).maybeSingle();
  const top = (first as { sort_order?: number } | null)?.sort_order ?? 0;

  // ── หยิบจากคลัง Reference กลาง ──
  if (Array.isArray(body.library_ids)) {
    const ids = uuidList(body.library_ids).slice(0, MAX_PICK);
    if (!ids.length) return NextResponse.json({ error: "เลือก Reference จากคลังก่อน" }, { status: 400 });
    const [{ data: lib, error: libErr }, { data: have }] = await Promise.all([
      admin.from("content_ref_library").select("id, kind, r2_key, url, provider, title, thumb_url, body, note").in("id", ids),
      admin.from("content_album_refs").select("library_id").eq("album_id", id).in("library_id", ids),
    ]);
    if (libErr) return NextResponse.json({ error: `อ่านคลัง Reference ไม่สำเร็จ: ${libErr.message}` }, { status: 500 });
    const already = new Set(((have ?? []) as { library_id: string }[]).map((r) => r.library_id));
    const byId = new Map(((lib ?? []) as Record<string, unknown>[]).map((r) => [r.id as string, r]));
    const pick = ids.filter((x) => byId.has(x) && !already.has(x));   // ตามลำดับที่เลือก
    if (!pick.length) return NextResponse.json({ data: { added: 0, skipped: ids.length }, error: null });
    if ((count ?? 0) + pick.length > MAX_REFS) return NextResponse.json({ error: `Reference ได้ไม่เกิน ${MAX_REFS} ชิ้นต่อรายการ (เหลือที่ ${Math.max(0, MAX_REFS - (count ?? 0))} ชิ้น)` }, { status: 400 });
    const rows = pick.map((libId, i) => {
      const r = byId.get(libId)!;
      return { album_id: id, kind: r.kind, r2_key: r.r2_key, url: r.url, provider: r.provider, title: r.title, thumb_url: r.thumb_url, body: r.body, note: r.note,
        library_id: libId, sort_order: top - pick.length + i, created_by: user?.email ?? user?.id ?? null };
    });
    const { error } = await admin.from("content_album_refs").insert(rows);
    if (error) return NextResponse.json({ error: `ใส่ Reference ไม่สำเร็จ: ${error.message}` }, { status: 500 });
    await writeAudit(admin, { action: "ref_add", entityType: "content_album", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { from_library: pick, skipped: ids.length - pick.length } });
    return NextResponse.json({ data: { added: pick.length, skipped: ids.length - pick.length }, error: null });
  }

  const clean = cleanRefInput(body);
  if ("error" in clean) return NextResponse.json({ error: clean.error }, { status: 400 });
  const kind = clean.row.kind as string;
  const row: Record<string, unknown> = { ...clean.row, album_id: id };
  if ((count ?? 0) >= MAX_REFS) return NextResponse.json({ error: `Reference ได้ไม่เกิน ${MAX_REFS} ชิ้นต่อรายการ` }, { status: 400 });
  row.sort_order = top - 1;
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
