/**
 * ไลน์บริษัท รอบ 3 — หน้าเล็กของพนักงานในไลน์ (เงินเดือน / ใบเตือน / งานเหมา)
 * POST { id_token, page, slip_id? } — ไม่ต้องล็อกอิน ERP: ตัวตนมาจาก id_token ของ LINE ที่ตรวจใหม่ทุกครั้ง · lib/line-self-view-server.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { lineSelfView } from "@/lib/line-self-view-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ data: null, error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  try {
    return NextResponse.json({ data: await lineSelfView(body), error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ กรุณาลองใหม่" }, { status: 400 });
  }
}
