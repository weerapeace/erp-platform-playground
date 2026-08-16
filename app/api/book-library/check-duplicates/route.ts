/**
 * POST /api/book-library/check-duplicates — เช็กว่าชื่อเล่มไหน "มีในคลังแล้ว"
 *
 * body: { titles: string[] }
 * คืน:  { existing: { "<ชื่อที่ส่งมา>": { id, status, volume, series } }, error: null }
 *
 * ใช้ก่อนบันทึกใน "📚 เพิ่มทั้งชุด" และ "📧 จากอีเมล" เพื่อบอกผู้ใช้ก่อนว่าเล่มไหนซ้ำ
 * (ด่านจริงที่กันซ้ำคือ unique index `book_library_active_title_uniq` ในฐานข้อมูล —
 *  ตัวนี้มีไว้ให้ผู้ใช้ "เห็นก่อน" ไม่ใช่ให้พึ่งเป็นด่านความปลอดภัย)
 *
 * เทียบแบบเดียวกับ index: ตัวพิมพ์เล็ก + ตัดช่องว่างหัวท้าย + ยุบช่องว่างซ้ำ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_TITLES = 500;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

type BookRow = { id: string; title: string; volume: string | null; series: string | null; status: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "books.view"); if (denied) return denied;

  let body: { titles?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ existing: {}, error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 }); }

  const titles = Array.isArray(body.titles)
    ? (body.titles as unknown[]).map((t) => String(t ?? "")).filter((t) => t.trim()).slice(0, MAX_TITLES)
    : [];
  if (titles.length === 0) return NextResponse.json({ existing: {}, error: null });

  const wanted = new Map<string, string>();          // ชื่อที่ normalize แล้ว → ชื่อดิบที่ผู้เรียกส่งมา
  for (const t of titles) wanted.set(norm(t), t);

  const admin = supabaseAdmin();
  // ดึงเฉพาะคอลัมน์ที่ใช้ (เบา) — คลังหนังสือส่วนตัวมีหลักร้อย/พัน แถวเดียวไม่กี่ไบต์
  const { data, error } = await admin
    .from("book_library")
    .select("id, title, volume, series, status")
    .eq("is_active", true)
    .limit(5000);
  if (error) return NextResponse.json({ existing: {}, error: error.message }, { status: 200 });

  const existing: Record<string, { id: string; status: string; volume: string; series: string }> = {};
  for (const r of (data ?? []) as BookRow[]) {
    const raw = wanted.get(norm(String(r.title ?? "")));
    if (!raw || existing[raw]) continue;
    existing[raw] = {
      id: String(r.id),
      status: String(r.status ?? ""),
      volume: String(r.volume ?? ""),
      series: String(r.series ?? ""),
    };
  }

  return NextResponse.json({ existing, error: null });
}
