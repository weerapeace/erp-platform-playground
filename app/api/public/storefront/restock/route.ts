/**
 * API สาธารณะ — 🔔 "แจ้งฉันเมื่อมีของ" : POST /api/public/storefront/restock
 *
 * body: { shop, productId | dropId, option?, contactType: "email"|"phone"|"line", contact, name?, lang?:"th"|"en" }  (🌐 lang = ภาษาที่ร้านใช้ตอบกลับ)
 *   → { ok:true, already?:true } · รับเฉพาะสินค้าที่เผยแพร่ของร้านนั้น และตั้ง "สินค้าหมด" อยู่
 *   🆕 dropId = ชุดมาใหม่ที่ยังไม่เปิด ("แจ้งฉันตอนเปิดขาย") · ตรวจเป้าหมายที่ lib/website-restock-db
 *   ร้านเปิด "แจ้งอัตโนมัติ" (restock_auto_enabled) = ฝากอีเมลแล้วระบบส่งเองตอนมีของ/เปิดขาย (lib/webshop-reminders-db)
 * เก็บลง store_restock_requests (ฝากซ้ำขณะรอ = ไม่เพิ่มแถว) · ร้านดู/ติ๊กแจ้งแล้วที่ ERP (/api/website/restock)
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา (ลูกค้าไม่ได้ล็อกอิน) + CORS · ตรวจค่า lib/website-restock · จำกัดรอได้ 30 รายการต่อช่องทาง/ร้าน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { normalizeRestockInput } from "@/lib/website-restock";
import { customerLang } from "@/lib/customer-messages";
import { storefrontCors, corsPreflight, corsJson } from "@/lib/storefront-cors";
import { activeShopBySlug } from "@/lib/website-shop";
import { resolveRestockTarget } from "@/lib/website-restock-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = storefrontCors("POST");

export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}

const json = corsJson(CORS);

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { shop?: string; productId?: string; dropId?: string; option?: string; contactType?: string; contact?: string; name?: string; lang?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, 400);
  }
  // 🔒 กันยิงรัว (lib/rate-limit · audit 2026-10-21)
  const limited = await overLimit(request, [{ name: "restock:ip", limit: 10, windowSec: 3600 }], body.lang);
  if (limited) return json({ ok: false, error: limited }, 429);
  const slug = String(body.shop ?? "").trim();
  if (!slug) return json({ ok: false, error: "ต้องระบุ shop" }, 400);
  const v = normalizeRestockInput(body);
  if (!v.ok) return json({ ok: false, error: v.error }, 400);

  const sb = supabaseAdmin();
  const s = await activeShopBySlug(sb, slug);
  if (!s) return json({ ok: false, error: "ไม่พบร้าน" }, 404);

  const t = await resolveRestockTarget(sb, s.id, body);
  if (!t.ok) return json({ ok: false, error: t.error }, t.status);

  // กันยิงถี่: ช่องทางเดียวกันรอได้ไม่เกิน 30 รายการต่อร้าน
  const { count } = await sb
    .from("store_restock_requests")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", s.id)
    .eq("contact_type", v.input.contactType)
    .eq("contact", v.input.contact)
    .eq("status", "pending");
  if ((count ?? 0) >= 30) return json({ ok: false, error: "ฝากไว้หลายรายการแล้ว ร้านจะติดต่อกลับเมื่อมีของ" }, 429);

  const { error } = await sb.from("store_restock_requests").insert({
    shop_id: s.id,
    ...t.target,
    option_label: t.target.drop_id ? null : v.input.option,
    contact_type: v.input.contactType,
    contact: v.input.contact,
    name: v.input.name,
    lang: customerLang(body.lang),
  });
  if (error) {
    if (error.code === "23505") return json({ ok: true, already: true });   // ฝากซ้ำ = ถือว่าสำเร็จ
    console.error("[restock] insert", error.message);
    return json({ ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, 500);
  }
  return json({ ok: true });
}
