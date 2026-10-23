/**
 * API สาธารณะ — ✉️ ฟอร์มติดต่อจากเว็บร้าน : POST /api/public/storefront/contact
 *
 * body: { shop, firstName, lastName?, email, phone?, topic?, message, lang?, page?, website? (กับดักบอท — คนจริงเว้นว่าง) }
 *   → { ok:true } · เก็บลง store_contact_messages (สถานะ "ใหม่") + แจ้งเตือนกระดิ่งในระบบ (กฎ storefront_contact.created)
 * ร้านดู/ตอบ ที่ ERP แท็บ 🏪 ข้อมูลร้าน › 📨 ข้อความลูกค้า
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา (ลูกค้าไม่ได้ล็อกอิน) + CORS · ตรวจค่า lib/website-contact
 * กันสแปม: ช่องกับดัก · อีเมลเดียวกันไม่เกิน 5 ข้อความ/ชั่วโมง · เครื่อง (IP แบบเข้ารหัส) ไม่เกิน 10 ข้อความ/ชั่วโมง · ร้านละไม่เกิน 300/วัน
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeContactInput } from "@/lib/website-contact";
import { notifyEvent } from "@/lib/board-notify";
import { storefrontCors, corsPreflight, corsJson } from "@/lib/storefront-cors";
import { activeShopBySlug } from "@/lib/website-shop";
import { clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = storefrontCors("POST");

export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}

const json = corsJson(CORS);

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, 400);
  }
  const en = body.lang === "en";
  const t = (th: string, e: string) => (en ? e : th);
  // 🪤 ช่องกับดัก (ซ่อนจากคน) มีค่า = บอท → ตอบว่าสำเร็จแต่ไม่บันทึก
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });

  const slug = String(body.shop ?? "").trim();
  if (!slug) return json({ ok: false, error: "ต้องระบุ shop" }, 400);
  const v = normalizeContactInput(body, { phoneRequired: body.phoneRequired === true });
  if (!v.ok) return json({ ok: false, error: v.error }, 400);

  const sb = supabaseAdmin();
  const s = await activeShopBySlug<{ id: string; name: string; slug: string }>(sb, slug, "id, name, slug");
  if (!s) return json({ ok: false, error: t("ไม่พบร้าน", "Shop not found") }, 404);

  const ip = clientIp(request);
  const ipHash = ip ? createHash("sha256").update(`${s.id}:${ip}`).digest("hex").slice(0, 32) : null;
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const tooMany = t("ส่งข้อความหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่", "Too many messages. Please wait a moment and try again.");

  const [byEmail, byIp, byShop] = await Promise.all([
    sb.from("store_contact_messages").select("id", { count: "exact", head: true }).eq("shop_id", s.id).eq("email", v.input.email).gte("created_at", hourAgo),
    ipHash ? sb.from("store_contact_messages").select("id", { count: "exact", head: true }).eq("shop_id", s.id).eq("ip_hash", ipHash).gte("created_at", hourAgo) : Promise.resolve({ count: 0 }),
    sb.from("store_contact_messages").select("id", { count: "exact", head: true }).eq("shop_id", s.id).gte("created_at", dayAgo),
  ]);
  if ((byEmail.count ?? 0) >= 5 || (byIp.count ?? 0) >= 10 || (byShop.count ?? 0) >= 300) return json({ ok: false, error: tooMany }, 429);

  const { data: row, error } = await sb
    .from("store_contact_messages")
    .insert({
      shop_id: s.id,
      first_name: v.input.firstName,
      last_name: v.input.lastName,
      email: v.input.email,
      phone: v.input.phone,
      topic: v.input.topic,
      message: v.input.message,
      lang: v.input.lang,
      page: v.input.page || null,
      ip_hash: ipHash,
      user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
    })
    .select("id")
    .maybeSingle();
  if (error || !row) {
    console.error("[contact] insert", error?.message);
    return json({ ok: false, error: t("ส่งข้อความไม่สำเร็จ กรุณาลองใหม่", "Couldn't send your message. Please try again.") }, 500);
  }

  // 🔔 กระดิ่งในระบบ (กฎ storefront_contact.created) — ล้มไม่กระทบการบันทึก
  const name = `${v.input.firstName} ${v.input.lastName}`.trim();
  await notifyEvent(sb, "storefront_contact.created", "store_contact_messages", (row as { id: string }).id, null, {
    shop_name: s.name,
    shop_slug: s.slug,
    name,
    email: v.input.email,
    topic: v.input.topic || "ทั่วไป",
    preview: v.input.message.slice(0, 80),
  });

  return json({ ok: true });
}
