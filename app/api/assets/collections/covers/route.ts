/**
 * GET /api/assets/collections/covers?ids=a,b,c — ปกโฟลเดอร์ (รูปล่าสุด ≤ 4 รูปต่ออัลบั้ม) สำหรับมุมมองโฟลเดอร์ในคลังไฟล์
 *   ครั้งละไม่เกิน 40 อัลบั้ม · เฉพาะรูปที่ยังไม่ลบ · คืน { data: { [albumId]: string[] (ลิงก์รูป) } }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { urlFor } from "../../shared";

export const dynamic = "force-dynamic";

const PER_ALBUM = 4;

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 40);
  if (!ids.length) return NextResponse.json({ data: {} });
  const admin = supabaseAdmin();
  const { data: maps, error } = await admin.from("asset_collection_map").select("collection_id, asset_id").in("collection_id", ids).limit(5000);
  if (error) return NextResponse.json({ data: {}, error: "โหลดปกโฟลเดอร์ไม่สำเร็จ" }, { status: 500 });
  const assetIds = [...new Set((maps ?? []).map((m) => m.asset_id as string))];
  const byId = new Map<string, { r2_key: string; created_at: string }>();
  for (let i = 0; i < assetIds.length; i += 300) {
    const { data: rows } = await admin.from("assets").select("id, r2_key, created_at")
      .in("id", assetIds.slice(i, i + 300)).eq("status", "active").eq("asset_type", "image");
    for (const r of rows ?? []) byId.set(r.id as string, { r2_key: r.r2_key as string, created_at: r.created_at as string });
  }
  const out: Record<string, string[]> = {};
  for (const id of ids) {
    out[id] = (maps ?? []).filter((m) => m.collection_id === id).map((m) => byId.get(m.asset_id as string)).filter((a): a is { r2_key: string; created_at: string } => !!a)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, PER_ALBUM).map((a) => urlFor(a.r2_key));
  }
  return NextResponse.json({ data: out }, { headers: { "Cache-Control": "private, max-age=60" } });
}
