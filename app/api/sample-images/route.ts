/**
 * /api/sample-images — หน้า "SAMPLE Images" (อัลบั้มรูปตัวอย่างประจำแบรนด์ · ส่งรูปเข้าใบงานใน Design Dashboard)
 *
 * GET                    → แบรนด์ของเรา + อัลบั้ม SAMPLE ล่าสุด 100 อัลบั้ม (แบรนด์ · จำนวนรูป/ถังขยะ · แบรนด์ที่แนะนำของอัลบั้มไม่ระบุแบรนด์)
 * GET ?album=<id>        → + รูปในอัลบั้มนั้น (ใบงานที่ส่งเข้าไปแล้ว)
 * POST {action:"album", brand_id?}            → หา/สร้างอัลบั้มของแบรนด์+วันนี้ (เวลาไทย) — คืน {id,name}
 * POST {action:"set_brand", album_id, brand_id} → ย้ายอัลบั้มที่ยังไม่ระบุแบรนด์เข้าแบรนด์ (มีอัลบั้มแบรนด์+วันเดียวกันอยู่แล้ว = รวมเข้าด้วยกัน)
 *
 * ของที่ทำผ่าน API กลางเดิม (ไม่เขียนซ้ำ):
 *   ลงรูป = POST /api/assets (source=sample, collection_id, brand_id) · ส่งเข้าใบงาน = POST /api/attachments/from-library
 *   ลบ = DELETE /api/assets/[id] (ถังขยะ · ไฟล์ที่ใช้อยู่ลบไม่ได้) · เอากลับ = PATCH /api/assets/[id] {restore:true}
 * สิทธิ์: ดู = assets.view · สร้างอัลบั้ม = assets.upload · ย้ายอัลบั้มเข้าแบรนด์ = assets.edit · ตรรกะ: lib/sample-images
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { actorId } from "@/app/api/assets/shared";
import {
  SAMPLE_ALBUM_MARK, inferAlbumBrand, parseSampleMark, sampleAlbumMark, sampleAlbumName, sampleCounts,
  type SampleAlbum, type SampleBrand, type SamplePhoto, type SampleSheetRef,
} from "@/lib/sample-images";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALBUM_LIMIT = 100;
const CHUNK = 200;   // แบ่งรายการ id/key ยาว ๆ ก่อนส่ง .in() (กัน URL ยาวเกิน)

type Admin = ReturnType<typeof supabaseAdmin>;
const chunks = <T,>(xs: T[]): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK)); return out; };

type AssetLite = { id: string; r2_key: string; file_name: string | null; width: number | null; height: number | null; status: string | null; created_at: string };
type BrandRow = SampleBrand & { is_customer_job: boolean | null };

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

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;
  const albumId = new URL(request.url).searchParams.get("album");
  const admin = supabaseAdmin();
  try {
    const [brandRows, colsRes] = await Promise.all([
      loadBrands(admin),
      admin.from("asset_collections").select("id, name, description, created_at")
        .like("description", `${SAMPLE_ALBUM_MARK}%`).order("created_at", { ascending: false }).limit(ALBUM_LIMIT),
    ]);
    if (colsRes.error) throw new Error(colsRes.error.message);
    const albumsRaw = ((colsRes.data ?? []) as { id: string; name: string; description: string | null; created_at: string }[])
      .map((a) => ({ ...a, mark: parseSampleMark(a.description) })).filter((a) => a.mark);
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
    const albums: SampleAlbum[] = albumsRaw.map((a) => {
      const ps = byAlbum.get(a.id) ?? [];
      const brandId = a.mark!.brandId;
      return { id: a.id, name: a.name, created_at: a.created_at, brand_id: brandId, suggested_brand_id: brandId ? null : inferAlbumBrand(ps), counts: sampleCounts(ps) };
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

export async function POST(request: NextRequest) {
  let body: { action?: string; brand_id?: string | null; album_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const brandOf = async (id: string | null | undefined) => {
    if (!id) return null;
    const { data } = await admin.from("brands").select("id, name").eq("id", id).eq("is_active", true).maybeSingle();
    return (data as { id: string; name: string } | null) ?? null;
  };

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
    await writeAudit(admin, { action: "create", entityType: "asset_collection", entityId: made.id as string, actorId: await actorId(request), metadata: { name, kind: "sample", brand_id: brand?.id ?? null } });
    return NextResponse.json({ data: made, created: true, error: null });
  }

  // ── ย้ายอัลบั้มเข้าแบรนด์ ──
  if (body.action === "set_brand") {
    const denied = await guardApi(request, "assets.edit");
    if (denied) return denied;
    const brand = await brandOf(body.brand_id);
    if (!brand) return NextResponse.json({ error: "เลือกแบรนด์ก่อน" }, { status: 400 });
    const { data: album } = await admin.from("asset_collections").select("id, name, description, created_at").eq("id", String(body.album_id ?? "")).maybeSingle();
    const mark = album ? parseSampleMark((album as { description: string | null }).description) : null;
    if (!album || !mark) return NextResponse.json({ error: "ไม่พบอัลบั้มนี้" }, { status: 404 });
    const a = album as { id: string; name: string; created_at: string };
    const name = sampleAlbumName(new Date(a.created_at), brand.name);
    const desc = sampleAlbumMark(brand.id);
    const { data: maps } = await admin.from("asset_collection_map").select("asset_id").eq("collection_id", a.id);
    const assetIds = ((maps ?? []) as { asset_id: string }[]).map((m) => m.asset_id);
    const { data: target } = await admin.from("asset_collections").select("id").eq("description", desc).eq("name", name).neq("id", a.id).limit(1).maybeSingle();
    let resultId = a.id;
    if (target) {
      // แบรนด์นี้มีอัลบั้มวันเดียวกันอยู่แล้ว → รวมรูปเข้าอัลบั้มนั้น แล้วลบอัลบั้มเปล่า
      const tid = (target as { id: string }).id;
      for (const part of chunks(assetIds)) {
        const { error: e } = await admin.from("asset_collection_map").upsert(part.map((id) => ({ asset_id: id, collection_id: tid })), { onConflict: "asset_id,collection_id", ignoreDuplicates: true });
        if (e) return NextResponse.json({ error: "รวมอัลบั้มไม่สำเร็จ" }, { status: 500 });
      }
      await admin.from("assets").update({ collection_id: tid }).eq("collection_id", a.id);
      await admin.from("asset_collection_map").delete().eq("collection_id", a.id);
      await admin.from("asset_collections").delete().eq("id", a.id);
      resultId = tid;
    } else {
      const { error: e } = await admin.from("asset_collections").update({ name, description: desc }).eq("id", a.id);
      if (e) return NextResponse.json({ error: "ย้ายอัลบั้มไม่สำเร็จ" }, { status: 500 });
    }
    for (const part of chunks(assetIds)) await admin.from("assets").update({ brand_id: brand.id }).in("id", part).is("brand_id", null);
    await writeAudit(admin, { action: "update", entityType: "asset_collection", entityId: resultId, actorId: await actorId(request), metadata: { kind: "sample", set_brand: brand.id, from_album: a.id, old_name: a.name, new_name: name, merged: !!target, files: assetIds.length } });
    return NextResponse.json({ data: { id: resultId, name, merged: !!target }, error: null });
  }

  return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
}
