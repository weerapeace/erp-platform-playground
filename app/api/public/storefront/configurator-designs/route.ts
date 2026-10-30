/**
 * API สาธารณะ — แบบที่ลูกค้าออกแบบ (ตัวประกอบสินค้า) : /api/public/storefront/configurator-designs
 *
 * POST { shop, model, selections, pk? } → { ok:true, design:{ code, model, selections, total, leadDays, messages } }
 *      ระบบทำให้การเลือก "ถูกกติกา" + คิดราคาใหม่ฝั่งเซิร์ฟเวอร์เสมอ (lib/product-configurator) · รหัสแบบ XXXX-XXXX ให้ลูกค้าบอกร้าน/แชร์ลิงก์ ?design=
 * GET  ?shop=<slug>&code=<XXXX-XXXX> → { ok:true, design:{ code, model, selections, total, leadDays, status } }  (เปิดแบบเดิมกลับมาแก้ต่อ)
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา (ลูกค้าไม่ได้ล็อกอิน) + CORS · กันยิงรัวด้วย lib/rate-limit
 * ปลอดภัยเพราะ: รับเฉพาะรหัสช่อง/ตัวเลือกของทรงที่เปิดอยู่ (ทรงที่ปิด = ต้องมีรหัสพรีวิวถูก) · ราคาคิดใหม่ทุกครั้ง · 1 คำขอ = 1 แถว
 * ก้อน 4 (ใส่ตะกร้า → ออเดอร์) จะต่อจากแถว configurator_designs นี้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { storefrontCors, corsPreflight, corsJson } from "@/lib/storefront-cors";
import { activeShopBySlug } from "@/lib/website-shop";
import { verifyPreviewKey } from "@/lib/storefront-preview-key";
import { newDesignCode, normCode, normalizeSelection, priceOf } from "@/lib/product-configurator";
import { buildConfiguratorPayload, cleanSelectionInput, normDesignCode } from "@/lib/product-configurator-public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = storefrontCors("GET, POST");
export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}
const json = corsJson(CORS);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = await overLimit(request, [{ name: "configurator-design:ip", limit: 30, windowSec: 3600 }]);
  if (limited) return json({ ok: false, error: limited }, 429);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ ok: false, error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, 400); }

  const slug = String(body.shop ?? "").trim();
  const modelCode = normCode(body.model);
  if (!slug || !modelCode) return json({ ok: false, error: "ต้องระบุร้านและทรง" }, 400);
  const sb = supabaseAdmin();
  const shop = await activeShopBySlug<{ id: string; slug: string }>(sb, slug, "id, slug");
  if (!shop) return json({ ok: false, error: "ไม่พบร้าน" }, 404);

  const { data } = await buildConfiguratorPayload(sb, shop.id, { model: modelCode, includeInactive: verifyPreviewKey(shop.slug, body.pk) });
  if (!data || data.model.code !== modelCode) return json({ ok: false, error: "แบบสินค้านี้ยังไม่เปิดให้ออกแบบ" }, 404);

  const { selection, messages } = normalizeSelection(data, cleanSelectionInput(data, body.selections));
  const price = priceOf(data, selection);

  // รหัสสุ่ม 8 ตัว — ชนกัน (แทบไม่เกิด) = สุ่มใหม่ สูงสุด 5 ครั้ง
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newDesignCode();
    const { error } = await sb.from("configurator_designs").insert({
      shop_id: shop.id, model_id: data.model.id, code, selections: selection, total_price: price.total, lead_days: price.leadDays, status: "saved",
    });
    if (!error) {
      return json({ ok: true, design: { code, model: data.model.code, selections: selection, total: price.total, leadDays: price.leadDays, messages } }, 201);
    }
    if (error.code !== "23505") return json({ ok: false, error: "บันทึกแบบไม่สำเร็จ ลองใหม่อีกครั้ง" }, 500);
  }
  return json({ ok: false, error: "บันทึกแบบไม่สำเร็จ ลองใหม่อีกครั้ง" }, 500);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sp = new URL(request.url).searchParams;
  const slug = (sp.get("shop") ?? "").trim();
  const code = normDesignCode(sp.get("code"));
  if (!slug || !code) return json({ ok: false, error: "รหัสแบบไม่ถูกต้อง (8 ตัว เช่น ABCD-2345)" }, 400);
  const sb = supabaseAdmin();
  const shop = await activeShopBySlug<{ id: string; slug: string }>(sb, slug, "id, slug");
  if (!shop) return json({ ok: false, error: "ไม่พบร้าน" }, 404);
  const { data: row } = await sb.from("configurator_designs").select("code, model_id, selections, total_price, lead_days, status").eq("shop_id", shop.id).eq("code", code).maybeSingle();
  if (!row) return json({ ok: false, error: "ไม่พบแบบนี้" }, 404);
  const { data: model } = row.model_id ? await sb.from("configurator_models").select("code").eq("id", row.model_id).maybeSingle() : { data: null };
  return json({ ok: true, design: { code: row.code, model: model?.code ?? null, selections: row.selections ?? {}, total: Number(row.total_price) || 0, leadDays: Number(row.lead_days) || 0, status: row.status } });
}
