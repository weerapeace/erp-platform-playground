/**
 * GET  /api/assets/collections           — รายการอัลบั้ม + จำนวนไฟล์ · ?trash=1 = อัลบั้มในถังขยะ (เฉพาะหัวต้นที่ถูกลบ)
 * POST /api/assets/collections           — สร้างอัลบั้ม ({ name, description?, parent_id? }) · parent_id = สร้างเป็นอัลบั้มย่อย
 * PATCH  { id, name?, description?, parent_id? }  — เปลี่ยนชื่อ / ย้ายไปอยู่ใต้อัลบั้มอื่น (null = ชั้นบนสุด)
 * PATCH  { id, restore: true }                    — กู้อัลบั้มจากถังขยะ (พร้อมอัลบั้มย่อยที่ถูกลบไปพร้อมกัน)
 * DELETE ?id=                                     — ลบแบบเก็บไว้ (ถังขยะ) ทั้งต้น · ไฟล์ข้างในไม่ถูกลบ
 *
 * อัลบั้มแม่: ช่อง parent_id (อัลบั้มปกติ) · อัลบั้ม SAMPLE ยังเก็บแม่ในป้าย description → จัดการที่หน้า SAMPLE Images เท่านั้น
 * กติกาต้นไม้ (ลูกหลาน/กันวนซ้ำ) = lib/album-options
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit, auditDiff } from "@/lib/audit";
import { actorId, countActiveByGroup } from "../shared";
import { parseSampleMark } from "@/lib/sample-images";
import { albumDescendantIds, canMoveAlbum } from "@/lib/album-options";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** อัลบั้มในคลังไฟล์ · parent_id = อัลบั้มแม่ · group = กลุ่ม ("SAMPLE · <แบรนด์>" · อัลบั้มปกติ = null)
 *  sample = อัลบั้มของหน้า SAMPLE (ย้าย/สร้างอัลบั้มย่อยที่นี่ไม่ได้) · deleted_at = มีเฉพาะตอนดูถังขยะ */
export type AssetCollection = {
  id: string; name: string; description: string | null; count: number;
  parent_id?: string | null; group?: string | null; sample?: boolean; deleted_at?: string | null;
};

type ColRow = { id: string; name: string; description: string | null; parent_id: string | null; deleted_at: string | null };
type Admin = ReturnType<typeof supabaseAdmin>;

/** แม่จริงของอัลบั้ม: ช่อง parent_id ก่อน · อัลบั้ม SAMPLE ใช้ป้าย */
const parentOf = (r: ColRow): string | null => r.parent_id ?? parseSampleMark(r.description)?.parentId ?? null;

async function loadAll(admin: Admin): Promise<ColRow[]> {
  const { data, error } = await admin.from("asset_collections").select("id, name, description, parent_id, deleted_at").order("sort_order").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as ColRow[];
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;
  const trash = new URL(request.url).searchParams.get("trash") === "1";

  const admin = supabaseAdmin();
  let all: ColRow[];
  try { all = await loadAll(admin); } catch (e) { return NextResponse.json({ data: [], error: (e as Error).message }, { status: 500 }); }
  const { data: contentAlbums } = await admin.from("content_albums").select("id");
  // อัลบั้มของหน้า Contents อยู่แถบ Contents ของมันเอง (/api/content-albums) — ไม่ปนในรายการอัลบั้มปกติ
  const contentIds = new Set(((contentAlbums ?? []) as { id: string }[]).map((a) => a.id));
  const byId = new Map(all.map((r) => [r.id, r]));
  const cols = all.filter((c) => !contentIds.has(c.id) && (trash
    // ถังขยะ: โชว์เฉพาะหัวต้น (แม่ไม่ได้ถูกลบพร้อมกัน) — กู้หัวต้น = ได้ลูกที่ลบพร้อมกันคืนด้วย
    ? !!c.deleted_at && !(c.parent_id && byId.get(c.parent_id)?.deleted_at === c.deleted_at)
    : !c.deleted_at));

  // จำนวนไฟล์ active ต่ออัลบั้ม (asset อยู่ได้หลายอัลบั้ม → นับผ่าน map) — นับที่ฐานข้อมูล (ของกลาง countActiveByGroup)
  const counts = await countActiveByGroup(admin, "asset_collection_map", "collection_id", cols.map((c) => c.id));

  const marks = new Map(cols.map((c) => [c.id, parseSampleMark(c.description)]));
  const brandIds = [...new Set([...marks.values()].map((m) => m?.brandId).filter((x): x is string => !!x))];
  const brandName = new Map<string, string>();
  if (brandIds.length) {
    const { data: bs } = await admin.from("brands").select("id, name").in("id", brandIds);
    for (const b of (bs ?? []) as { id: string; name: string }[]) brandName.set(b.id, b.name);
  }
  const out: AssetCollection[] = cols.map((r) => {
    const m = marks.get(r.id);
    const group = m ? `SAMPLE · ${(m.brandId && brandName.get(m.brandId)) || "ยังไม่ระบุแบรนด์"}` : null;
    return {
      id: r.id, name: r.name, description: r.description, count: counts.get(r.id) ?? 0,
      parent_id: parentOf(r), group, sample: !!m, ...(trash ? { deleted_at: r.deleted_at } : {}),
    };
  });
  return NextResponse.json({ data: out, error: null });
}

/** ตรวจอัลบั้มแม่ที่จะใส่: ต้องมีอยู่ ไม่อยู่ถังขยะ และไม่ใช่อัลบั้ม SAMPLE */
function parentProblem(all: ColRow[], parentId: string): string | null {
  const p = all.find((r) => r.id === parentId);
  if (!p || p.deleted_at) return "ไม่พบอัลบั้มแม่";
  if (parseSampleMark(p.description)) return "อัลบั้ม SAMPLE จัดการอัลบั้มย่อยที่หน้า SAMPLE Images";
  return null;
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "assets.manage");
  if (denied) return denied;

  let body: { name?: string; description?: string; parent_id?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องมีชื่ออัลบั้ม" }, { status: 400 });
  const parentId = body.parent_id ? String(body.parent_id) : null;

  const admin = supabaseAdmin();
  if (parentId) {
    const problem = parentProblem(await loadAll(admin), parentId);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  const { data, error } = await admin.from("asset_collections")
    .insert({ name, description: body.description ?? null, parent_id: parentId }).select("id, name, description, parent_id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(admin, { action: "create", entityType: "asset_collection", entityId: data?.id as string, actorId: await actorId(request), metadata: { name, parent_id: parentId } });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "assets.manage");
  if (denied) return denied;

  let body: { id?: string; name?: string; description?: string | null; parent_id?: string | null; restore?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุอัลบั้ม" }, { status: 400 });

  const admin = supabaseAdmin();
  const all = await loadAll(admin);
  const cur = all.find((r) => r.id === id);
  if (!cur) return NextResponse.json({ error: "ไม่พบอัลบั้มนี้" }, { status: 404 });
  const actor = await actorId(request);

  // กู้จากถังขยะ — ตัวเอง + ลูกหลานที่ถูกลบพร้อมกัน (deleted_at เดียวกัน)
  if (body.restore) {
    if (!cur.deleted_at) return NextResponse.json({ data: { id, albums: 0 }, error: null });
    const ids = [id, ...albumDescendantIds(all, id).filter((d) => all.find((r) => r.id === d)?.deleted_at === cur.deleted_at)];
    const parentGone = !!cur.parent_id && !!all.find((r) => r.id === cur.parent_id)?.deleted_at;
    const { error } = await admin.from("asset_collections").update({ deleted_at: null }).in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // แม่ยังอยู่ในถังขยะ → กู้ออกมาเป็นชั้นบนสุด (ไม่งั้นมองไม่เห็น)
    if (parentGone) await admin.from("asset_collections").update({ parent_id: null }).eq("id", id);
    await writeAudit(admin, { action: "restore", entityType: "asset_collection", entityId: id, actorId: actor, metadata: { name: cur.name, albums: ids.length } });
    return NextResponse.json({ data: { id, albums: ids.length }, error: null });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "ต้องมีชื่ออัลบั้ม" }, { status: 400 });
    patch.name = name;
  }
  if (body.description !== undefined) patch.description = String(body.description ?? "").trim() || null;
  if (body.parent_id !== undefined) {
    const to = body.parent_id ? String(body.parent_id) : null;
    if (parseSampleMark(cur.description)) return NextResponse.json({ error: "อัลบั้ม SAMPLE ย้ายที่หน้า SAMPLE Images" }, { status: 400 });
    if (to) {
      const problem = parentProblem(all, to);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    if (!canMoveAlbum(all, id, to)) return NextResponse.json({ error: "ย้ายอัลบั้มไปไว้ใต้ตัวเองหรืออัลบั้มย่อยของตัวเองไม่ได้" }, { status: 400 });
    patch.parent_id = to;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ data: cur, error: null });

  const { data, error } = await admin.from("asset_collections").update(patch).eq("id", id).select("id, name, description, parent_id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, {
    action: "update", entityType: "asset_collection", entityId: id, actorId: actor,
    metadata: { name: cur.name, changes: auditDiff(cur as unknown as Record<string, unknown>, patch) },
  });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "assets.manage");
  if (denied) return denied;
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุอัลบั้ม" }, { status: 400 });

  const admin = supabaseAdmin();
  const all = await loadAll(admin);
  const cur = all.find((r) => r.id === id);
  if (!cur || cur.deleted_at) return NextResponse.json({ error: "ไม่พบอัลบั้มนี้" }, { status: 404 });
  // ลบทั้งต้น (อัลบั้มย่อยที่ยังไม่ถูกลบ) ด้วยเวลาเดียวกัน → กู้คืนพร้อมกันได้ · ไฟล์ในอัลบั้มยังผูกอยู่ (กู้แล้วกลับมาครบ)
  const live = new Set(all.filter((r) => !r.deleted_at).map((r) => r.id));
  const ids = [id, ...albumDescendantIds(all.map((r) => ({ id: r.id, parent_id: parentOf(r) })), id).filter((d) => live.has(d))];
  const at = new Date().toISOString();
  const { error } = await admin.from("asset_collections").update({ deleted_at: at }).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { count } = await admin.from("asset_collection_map").select("asset_id", { count: "exact", head: true }).eq("collection_id", id);
  await writeAudit(admin, { action: "delete", entityType: "asset_collection", entityId: id, actorId: await actorId(request), metadata: { snapshot: cur, soft: true, albums: ids.length, files: count ?? 0 } });
  return NextResponse.json({ data: { id, albums: ids.length, files: count ?? 0 }, error: null });
}
