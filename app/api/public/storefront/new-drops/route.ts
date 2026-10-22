/**
 * 🆕 API สาธารณะ "มาใหม่เป็นชุด" — /api/public/storefront/new-drops?shop=<slug> (หน้าเว็บ /new)
 *
 * คืน { now, upcoming:[…], started:[…] }
 *   upcoming = ชุดที่ยังไม่ถึงเวลาเปิด (ใกล้สุดก่อน) — ส่งแค่ชื่อ/รูปปก/เวลา ไม่ส่งรายการสินค้า (ไม่หลุดก่อนเปิด)
 *   started  = ชุดที่เปิดแล้ว (ล่าสุดก่อน · status live|ended) + รหัสรุ่น (เว็บจับคู่กับสินค้าจาก API สินค้า)
 * รูปเป็น URL ผ่าน /api/r2-image (คอม 2000 / มือถือ 1080 · webp)
 * ⚠️ ไม่มี guardApi โดยเจตนา (ข้อมูลที่ตั้งใจเผยแพร่) + CORS · no-store (เว็บร้านแคชเองตามรอบ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dropFromRow, dropStatus, orderDrops, type NewDrop } from "@/lib/website-new-drops";
import { normalizeListingInserts } from "@/lib/website-listing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const slug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  if (!slug) return json({ error: "ต้องระบุ shop" }, 400);
  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, status").eq("slug", slug).maybeSingle();
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  const s = shop as { id: string; status: string };
  const now = Date.now();
  if (s.status !== "active") return json({ now: new Date(now).toISOString(), upcoming: [], started: [] });

  const { data } = await sb
    .from("store_new_drops")
    .select("id, title, title_en, subtitle, subtitle_en, image_key, image_mobile_key, codes, start_at, end_at, hide_until_start, inserts")
    .eq("shop_id", s.id)
    .order("start_at", { ascending: false })
    .limit(60);
  const drops = ((data ?? []) as Record<string, unknown>[]).map(dropFromRow);
  const origin = new URL(request.url).origin;
  const img = (key: string | null, w: number) => (key ? `${origin}/api/r2-image?key=${encodeURIComponent(key)}&w=${w}` : null);
  const out = (d: NewDrop, withCodes: boolean) => ({
    id: d.id,
    title: d.title,
    title_en: d.title_en,
    subtitle: d.subtitle,
    subtitle_en: d.subtitle_en,
    imageUrl: img(d.imageKey, 2000),
    imageMobileUrl: img(d.imageMobileKey ?? d.imageKey, 1080),
    startAt: d.startAt,
    endAt: d.endAt,
    status: dropStatus(d, now),
    codes: withCodes ? d.codes : [],
    // 🖼 รูปแทรกในตารางสินค้าของชุด (เฉพาะชุดที่เปิดแล้ว · เปิดอยู่ + มีรูป) — เว็บร้านวาดด้วยของกลาง ListingInsertTile
    inserts: withCodes ? normalizeListingInserts(d.inserts).filter((x) => x.enabled && x.imageKey) : [],
  });
  const { upcoming, started } = orderDrops(drops, now);
  return json({
    now: new Date(now).toISOString(),
    upcoming: upcoming.slice(0, 6).map((d) => out(d, false)),
    started: started.slice(0, 12).map((d) => out(d, true)),
  });
}
