/**
 * GET /api/flow-map/notify — สถานะสดของแท็บ "แจ้งเตือน" ในแผนผังการทำงาน (/master/flow-map)
 * ตัวอ่านข้อมูลอยู่ที่ ../notify-live.ts · ทะเบียนเรื่องแจ้งเตือนอยู่ที่ lib/flow-map-notify.ts
 * ส่งแค่ "ตั้งแล้วไหม / นับได้เท่าไร" — ไม่ส่ง token / group id / channel id ออกไป · อ่านอย่างเดียว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { buildNotifyLive } from "../notify-live";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data, failed } = await buildNotifyLive(supabaseAdmin());
  return NextResponse.json({ data, failed, at: new Date().toISOString(), error: null });
}
