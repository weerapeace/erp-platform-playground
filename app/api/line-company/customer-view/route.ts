/**
 * ไลน์บริษัท รอบ 4 — หน้าเล็กของลูกค้าในไลน์ (เช็คสถานะงาน / ตารางส่งงาน)
 * POST { id_token, page } — ไม่ต้องล็อกอิน ERP: ร้านมาจาก id_token ของ LINE ที่ตรวจใหม่ทุกครั้ง · ไม่มีราคา · lib/line-customer-view-server.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { lineCustomerView } from "@/lib/line-customer-view-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ data: null, error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  try {
    return NextResponse.json({ data: await lineCustomerView(body), error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ กรุณาลองใหม่" }, { status: 400 });
  }
}
