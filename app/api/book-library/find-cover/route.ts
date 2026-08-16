/**
 * POST /api/book-library/find-cover — หารูปปกหนังสือจาก Google Books แล้วเก็บลง R2
 *
 * body: { id: string, force?: boolean }
 * คืน:  { found: boolean, r2_key: string|null, matched: string|null, error: string|null }
 *
 * ⚠️ บทเรียน (2026-08-16): เวอร์ชันแรกเอา "ผลลัพธ์แรกที่มีรูป" มาใช้เลย → ได้ปกมั่ว
 *    (หนังสือ SEO / หน้าหนังสือพิมพ์) เพราะ Google Books คืนผลลัพธ์แบบหลวมมากเมื่อค้นชื่อไทย
 *    ที่ไม่มีในคลังของเขา — **ต้องตรวจว่าชื่อที่ได้ตรงกับที่หาจริง ไม่ตรง = ไม่เอา ดีกว่าได้ปกผิด**
 *
 * ลำดับการค้น: ISBN (แม่นสุด) → intitle ชื่อไทย → ให้ AI แปลชื่อเป็นอังกฤษ/ญี่ปุ่นแล้วค้นซ้ำ
 * (การ์ตูนไทยมักไม่มีในคลัง Google แต่ฉบับ EN/JP มี)
 *
 * ต้องตั้ง env `GOOGLE_BOOKS_API_KEY` ก่อน (ดู docs/book-library-import.md)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { r2PutObject } from "@/lib/r2";
import { chatJson, openAiKey } from "@/lib/ai-caption";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 3 * 1024 * 1024;
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const THAI = /[฀-๿]/;

type Volume = {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
};

/** ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลข เพื่อเทียบชื่อแบบหลวม ๆ แต่ยังเชื่อถือได้ */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9฀-๿぀-ヿ一-鿿]/gi, "");

/** ชื่อที่ได้ต้อง "มีชื่อที่เราหา" อยู่จริง + ถ้าระบุเล่มต้องมีเลขเล่มนั้น (ไม่ใช่เลขที่บังเอิญคาบเกี่ยว) */
function accepts(cand: string, expected: string[], volume: string): boolean {
  const c = norm(cand);
  if (!c) return false;
  const titleOk = expected.some((e) => { const n = norm(e); return n.length >= 3 && c.includes(n); });
  if (!titleOk) return false;
  if (!volume.trim()) return true;
  const v = volume.trim().replace(/[^\d]/g, "");
  if (!v) return true;
  return new RegExp(`(^|[^0-9])${v}([^0-9]|$)`).test(cand);
}

function pickMatch(items: Volume[], expected: string[], volume: string): Volume | null {
  for (const it of items) {
    const vi = it.volumeInfo;
    if (!vi?.imageLinks?.thumbnail && !vi?.imageLinks?.smallThumbnail) continue;
    const full = `${vi?.title ?? ""} ${vi?.subtitle ?? ""}`.trim();
    if (accepts(full, expected, volume)) return it;
  }
  return null;
}

const upgradeThumb = (url: string) =>
  url.replace(/^http:/, "https:").replace(/&zoom=\d+/, "&zoom=1").replace(/&edge=curl/, "");

async function search(key: string, q: string): Promise<Volume[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}`
    + `&maxResults=10&printType=books&country=TH&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Books: ${(j?.error?.message as string) || `HTTP ${res.status}`}`);
  return (j.items ?? []) as Volume[];
}

/** ชื่อการ์ตูน/หนังสือไทย → ชื่อต้นฉบับอังกฤษ/ญี่ปุ่น (คลัง Google มีฉบับ EN/JP มากกว่า) */
async function translateTitle(thai: string): Promise<string[]> {
  if (!openAiKey()) return [];
  try {
    const out = await chatJson(
      "คุณรู้จักชื่อการ์ตูน/นิยาย/หนังสือฉบับแปลไทยกับชื่อต้นฉบับ ตอบ JSON เท่านั้น "
      + '{"en":"<ชื่อภาษาอังกฤษที่ใช้ตีพิมพ์จริง>","ja":"<ชื่อต้นฉบับญี่ปุ่นถ้าเป็นการ์ตูน/นิยายญี่ปุ่น>"} '
      + "ถ้าไม่รู้จักเรื่องนี้จริง ๆ ให้ตอบค่าว่างทั้งคู่ ห้ามเดามั่ว",
      [{ type: "text", text: thai }], 120,
    );
    return [String((out as { en?: string }).en ?? ""), String((out as { ja?: string }).ja ?? "")]
      .map((s) => s.trim()).filter((s) => s.length >= 2);
  } catch { return []; }
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
  const { data: row } = await admin
    .from("book_library").select("id, title, series, volume, isbn").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ found: false, r2_key: null, matched: null, error: "ไม่พบเล่มนี้ในคลัง" }, { status: 200 });

  const title  = String(row.title ?? "");
  const series = String(row.series ?? "").trim();
  const volume = String(row.volume ?? "").trim();
  const isbn   = String(row.isbn ?? "").replace(/[^0-9Xx]/g, "");
  // ชื่อหลักที่ใช้ค้น: มีชุดใช้ชุด (ตัด "เล่ม N" ออกจากชื่อเรื่องแล้ว) ไม่มีก็ใช้ชื่อเรื่อง
  const base = series || title.replace(/\s*(เล่ม|vol\.?|volume)\s*\d+\s*$/i, "").trim();

  try {
    let hit: Volume | null = null;
    let expected: string[] = [base, title];

    if (isbn.length >= 10) {
      hit = pickMatch(await search(key, `isbn:${isbn}`), expected, "");   // ISBN ตรงเล่มอยู่แล้ว ไม่ต้องเช็กเลขเล่ม
    }
    if (!hit && base) {
      hit = pickMatch(await search(key, `intitle:"${base}"${volume ? ` ${volume}` : ""}`), expected, volume);
    }
    // ชื่อไทยมักไม่มีในคลัง Google → ลองชื่อต้นฉบับ EN/JP
    if (!hit && THAI.test(base)) {
      const alts = await translateTitle(base);
      expected = [...expected, ...alts];
      for (const alt of alts) {
        hit = pickMatch(await search(key, `intitle:"${alt}"${volume ? ` ${volume}` : ""}`), expected, volume);
        if (hit) break;
      }
    }
    if (!hit) return NextResponse.json({ found: false, r2_key: null, matched: null, error: null });

    const link = hit.volumeInfo?.imageLinks?.thumbnail ?? hit.volumeInfo?.imageLinks?.smallThumbnail;
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
      matched: String(hit.volumeInfo?.title ?? ""), error: null,
    });
  } catch (e) {
    return NextResponse.json({ found: false, r2_key: null, matched: null, error: (e as Error).message ?? "หารูปปกไม่สำเร็จ" }, { status: 200 });
  }
}
