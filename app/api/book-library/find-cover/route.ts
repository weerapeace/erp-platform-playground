/**
 * POST /api/book-library/find-cover — หารูปปกหนังสือจาก Google Books แล้วเก็บลง R2
 *
 * body: { id: string }            // id ของเล่มในคลัง (ต้องมีอยู่จริง)
 * คืน:  { found: boolean, r2_key: string|null, matched: string|null, error: string|null }
 *
 * ทำงาน: อ่านชื่อเรื่อง/ชุด/เล่ม/ISBN จากระเบียน → ค้น Google Books → เอารูปปกที่ได้
 *        มาเก็บใน R2 (เพื่อให้รูปไม่หายถ้าลิงก์ต้นทางเปลี่ยน และใช้กับตัวแสดงรูปกลางได้ทุกที่)
 *        → อัปเดต book_library.cover_r2_key
 *
 * ต้องตั้ง env `GOOGLE_BOOKS_API_KEY` ก่อน (ดู docs/book-library-import.md)
 * ถ้าไม่ตั้ง → คืนข้อความบอกให้ไปตั้งค่า (ไม่ throw ไม่ทำให้หน้าพัง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { r2PutObject } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 3 * 1024 * 1024;    // ปกเป็นรูปเล็ก ถ้าใหญ่กว่านี้ผิดปกติ
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type Volume = {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
};

/** คำค้น: ISBN แม่นสุด → ไม่มีก็ใช้ "ชุด + เล่ม" → ไม่มีอีกก็ใช้ชื่อเรื่อง */
function buildQuery(b: { title: string; series: string; volume: string; isbn: string }): string {
  if (b.isbn.replace(/[^0-9Xx]/g, "").length >= 10) return `isbn:${b.isbn.replace(/[^0-9Xx]/g, "")}`;
  if (b.series && b.volume) return `${b.series} ${b.volume}`;
  return b.title;
}

/** ปกที่ Google ส่งมาเป็นรูปย่อ — ขอตัวใหญ่ขึ้นและตัดเงาหน้าปกออก */
function upgradeThumb(url: string): string {
  return url.replace(/^http:/, "https:").replace(/&zoom=\d+/, "&zoom=1").replace(/&edge=curl/, "");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "books.edit"); if (denied) return denied;

  const key = (process.env.GOOGLE_BOOKS_API_KEY ?? "").trim();
  if (!key) {
    return NextResponse.json({
      found: false, r2_key: null, matched: null,
      error: "ยังไม่ได้ตั้งกุญแจ Google Books (GOOGLE_BOOKS_API_KEY) — ดูวิธีตั้งใน docs/book-library-import.md",
    }, { status: 200 });
  }

  let body: { id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ found: false, r2_key: null, matched: null, error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 }); }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ found: false, r2_key: null, matched: null, error: "ไม่ได้ระบุเล่ม" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: row, error: readErr } = await admin
    .from("book_library").select("id, title, series, volume, isbn, cover_r2_key").eq("id", id).maybeSingle();
  if (readErr || !row) return NextResponse.json({ found: false, r2_key: null, matched: null, error: "ไม่พบเล่มนี้ในคลัง" }, { status: 200 });

  const book = {
    title:  String(row.title ?? ""),
    series: String(row.series ?? ""),
    volume: String(row.volume ?? ""),
    isbn:   String(row.isbn ?? ""),
  };

  try {
    const q = buildQuery(book);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}`
      + `&maxResults=5&printType=books&country=TH&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (j?.error?.message as string) || `HTTP ${res.status}`;
      return NextResponse.json({ found: false, r2_key: null, matched: null, error: `Google Books: ${msg}` }, { status: 200 });
    }

    const items = (j.items ?? []) as Volume[];
    const hit = items.find((it) => it.volumeInfo?.imageLinks?.thumbnail || it.volumeInfo?.imageLinks?.smallThumbnail);
    const link = hit?.volumeInfo?.imageLinks?.thumbnail ?? hit?.volumeInfo?.imageLinks?.smallThumbnail;
    if (!link) return NextResponse.json({ found: false, r2_key: null, matched: null, error: null });

    const imgRes = await fetch(upgradeThumb(link));
    if (!imgRes.ok) return NextResponse.json({ found: false, r2_key: null, matched: null, error: null });
    const contentType = (imgRes.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!OK_TYPES.has(contentType)) return NextResponse.json({ found: false, r2_key: null, matched: null, error: null });
    const buf = await imgRes.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return NextResponse.json({ found: false, r2_key: null, matched: null, error: null });

    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : contentType === "image/gif" ? "gif" : "jpg";
    const r2Key = `book-covers/${id}/${Date.now()}.${ext}`;
    await r2PutObject(r2Key, buf, contentType);

    const { error: upErr } = await admin.from("book_library")
      .update({ cover_r2_key: r2Key, updated_at: new Date().toISOString() }).eq("id", id);
    if (upErr) return NextResponse.json({ found: false, r2_key: null, matched: null, error: upErr.message }, { status: 200 });

    return NextResponse.json({
      found: true, r2_key: r2Key,
      matched: String(hit?.volumeInfo?.title ?? ""), error: null,
    });
  } catch (e) {
    return NextResponse.json({ found: false, r2_key: null, matched: null, error: (e as Error).message ?? "หารูปปกไม่สำเร็จ" }, { status: 200 });
  }
}
