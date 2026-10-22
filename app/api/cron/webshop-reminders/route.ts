/**
 * /api/cron/webshop-reminders — 🔔 รอบเตือนลืมของในตะกร้า + แจ้งของที่ถูกใจลดราคา (ทุกร้านที่เปิดไว้)
 *
 * ปกติไม่ต้องเรียก — ระบบรันเองระหว่างทาง (ลูกค้าเข้าเว็บ / พนักงานเปิดแท็บออเดอร์ · ห่างกัน ≥ 30 นาที/ร้าน)
 * เพราะ Vercel Hobby ตั้ง cron ได้ 2 ตัว (ใช้ครบแล้ว) · เส้นนี้ไว้ให้ตัวตั้งเวลาภายนอก/กดทดสอบ
 * เรียกได้ 2 ทาง: CRON_SECRET (Authorization: Bearer …) · คนมีสิทธิ์ products.edit
 * ?shop=<slug> = เฉพาะร้านเดียว · กันส่งซ้ำอยู่ในตัว (เรียกซ้ำได้ปลอดภัย) — lib/webshop-reminders-db
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { isTrustedCron } from "@/lib/cron-auth";
import { runWebshopReminders } from "@/lib/webshop-reminders-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isTrustedCron(request)) {
    const denied = await guardApi(request, "products.edit");
    if (denied) return denied;
  }
  const sb = supabaseAdmin();
  const slug = (request.nextUrl.searchParams.get("shop") ?? "").trim();
  let shopId: string | undefined;
  if (slug) {
    const { data } = await sb.from("shops").select("id").eq("slug", slug).maybeSingle();
    if (!data) return NextResponse.json({ ok: false, error: "ไม่พบร้าน" }, { status: 404 });
    shopId = (data as { id: string }).id;
  }
  const results = await runWebshopReminders(sb, { shopId });
  return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
}
