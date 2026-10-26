/**
 * /api/app-icon/<appKey>?s=<ขนาด>&m=1 — รูปไอคอนแอป PNG จัตุรัส (ของกลาง · lib/app-branding)
 * สาธารณะ: มือถือ/เบราว์เซอร์ต้องดึงไอคอนได้ตอนติดตั้งแอป (ไม่มีข้อมูลลับ) · m=1 = แบบ maskable (เผื่อขอบ)
 * d=1 = ไอคอนตั้งต้นของแอป (ไว้พรีวิวตอนจะกด "ใช้ไอคอนตั้งต้น")
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { APP_KEY_RE, nearestIconSize } from "@/lib/app-branding";
import { appIconResponse } from "@/lib/app-branding-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ appKey: string }> }): Promise<Response> {
  const { appKey } = await params;
  if (!APP_KEY_RE.test(appKey)) return NextResponse.json({ error: "invalid appKey" }, { status: 400 });
  const sp = new URL(request.url).searchParams;
  return appIconResponse(supabaseAdmin(), appKey, nearestIconSize(sp.get("s")), sp.get("m") === "1", sp.get("d") === "1");
}
