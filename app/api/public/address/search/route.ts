/**
 * API สาธารณะ — ค้นที่อยู่ไทย : /api/public/address/search?q=<ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์>[&limit=10]
 *   → { results: [{ subdistrict, district, province, postal }] }
 * ใช้ที่: เว็บร้าน (หน้าชำระเงิน/ที่อยู่สมาชิก) — พิมพ์แล้วเลือก เติมอีก 3 ช่องให้เอง
 * ⚠️ ไม่มี guardApi โดยเจตนา (ข้อมูลสาธารณะ ไม่มีข้อมูลลูกค้า) + CORS + แคช 1 วัน
 * ของกลาง: lib/thai-address-search.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { searchThaiAddress } from "@/lib/thai-address-search";

// ไม่ตั้ง revalidate (คำค้นอยู่ใน query) — ให้ CDN แคชตาม Cache-Control แยกตาม URL แทน
export const dynamic = "force-dynamic";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: HEADERS });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit")) || 10));
  if (q.length < 2) return NextResponse.json({ results: [] }, { headers: HEADERS });
  return NextResponse.json({ results: searchThaiAddress(q, limit) }, { headers: HEADERS });
}
