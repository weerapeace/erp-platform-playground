/**
 * /api/sample-images — หน้า "SAMPLE Images" (อัลบั้มรูปตัวอย่างประจำแบรนด์ · อัลบั้มในอัลบั้ม · ส่งรูปเข้าใบงานใน Design Dashboard)
 *
 * GET                    → แบรนด์ + อัลบั้ม SAMPLE ล่าสุด 300 อัลบั้ม (แบรนด์ · อัลบั้มแม่ · จำนวนรูปของตัวเอง + รวมอัลบั้มย่อย · รูปปก)
 * GET ?album=<id>        → + รูปของอัลบั้มนั้นเอง (ไม่รวมอัลบั้มย่อย · ใบงานที่ส่งเข้าไปแล้ว)
 * POST {action:"album", brand_id?}                                 → หา/สร้างอัลบั้มของแบรนด์+วันนี้ (เวลาไทย)
 * POST {action:"set_brand", album_id, brand_id}                    → ย้ายอัลบั้มที่ยังไม่ระบุแบรนด์เข้าแบรนด์ (ชนวันเดียวกัน = รวม)
 * POST {action:"create_sub", parent_id, name, asset_ids?, from_album_id?} → สร้างอัลบั้มย่อย (+ ย้ายรูปที่เลือกเข้าไป)
 * POST {action:"move_photos", asset_ids, from_album_id, to_album_id} → ย้ายรูปจากอัลบั้มนี้ไปอีกอัลบั้ม
 * POST {action:"move_album", album_id, to_parent_id|null}           → ย้ายทั้งอัลบั้มเข้าไปในอีกอัลบั้ม / ขึ้นชั้นบนสุด (กันวนซ้ำ)
 * POST {action:"rename", album_id, name}                            → เปลี่ยนชื่ออัลบั้มย่อย (อัลบั้มของวันใช้ชื่อตามวันที่ เปลี่ยนไม่ได้)
 * POST {action:"delete_album", album_id}                            → ลบอัลบั้มย่อยที่ว่างแล้ว (ไม่มีรูป ไม่มีอัลบั้มย่อย)
 *
 * อัลบั้มในอัลบั้ม (เจ้าของสั่ง 2026-11-14 · ไม่แก้ฐานข้อมูล): จดอัลบั้มแม่ในป้ายเดิม description "sample-images[:<brand>]|in:<parent>"
 * ของที่ทำผ่าน API กลางเดิม (ไม่เขียนซ้ำ):
 *   ลงรูป = POST /api/assets (source=sample, collection_id, brand_id) · ส่งเข้าใบงาน = POST /api/attachments/from-library
 *   ลบรูป = DELETE /api/assets/[id] (ถังขยะ · ไฟล์ที่ใช้อยู่ลบไม่ได้) · เอากลับ = PATCH /api/assets/[id] {restore:true}
 * สิทธิ์: ดู = assets.view · สร้างอัลบั้ม/อัลบั้มย่อย = assets.upload · ย้าย/เปลี่ยนชื่อ/ลบอัลบั้มว่าง/ย้ายเข้าแบรนด์ = assets.edit
 * ตรรกะ: lib/sample-images (เทสต์)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { actorId } from "@/app/api/assets/shared";
import {
  SAMPLE_ALBUM_MARK, canMoveAlbum, descendantIds, inferAlbumBrand, parentOf, parseSampleMark, rollupAlbum, sampleAlbumMark, sampleAlbumName, sampleCounts,
  type SampleAlbum, type SampleBrand, type SamplePhoto, type SampleSheetRef,
} from "@/lib/sample-images";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALBUM_LIMIT = 300;
const CHUNK = 200;   // แบ่งรายการ id/key ยาว ๆ ก่อนส่ง .in() (กัน URL ยาวเกิน)
const NAME_MAX = 80;

type Admin = ReturnType<typeof supabaseAdmin>;
const chunks = <T,>(xs: T[]): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK)); return out; };

type AssetLite = { id: string; r2_key: string; file_name: string | null; width: number | null; height: number | null; status: string | null; created_at: string };
type BrandRow = SampleBrand & { is_customer_job: boolean | null };
type AlbumRow = { id: string; name: string; description: string | null; created_at: string; brandId: string | null; parentId: string | null };

/** r2_key → ใบงานที่แนบรูปนี้อยู่ (ดูจากไฟล์แนบจริงของใบงาน) */
async function sheetsByKey(admin: Admin, keys: string[]): Promise<Map<string, SampleSheetRef[]>> {
  const out = new Map<string, SampleSheetRef[]>();
  if (!keys.length) return out;
  const links: { file_path: string; entity_id: string }[] = [];
  for (const part of chunks(keys)) {
    const { data, error } = await admin.from("erp_playground_attachments").select("file_path, entity_id")
      .eq("entity_type", "design_sheet").in("file_path", part);
    if (error) throw new Error(error.message);
    links.push(...((data ?? []) as typeof links));
  }
  const sheets = new Map<string, SampleSheetRef>();
  for (const part of chunks([...new Set(links.map((l) => l.entity_id))])) {
    const { data, error } = await admin.from("design_sheets").select("id, code, name, brand_id").in("id", part);
    if (error) throw new Error(error.message);
    for (const s of (data ?? []) as SampleSheetRef[]) sheets.set(s.id, s);
  }
  for (const l of links) {
    const s = sheets.get(l.entity_id);
    if (!s) continue;
    const list = out.get(l.file_path) ?? [];
    if (!list.some((x) => x.id === s.id)) list.push(s);
    out.set(l.file_path, list);
  }
  return out;
}

async function loadBrands(admin: Admin): Promise<BrandRow[]> {
  const { data, error } = await admin.from("brands").select("id, name, color, logo_url, is_customer_job").eq("is_active", true).order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BrandRow[];
}

/** อัลบั้ม SAMPLE ทั้งหมด (ล่าสุดก่อน) พร้อมแบรนด์/อัลบั้มแม่จากป้าย */
async function loadAlbums(admin: Admin, limit = ALBUM_LIMIT): Promise<AlbumRow[]> {
  const { data, error } = await admin.from("asset_collections").select("id, name, description, created_at")
    .like("description", `${SAMPLE_ALBUM_MARK}%`).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Omit<AlbumRow, "brandId" | "parentId">[]).flatMap((a) => {
    const m = parseSampleMark(a.description);
    return m ? [{ ...a, brandId: m.brandId, parentId: m.parentId }] : [];
  });
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;
  const albumId = new URL(request.url).searchParams.get("album");
  const admin = supabaseAdmin();
  try {
    const [brandRows, albumsRaw] = await Promise.all([loadBrands(admin), loadAlbums(admin)]);
    const ids = albumsRaw.map((a) => a.id);

    // รูปในอัลบั้มทั้งหมด (asset อยู่ได้หลายอัลบั้ม ผ่าน asset_collection_map)
    const map: { asset_id: string; collection_id: string }[] = [];
    for (const part of chunks(ids)) {
      const { data, error: e } = await admin.from("asset_collection_map").select("asset_id, collection_id").in("collection_id", part);
      if (e) throw new Error(e.message);
      map.push(...((data ?? []) as typeof map));
    }
    const assets = new Map<string, AssetLite>();
    for (const part of chunks([...new Set(map.map((m) => m.asset_id))])) {
      const { data, error: e } = await admin.from("assets").select("id, r2_key, file_name, width, height, status, created_at").in("id", part);
      if (e) throw new Error(e.message);
      for (const a of (data ?? []) as AssetLite[]) assets.set(a.id, a);
    }
    const moved = await sheetsByKey(admin, [...new Set([...assets.values()].map((a) => a.r2_key).filter(Boolean))]);

    const byAlbum = new Map<string, SamplePhoto[]>();
    for (const m of map) {
      const a = assets.get(m.asset_id);
      if (!a) continue;
      const list = byAlbum.get(m.collection_id) ?? [];
      list.push({ id: a.id, r2_key: a.r2_key, file_name: a.file_name ?? "", width: a.width, height: a.height, created_at: a.created_at, trashed: a.status === "trashed", moved_to: moved.get(a.r2_key) ?? [] });
      byAlbum.set(m.collection_id, list);
    }
    const tree = albumsRaw.map((a) => ({ id: a.id, parent_id: a.parentId }));
    const albums: SampleAlbum[] = albumsRaw.map((a) => {
      const ps = byAlbum.get(a.id) ?? [];
      const parent = parentOf(tree, a.id);
      const r = rollupAlbum(tree, byAlbum, a.id);
      return {
        id: a.id, name: a.name, created_at: a.created_at, brand_id: a.brandId, parent_id: parent,
        suggested_brand_id: a.brandId || parent ? null : inferAlbumBrand(ps),
        counts: sampleCounts(ps), deep: { photos: r.photos, sent: r.sent, sub_count: r.sub_count }, preview_keys: r.preview_keys,
      };
    });
    // ทุกแบรนด์ที่เปิดใช้ — แบรนด์ของเราขึ้นก่อน แล้วค่อยแบรนด์ที่ติ๊กงานลูกค้า
    //   (เดิมกรองงานลูกค้าออก → Good Goods ที่ติ๊กงานลูกค้าไว้หายจากแถบ ทั้งที่เจ้าของใช้จริง · ตรวจหลังขึ้นเว็บ 2026-11-13)
    const brands: SampleBrand[] = [...brandRows]
      .sort((x, y) => Number(!!x.is_customer_job) - Number(!!y.is_customer_job))
      .map(({ id, name, color, logo_url }) => ({ id, name, color, logo_url }));
    const photos = albumId
      ? (byAlbum.get(albumId) ?? []).sort((x, y) => x.created_at.localeCompare(y.created_at) || x.file_name.localeCompare(y.file_name))
      : null;
    return NextResponse.json({ data: { brands, albums, photos }, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[sample-images] GET failed:", e);
    return NextResponse.json({ data: null, error: "โหลดรูปตัวอย่างไม่สำเร็จ — ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

/** ย้ายรูป (เฉพาะที่อยู่ในอัลบั้มต้นทางจริง) → คืนจำนวนที่ย้าย · อัลบั้มปลายทางมีแบรนด์ = เติมแบรนด์ให้รูปที่ยังว่าง */
async function movePhotos(admin: Admin, fromId: string, to: AlbumRow, assetIds: string[]): Promise<number> {
  const inFrom: string[] = [];
  for (const part of chunks(assetIds)) {
    const { data, error } = await admin.from("asset_collection_map").select("asset_id").eq("collection_id", fromId).in("asset_id", part);
    if (error) throw new Error(error.message);
    inFrom.push(...((data ?? []) as { asset_id: string }[]).map((m) => m.asset_id));
  }
  for (const part of chunks(inFrom)) {
    const { error } = await admin.from("asset_collection_map").upsert(part.map((id) => ({ asset_id: id, collection_id: to.id })), { onConflict: "asset_id,collection_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    await admin.from("asset_collection_map").delete().eq("collection_id", fromId).in("asset_id", part);
    await admin.from("assets").update({ collection_id: to.id }).in("id", part).eq("collection_id", fromId);
    if (to.brandId) await admin.from("assets").update({ brand_id: to.brandId }).in("id", part).is("brand_id", null);
  }
  return inFrom.length;
}

/** แก้ป้ายอัลบั้มทั้งกิ่ง (ตัวเอง + ลูกทุกชั้น) ให้เป็นแบรนด์นี้ · reparent = เปลี่ยนแม่ของลูกชั้นแรก (ตอนรวมอัลบั้ม) */
async function rebrandBranch(admin: Admin, all: AlbumRow[], rootId: string, brandId: string | null, reparentChildrenTo?: string) {
  const tree = all.map((a) => ({ id: a.id, parent_id: a.parentId }));
  for (const id of descendantIds(tree, rootId)) {
    const a = all.find((x) => x.id === id)!;
    const parent = reparentChildrenTo && a.parentId === rootId ? reparentChildrenTo : a.parentId;
    await admin.from("asset_collections").update({ description: sampleAlbumMark(brandId, parent) }).eq("id", id);
  }
}

const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "");

export async function POST(request: NextRequest) {
  let body: { action?: string; brand_id?: string | null; album_id?: string; parent_id?: string; to_parent_id?: string | null; name?: string; asset_ids?: string[]; from_album_id?: string; to_album_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const brandOf = async (id: string | null | undefined) => {
    if (!id) return null;
    const { data } = await admin.from("brands").select("id, name").eq("id", id).eq("is_active", true).maybeSingle();
    return (data as { id: string; name: string } | null) ?? null;
  };
  const audit = async (action: string, entityId: string, metadata: Record<string, unknown>) =>
    writeAudit(admin, { action, entityType: "asset_collection", entityId, actorId: await actorId(request), metadata: { kind: "sample", ...metadata } });
  const assetIds = Array.isArray(body.asset_ids) ? [...new Set(body.asset_ids.filter((x) => typeof x === "string" && x))].slice(0, 1000) : [];

  try {
    // ── หา/สร้างอัลบั้มของแบรนด์ + วันนี้ ──
    if (body.action === "album") {
      const denied = await guardApi(request, "assets.upload");
      if (denied) return denied;
      const brand = await brandOf(body.brand_id);
      if (body.brand_id && !brand) return NextResponse.json({ error: "ไม่พบแบรนด์นี้" }, { status: 400 });
      const name = sampleAlbumName(new Date(), brand?.name);
      const mark = sampleAlbumMark(brand?.id);
      const { data: found, error } = await admin.from("asset_collections").select("id, name")
        .eq("description", mark).eq("name", name).order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (error) return NextResponse.json({ error: "หาอัลบั้มของวันนี้ไม่สำเร็จ" }, { status: 500 });
      if (found) return NextResponse.json({ data: found, created: false, error: null });
      const { data: made, error: e2 } = await admin.from("asset_collections").insert({ name, description: mark }).select("id, name").single();
      if (e2 || !made) return NextResponse.json({ error: "สร้างอัลบั้มไม่สำเร็จ" }, { status: 500 });
      await audit("create", made.id as string, { name, brand_id: brand?.id ?? null });
      return NextResponse.json({ data: made, created: true, error: null });
    }

    // ── สร้างอัลบั้มย่อย (+ ย้ายรูปที่เลือกเข้าไป) ──
    if (body.action === "create_sub") {
      const denied = await guardApi(request, "assets.upload");
      if (denied) return denied;
      const name = cleanName(body.name);
      if (!name) return NextResponse.json({ error: "ใส่ชื่ออัลบั้มก่อน" }, { status: 400 });
      const all = await loadAlbums(admin, 2000);
      const parent = all.find((a) => a.id === body.parent_id);
      if (!parent) return NextResponse.json({ error: "ไม่พบอัลบั้มที่จะสร้างอัลบั้มย่อยไว้ข้างใน" }, { status: 404 });
      const { data: made, error } = await admin.from("asset_collections").insert({ name, description: sampleAlbumMark(parent.brandId, parent.id) }).select("id, name").single();
      if (error || !made) return NextResponse.json({ error: "สร้างอัลบั้มไม่สำเร็จ" }, { status: 500 });
      let moved = 0;
      if (assetIds.length && body.from_album_id) {
        const from = all.find((a) => a.id === body.from_album_id);
        if (from) moved = await movePhotos(admin, from.id, { ...parent, id: made.id as string, name, parentId: parent.id }, assetIds);
      }
      await audit("create", made.id as string, { name, parent_id: parent.id, brand_id: parent.brandId, moved_photos: moved, from_album: body.from_album_id ?? null });
      return NextResponse.json({ data: { id: made.id, name, moved }, error: null });
    }

    // ── ย้ายรูประหว่างอัลบั้ม ──
    if (body.action === "move_photos") {
      const denied = await guardApi(request, "assets.edit");
      if (denied) return denied;
      if (!assetIds.length) return NextResponse.json({ error: "เลือกรูปก่อน" }, { status: 400 });
      const all = await loadAlbums(admin, 2000);
      const from = all.find((a) => a.id === body.from_album_id);
      const to = all.find((a) => a.id === body.to_album_id);
      if (!from || !to) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
      if (from.id === to.id) return NextResponse.json({ data: { moved: 0 }, error: null });
      const moved = await movePhotos(admin, from.id, to, assetIds);
      await audit("update", to.id, { move_photos: moved, from_album: from.id, asset_ids: assetIds.slice(0, 200) });
      return NextResponse.json({ data: { moved }, error: null });
    }

    // ── ย้ายทั้งอัลบั้ม ──
    if (body.action === "move_album") {
      const denied = await guardApi(request, "assets.edit");
      if (denied) return denied;
      const all = await loadAlbums(admin, 2000);
      const album = all.find((a) => a.id === body.album_id);
      if (!album) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
      const toParent = body.to_parent_id ?? null;
      const tree = all.map((a) => ({ id: a.id, parent_id: a.parentId }));
      if (!canMoveAlbum(tree, album.id, toParent)) return NextResponse.json({ error: "ย้ายอัลบั้มเข้าไปในตัวเอง หรือในอัลบั้มย่อยของตัวเองไม่ได้" }, { status: 400 });
      const parent = toParent ? all.find((a) => a.id === toParent)! : null;
      const brandId = parent ? parent.brandId : album.brandId;
      await admin.from("asset_collections").update({ description: sampleAlbumMark(brandId, toParent) }).eq("id", album.id);
      if (brandId !== album.brandId) await rebrandBranch(admin, all, album.id, brandId);
      await audit("update", album.id, { move_album: true, from_parent: album.parentId, to_parent: toParent });
      return NextResponse.json({ data: { id: album.id }, error: null });
    }

    // ── เปลี่ยนชื่ออัลบั้มย่อย ──
    if (body.action === "rename") {
      const denied = await guardApi(request, "assets.edit");
      if (denied) return denied;
      const name = cleanName(body.name);
      if (!name) return NextResponse.json({ error: "ใส่ชื่ออัลบั้มก่อน" }, { status: 400 });
      const all = await loadAlbums(admin, 2000);
      const album = all.find((a) => a.id === body.album_id);
      if (!album) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
      if (!album.parentId) return NextResponse.json({ error: "อัลบั้มของวันใช้ชื่อตามวันที่ — เปลี่ยนได้เฉพาะอัลบั้มย่อย" }, { status: 400 });
      await admin.from("asset_collections").update({ name }).eq("id", album.id);
      await audit("update", album.id, { old_name: album.name, new_name: name });
      return NextResponse.json({ data: { id: album.id, name }, error: null });
    }

    // ── ลบอัลบั้มย่อยที่ว่างแล้ว ──
    if (body.action === "delete_album") {
      const denied = await guardApi(request, "assets.edit");
      if (denied) return denied;
      const all = await loadAlbums(admin, 2000);
      const album = all.find((a) => a.id === body.album_id);
      if (!album) return NextResponse.json({ error: "ไม่พบอัลบั้ม" }, { status: 404 });
      if (!album.parentId) return NextResponse.json({ error: "ลบได้เฉพาะอัลบั้มย่อย" }, { status: 400 });
      const { count } = await admin.from("asset_collection_map").select("asset_id", { count: "exact", head: true }).eq("collection_id", album.id);
      if ((count ?? 0) > 0 || all.some((a) => a.parentId === album.id)) return NextResponse.json({ error: "อัลบั้มยังมีรูปหรืออัลบั้มย่อยอยู่ — ย้ายออกก่อนค่อยลบ" }, { status: 409 });
      await admin.from("asset_collections").delete().eq("id", album.id);
      await audit("delete", album.id, { name: album.name, parent_id: album.parentId });
      return NextResponse.json({ data: { id: album.id, parent_id: album.parentId }, error: null });
    }

    // ── ย้ายอัลบั้มเข้าแบรนด์ ──
    if (body.action === "set_brand") {
      const denied = await guardApi(request, "assets.edit");
      if (denied) return denied;
      const brand = await brandOf(body.brand_id);
      if (!brand) return NextResponse.json({ error: "เลือกแบรนด์ก่อน" }, { status: 400 });
      const all = await loadAlbums(admin, 2000);
      const a = all.find((x) => x.id === String(body.album_id ?? ""));
      if (!a) return NextResponse.json({ error: "ไม่พบอัลบั้มนี้" }, { status: 404 });
      const name = a.parentId ? a.name : sampleAlbumName(new Date(a.created_at), brand.name);
      const desc = sampleAlbumMark(brand.id, a.parentId);
      const { data: maps } = await admin.from("asset_collection_map").select("asset_id").eq("collection_id", a.id);
      const ids = ((maps ?? []) as { asset_id: string }[]).map((m) => m.asset_id);
      const target = a.parentId ? null : all.find((x) => x.id !== a.id && !x.parentId && x.brandId === brand.id && x.name === name) ?? null;
      let resultId = a.id;
      if (target) {
        // แบรนด์นี้มีอัลบั้มวันเดียวกันอยู่แล้ว → รวมรูปเข้าอัลบั้มนั้น · อัลบั้มย่อยย้ายตามไปอยู่ในอัลบั้มนั้น · แล้วลบอัลบั้มเปล่า
        for (const part of chunks(ids)) {
          const { error: e } = await admin.from("asset_collection_map").upsert(part.map((id) => ({ asset_id: id, collection_id: target.id })), { onConflict: "asset_id,collection_id", ignoreDuplicates: true });
          if (e) return NextResponse.json({ error: "รวมอัลบั้มไม่สำเร็จ" }, { status: 500 });
        }
        await admin.from("assets").update({ collection_id: target.id }).eq("collection_id", a.id);
        await rebrandBranch(admin, all, a.id, brand.id, target.id);
        await admin.from("asset_collection_map").delete().eq("collection_id", a.id);
        await admin.from("asset_collections").delete().eq("id", a.id);
        resultId = target.id;
      } else {
        const { error: e } = await admin.from("asset_collections").update({ name, description: desc }).eq("id", a.id);
        if (e) return NextResponse.json({ error: "ย้ายอัลบั้มไม่สำเร็จ" }, { status: 500 });
        await rebrandBranch(admin, all, a.id, brand.id);
      }
      for (const part of chunks(ids)) await admin.from("assets").update({ brand_id: brand.id }).in("id", part).is("brand_id", null);
      await audit("update", resultId, { set_brand: brand.id, from_album: a.id, old_name: a.name, new_name: name, merged: !!target, files: ids.length });
      return NextResponse.json({ data: { id: resultId, name, merged: !!target }, error: null });
    }
  } catch (e) {
    console.error("[sample-images] POST failed:", body.action, e);
    return NextResponse.json({ error: "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง" }, { status: 500 });
  }

  return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
}
