/**
 * คลัง Reference กลาง (หน้า Contents · แท็บ "คลัง Ref")
 * GET    /api/content-refs                       → { data: LibraryRef[] }  (ใหม่ก่อน · พร้อมแบรนด์ + ใช้กี่ครั้ง)
 * POST   /api/content-refs   body = { from_ref_id, album_id }               ← ดาว "เก็บเข้าคลัง" จาก Reference ในรายการ
 *                                  | { kind, r2_key | url,title?,thumb_url? | body, note?, tags?, brand_id? }   ← เพิ่มตรงในคลัง
 *                            → { data: { id, existed } }  (มีในคลังแล้ว = ไม่สร้างซ้ำ ชี้ชิ้นเดิม)
 * PATCH  /api/content-refs   body = { id, note?, tags?, brand_id?, title? }
 * DELETE /api/content-refs?id=                    (รายการที่หยิบไปแล้วไม่หายตาม — library_id กลายเป็นว่าง)
 *
 * หยิบใส่รายการ = POST /api/content-albums/[id]/refs { library_ids } · ตาราง content_ref_library (RLS ปิด · ผ่าน API นี้เท่านั้น)
 * สิทธิ์: ดู assets.view · เพิ่ม/แก้ assets.upload · ลบ assets.delete · audit content_ref_library create/update/delete
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { normalizeTags } from "@/lib/content-ref-library";
import { loadRefLibrary, findLibraryDuplicate } from "@/lib/content-ref-library-server";
import { cleanRefInput, isUuid } from "../content-albums/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ENTITY = "content_ref_library";
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n) || null;

async function actor(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: user?.email ?? null, by: user?.email ?? user?.id ?? null };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.view"); if (denied) return denied;
  try { return NextResponse.json({ data: await loadRefLibrary(supabaseAdmin()), error: null }); }
  catch (e) { return NextResponse.json({ data: [], error: (e as Error).message }, { status: 500 }); }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const who = await actor(request);

  // ── ดาว: เก็บ Reference ของรายการเข้าคลัง ──
  if (body.from_ref_id !== undefined) {
    if (!isUuid(body.from_ref_id) || !isUuid(body.album_id)) return NextResponse.json({ error: "ไม่พบ Reference" }, { status: 400 });
    const [{ data: ref }, { data: album }] = await Promise.all([
      admin.from("content_album_refs").select("id, kind, r2_key, url, provider, title, thumb_url, body, note, library_id").eq("id", body.from_ref_id).eq("album_id", body.album_id).maybeSingle(),
      admin.from("content_albums").select("brand_id").eq("id", body.album_id).maybeSingle(),
    ]);
    if (!ref) return NextResponse.json({ error: "ไม่พบ Reference" }, { status: 404 });
    const r = ref as { id: string; kind: string; r2_key: string | null; url: string | null; provider: string | null; title: string | null; thumb_url: string | null; body: string | null; note: string | null; library_id: string | null };
    if (r.library_id) return NextResponse.json({ data: { id: r.library_id, existed: true }, error: null });
    let libId = await findLibraryDuplicate(admin, r);
    const existed = !!libId;
    if (!libId) {
      const { data, error } = await admin.from("content_ref_library").insert({
        kind: r.kind, r2_key: r.r2_key, url: r.url, provider: r.provider, title: r.title, thumb_url: r.thumb_url, body: r.body, note: r.note,
        brand_id: (album as { brand_id: string | null } | null)?.brand_id ?? null, created_by: who.by,
      }).select("id").single();
      if (error || !data) return NextResponse.json({ error: `เก็บเข้าคลังไม่สำเร็จ: ${error?.message ?? ""}` }, { status: 500 });
      libId = (data as { id: string }).id;
      await writeAudit(admin, { action: "create", entityType: ENTITY, entityId: libId, actorId: who.id, actorName: who.name, metadata: { from_album: body.album_id, from_ref: r.id, kind: r.kind } });
    }
    await admin.from("content_album_refs").update({ library_id: libId }).eq("id", r.id);
    return NextResponse.json({ data: { id: libId, existed }, error: null });
  }

  // ── เพิ่มตรงในคลัง ──
  const clean = cleanRefInput(body);
  if ("error" in clean) return NextResponse.json({ error: clean.error }, { status: 400 });
  const dup = await findLibraryDuplicate(admin, clean.row as { kind: string });
  if (dup) return NextResponse.json({ data: { id: dup, existed: true }, error: null });
  if (body.brand_id != null && !isUuid(body.brand_id)) return NextResponse.json({ error: "แบรนด์ไม่ถูกต้อง" }, { status: 400 });
  const row: Record<string, unknown> = { ...clean.row, tags: normalizeTags(body.tags), brand_id: (body.brand_id as string | null | undefined) ?? null, created_by: who.by };
  const { data, error } = await admin.from("content_ref_library").insert(row).select("id").single();
  if (error || !data) return NextResponse.json({ error: `เพิ่มเข้าคลังไม่สำเร็จ: ${error?.message ?? ""}` }, { status: 500 });
  const id = (data as { id: string }).id;
  await writeAudit(admin, { action: "create", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { kind: row.kind, url: row.url ?? null, r2_key: row.r2_key ?? null, body: row.body ?? null, tags: row.tags } });
  return NextResponse.json({ data: { id, existed: false }, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!isUuid(body.id)) return NextResponse.json({ error: "ต้องระบุ Reference" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("content_ref_library").select("note, tags, brand_id, title").eq("id", body.id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบ Reference ในคลัง" }, { status: 404 });
  const patch: Record<string, unknown> = {};
  if ("note" in body) patch.note = clip(body.note, 500);
  if ("title" in body) patch.title = clip(body.title, 300);
  if ("tags" in body) patch.tags = normalizeTags(body.tags);
  if ("brand_id" in body) {
    if (body.brand_id !== null && !isUuid(body.brand_id)) return NextResponse.json({ error: "แบรนด์ไม่ถูกต้อง" }, { status: 400 });
    patch.brand_id = body.brand_id;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ data: { ok: true }, error: null });
  const old = cur as Record<string, unknown>;
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) if (JSON.stringify(old[k] ?? null) !== JSON.stringify(v ?? null)) changes[k] = { old: old[k] ?? null, new: v };
  if (!Object.keys(changes).length) return NextResponse.json({ data: { ok: true }, error: null });
  const { error } = await admin.from("content_ref_library").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message.includes("foreign key") ? "ไม่พบแบรนด์นี้" : `บันทึกไม่สำเร็จ: ${error.message}` }, { status: error.message.includes("foreign key") ? 400 : 500 });
  const who = await actor(request);
  await writeAudit(admin, { action: "update", entityType: ENTITY, entityId: body.id, actorId: who.id, actorName: who.name, metadata: { changes } });
  return NextResponse.json({ data: { ok: true }, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.delete"); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ error: "ต้องระบุ Reference" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("content_ref_library").select("*").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบ Reference ในคลัง" }, { status: 404 });
  const { error } = await admin.from("content_ref_library").delete().eq("id", id);
  if (error) return NextResponse.json({ error: `ลบไม่สำเร็จ: ${error.message}` }, { status: 500 });
  const who = await actor(request);
  // เก็บสำเนาในประวัติ (รูปใน R2 ไม่ลบ — รายการที่หยิบไปยังใช้ไฟล์เดียวกันอยู่)
  await writeAudit(admin, { action: "delete", entityType: ENTITY, entityId: id, actorId: who.id, actorName: who.name, metadata: { snapshot: cur } });
  return NextResponse.json({ data: { ok: true }, error: null });
}
