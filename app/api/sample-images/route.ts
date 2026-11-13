/**
 * /api/sample-images — หน้า "SAMPLE Images" (รูปตัวอย่างที่รอเอาไปใส่ใบงานใน Design Dashboard)
 *
 * GET                 → อัลบั้ม SAMPLE ล่าสุด (60 อัลบั้ม) + จำนวน รอย้าย/ย้ายแล้ว/ถังขยะ
 * GET ?album=<id>     → + รูปในอัลบั้มนั้น (สถานะ + ใบงานที่ย้ายไปแล้ว)
 * POST {action:"album"} → หา/สร้างอัลบั้มของวันนี้ (ชื่อตามวันที่ลง เวลาไทย) — คืน {id,name}
 *
 * ของที่ทำผ่าน API กลางเดิม (ไม่เขียนซ้ำ):
 *   ลงรูป = POST /api/assets (source=sample, collection_id) · ย้ายเข้าใบงาน = POST /api/attachments/from-library
 *   ลบ = DELETE /api/assets/[id] (ถังขยะ · ไฟล์ที่ใช้อยู่ลบไม่ได้) · เอากลับ = PATCH /api/assets/[id] {restore:true}
 * สิทธิ์: ดู = assets.view · สร้างอัลบั้ม = assets.upload · ตรรกะสถานะ: lib/sample-images
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { actorId } from "@/app/api/assets/shared";
import {
  SAMPLE_ALBUM_MARK, sampleAlbumName, sampleCounts, sampleStatusOf,
  type SampleAlbum, type SamplePhoto, type SampleSheetRef,
} from "@/lib/sample-images";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALBUM_LIMIT = 60;
const CHUNK = 200;   // แบ่งรายการ id/key ยาว ๆ ก่อนส่ง .in() (กัน URL ยาวเกิน)

type Admin = ReturnType<typeof supabaseAdmin>;
const chunks = <T,>(xs: T[]): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK)); return out; };

type AssetLite = { id: string; r2_key: string; file_name: string | null; width: number | null; height: number | null; status: string | null; created_at: string };

/** r2_key → ใบงานที่แนบรูปนี้อยู่ (ดูจากไฟล์แนบจริงของใบงาน — ใบงานเอารูปออกแล้ว = กลับมา "รอย้าย") */
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
  const sheetIds = [...new Set(links.map((l) => l.entity_id))];
  const sheets = new Map<string, SampleSheetRef>();
  for (const part of chunks(sheetIds)) {
    const { data, error } = await admin.from("design_sheets").select("id, code, name").in("id", part);
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

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;
  const albumId = new URL(request.url).searchParams.get("album");
  const admin = supabaseAdmin();
  try {
    const { data: cols, error } = await admin.from("asset_collections").select("id, name, created_at")
      .eq("description", SAMPLE_ALBUM_MARK).order("created_at", { ascending: false }).limit(ALBUM_LIMIT);
    if (error) throw new Error(error.message);
    const albumsRaw = (cols ?? []) as { id: string; name: string; created_at: string }[];
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

    const photoOf = (a: AssetLite): SamplePhoto => {
      const movedTo = moved.get(a.r2_key) ?? [];
      return { id: a.id, r2_key: a.r2_key, file_name: a.file_name ?? "", width: a.width, height: a.height, created_at: a.created_at, status: sampleStatusOf(a.status, movedTo), moved_to: movedTo };
    };
    const byAlbum = new Map<string, SamplePhoto[]>();
    for (const m of map) {
      const a = assets.get(m.asset_id);
      if (!a) continue;
      const list = byAlbum.get(m.collection_id) ?? [];
      list.push(photoOf(a));
      byAlbum.set(m.collection_id, list);
    }
    const albums: SampleAlbum[] = albumsRaw.map((a) => ({ ...a, counts: sampleCounts(byAlbum.get(a.id) ?? []) }));
    const photos = albumId
      ? (byAlbum.get(albumId) ?? []).sort((x, y) => x.created_at.localeCompare(y.created_at) || x.file_name.localeCompare(y.file_name))
      : null;
    return NextResponse.json({ data: { albums, photos }, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[sample-images] GET failed:", e);
    return NextResponse.json({ data: null, error: "โหลดรูปตัวอย่างไม่สำเร็จ — ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "assets.upload");
  if (denied) return denied;
  let body: { action?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (body.action !== "album") return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });

  const admin = supabaseAdmin();
  const name = sampleAlbumName(new Date());
  const { data: found, error } = await admin.from("asset_collections").select("id, name")
    .eq("description", SAMPLE_ALBUM_MARK).eq("name", name).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: "หาอัลบั้มของวันนี้ไม่สำเร็จ" }, { status: 500 });
  if (found) return NextResponse.json({ data: found, created: false, error: null });

  const { data: made, error: e2 } = await admin.from("asset_collections").insert({ name, description: SAMPLE_ALBUM_MARK }).select("id, name").single();
  if (e2 || !made) return NextResponse.json({ error: "สร้างอัลบั้มไม่สำเร็จ" }, { status: 500 });
  await writeAudit(admin, { action: "create", entityType: "asset_collection", entityId: made.id as string, actorId: await actorId(request), metadata: { name, kind: "sample" } });
  return NextResponse.json({ data: made, created: true, error: null });
}
