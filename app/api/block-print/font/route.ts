/**
 * 🧱 บล็อกพิมพ์ — ส่งไฟล์ฟอนต์ (TTF เต็ม) ให้หน้าเว็บแปลงข้อความเป็นเส้น
 * GET /api/block-print/font?family=Sarabun&weight=700 → ไฟล์ .ttf
 *   รับเฉพาะฟอนต์ในรายการ BLOCK_FONTS (lib/block-print-layout) · ดึงจาก Google Fonts ด้วย User-Agent เก่า (ได้ TTF ไฟล์เดียว ไม่แบ่งชุดอักษร)
 *   เหมือนวิธีของ lib/email-report/image.ts · จำไว้ในเครื่องเซิร์ฟเวอร์ + ให้เบราว์เซอร์จำ 30 วัน
 *   สิทธิ์ block_print.view หรือ embroidery.view (ไฟล์ปัก: พิมพ์ตัวหนังสือ)
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { findBlockFont } from "@/lib/block-print-layout";
import { bad, VIEW_PERM } from "../_shared";

export const dynamic = "force-dynamic";

const cache = new Map<string, Promise<ArrayBuffer>>();

async function fetchTtf(family: string, weight: number): Promise<ArrayBuffer> {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weight}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" },
  }).then((r) => (r.ok ? r.text() : ""));
  const url = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/)?.[1];
  if (!url) throw new Error("no ttf");
  const res = await fetch(url);
  if (!res.ok) throw new Error("ttf fetch");
  return res.arrayBuffer();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ไฟล์ปักใช้ฟอนต์ชุดเดียวกัน (พิมพ์ตัวหนังสือ → ฝีปัก) → สิทธิ์ embroidery.view ก็โหลดได้
  const denied = await guardApi(request, VIEW_PERM); if (denied && !(await apiCan(request, "embroidery.view"))) return denied;
  const q = new URL(request.url).searchParams;
  const font = findBlockFont(q.get("family") ?? "");
  if (!font) return bad("ไม่มีฟอนต์นี้ในรายการ", 404);
  const want = Number(q.get("weight"));
  const weight = font.weights.includes(want) ? want : font.weights[0];
  const key = `${font.family}@${weight}`;
  let p = cache.get(key);
  if (!p) {
    p = fetchTtf(font.family, weight);
    p.catch(() => cache.delete(key));   // พลาด = ครั้งหน้าลองใหม่
    cache.set(key, p);
  }
  try {
    const buf = await p;
    return new NextResponse(buf, { headers: { "Content-Type": "font/ttf", "Cache-Control": "private, max-age=2592000" } });
  } catch {
    return bad("โหลดฟอนต์ไม่สำเร็จ ลองใหม่อีกครั้ง", 502);
  }
}
