/**
 * POST /api/content-albums/check-videos  body = { sizes: number[] }
 *   → { data: [{ size, matches: [{ asset_id, file_name, albums: [{id,name}] }] }] }
 *
 * กันอัปวิดีโอซ้ำแบบเบา (ก่อนอัป): วิดีโอคลิปใหญ่ขนาดไฟล์ตรงกันเป๊ะทุกไบต์ = แทบแน่ใจว่าไฟล์เดียวกัน
 * (รูปตรวจละเอียดกว่าด้วย checksum/หน้าตา ผ่าน /api/assets/find-duplicates) · เตือนอย่างเดียว ผู้ใช้เลือกเอง
 * ไม่เทียบชื่อไฟล์ (ชื่อซ้ำกันบ่อย คนละไฟล์) · สิทธิ์ assets.upload · อ่านอย่างเดียว
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MIN_BYTES = 1024 * 1024;   // ไฟล์เล็กกว่า 1MB ขนาดชนกันได้ง่าย — ไม่เตือน

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  let body: { sizes?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const sizes = [...new Set((Array.isArray(body.sizes) ? body.sizes : []).map(Number).filter((n) => Number.isInteger(n) && n >= MIN_BYTES))].slice(0, 100);
  if (!sizes.length) return NextResponse.json({ data: [], error: null });

  const admin = supabaseAdmin();
  const { data: rows, error } = await admin.from("assets").select("id, file_name, size_bytes")
    .eq("status", "active").eq("asset_type", "video").not("drive_file_id", "is", null).in("size_bytes", sizes).limit(300);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const vids = (rows ?? []) as { id: string; file_name: string; size_bytes: number }[];
  if (!vids.length) return NextResponse.json({ data: [], error: null });

  const { data: maps } = await admin.from("asset_collection_map").select("asset_id, collection_id").in("asset_id", vids.map((v) => v.id));
  const colIds = [...new Set(((maps ?? []) as { collection_id: string }[]).map((m) => m.collection_id))];
  const { data: cols } = colIds.length ? await admin.from("asset_collections").select("id, name").in("id", colIds) : { data: [] as unknown[] };
  const colName = new Map(((cols ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const albumsOf = (assetId: string) => ((maps ?? []) as { asset_id: string; collection_id: string }[])
    .filter((m) => m.asset_id === assetId).map((m) => ({ id: m.collection_id, name: colName.get(m.collection_id) ?? "" }));

  const data = sizes.map((size) => ({
    size,
    matches: vids.filter((v) => Number(v.size_bytes) === size).map((v) => ({ asset_id: v.id, file_name: v.file_name, albums: albumsOf(v.id) })),
  })).filter((r) => r.matches.length);
  return NextResponse.json({ data, error: null });
}
