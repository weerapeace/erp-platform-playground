/**
 * POST /api/tiktok-shop/webhook — ตัวรับแจ้งเตือนจาก TikTok Shop (ตั้ง URL นี้ใน Partner Center › Webhooks)
 *   ตอนนี้ใช้กับแชทลูกค้า: type 14 NEW_MESSAGE / 13 NEW_CONVERSATION → สั่งดึงแชทของร้านนั้นทันที (ไม่ต้องรอรอบ 3 นาที)
 *   - ตรวจลายเซ็นหัว Authorization ก่อนเสมอ (lib/tiktok-shop ttsVerifyWebhook) — ไม่ผ่าน = 401 ไม่ทำอะไร
 *   - ตอบ 200 ทันที (TikTok ให้ ≤3 วิ · ไม่ตอบจะส่งซ้ำ 4 ครั้ง) แล้วดึงใน after()
 *   - ร้านต้องติ๊ก "รับแชท" ในตั้งค่าห้องแชทก่อน · ข้อความซ้ำไม่บันทึกซ้ำ (รหัสข้อความ)
 *   ประเภทอื่น (ออเดอร์ ฯลฯ) = ตอบ 200 แล้วไม่ทำอะไร (ยังไม่ใช้)
 */
import { after, NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ttsVerifyWebhook } from "@/lib/tiktok-shop";
import { enabledShops, runShopChatSync } from "@/lib/chat/shop-sync";
import { platformIdOf } from "@/lib/chat/shop-common";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CHAT_TYPES = new Set([13, 14]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await request.text();
  if (!(await ttsVerifyWebhook(raw, request.headers.get("authorization")))) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }
  let body: { type?: number; shop_id?: string | number } = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  if (!CHAT_TYPES.has(Number(body.type))) return NextResponse.json({ ok: true });
  const shopId = String(body.shop_id ?? "");

  after(async () => {
    try {
      const admin = supabaseAdmin();
      const pf = await platformIdOf(admin, "tiktok");
      if (!pf || !shopId) return;
      // ร้าน TikTok นี้เป็นของแบรนด์ไหน (meta.shops[].id ของกุญแจที่เชื่อมไว้)
      const { data } = await admin.from("platform_credentials").select("brand_id, meta").eq("platform_id", pf);
      const brandId = ((data ?? []) as { brand_id: string; meta: { shops?: { id?: string }[] } | null }[])
        .find((r) => (r.meta?.shops ?? []).some((s) => String(s.id ?? "") === shopId))?.brand_id;
      if (!brandId) return;
      const on = (await enabledShops(admin)).find((s) => s.channel === "tiktok" && s.brandId === brandId);
      if (!on) return;
      await runShopChatSync(admin, { budgetMs: 25_000, force: true, only: [on] });
    } catch (e) { console.error("[tiktok-shop/webhook] chat", e instanceof Error ? e.message : e); }
  });
  return NextResponse.json({ ok: true });
}
