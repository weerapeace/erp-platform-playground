/**
 * แม่แบบตารางขนาด (กรอกเป็นแถว) ของร้าน TikTok — ลิ้นชักสินค้าบนร้าน + หน้าลงฉบับร่าง (เจ้าของสั่ง 2026-11-13 "ทำ 1,2,4" ข้อ 2)
 *  GET  ?listing_id= | ?brand_id=  [&category_id=] [&fresh=1]   (products.platforms.view · อ่านอย่างเดียว)
 *       → { templates: (TtsSizeTemplate & { fits })[], truncated, error }   แม่แบบที่ใช้กับหมวดนี้ได้ขึ้นก่อน · แคช 10 นาที
 *  POST { listing_id | brand_id, category_id, name, measurement_type, unit_system?, table{ headers[{ id?, name }], rows[][] } }   (products.platforms.publish)
 *       → สร้างแม่แบบใหม่บน TikTok (Create Size Chart V2 · REUSABLE_TEMPLATE) — ยังไม่ผูกกับสินค้า (เลือกในฟอร์มแล้วกดบันทึกขึ้น TikTok อีกที)
 *       → { ok, template_id, warnings, error } · มีประวัติ (audit tiktok_size_chart_create) ทั้งสำเร็จ/ไม่สำเร็จ
 * กฎ: lib/tiktok-size-chart (planTiktokSizeTable — หน้าเว็บกับ API ใช้ตัวเดียวกัน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ttsCreateSizeChart, ttsErrorText } from "@/lib/tiktok-shop";
import { planTiktokSizeTable, sortSizeTemplatesFor, type TtsSizeTable } from "@/lib/tiktok-size-chart";
import { forgetSizeTemplates, ttsCategoryMeta, ttsShopFor, ttsSizeTemplates } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const categoryId = (sp.get("category_id") ?? "").trim() || null;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const shop = await ttsShopFor(supabaseAdmin(), { listingId: sp.get("listing_id"), brandId: sp.get("brand_id") }, user?.id ?? null);
  if (!shop.ok) return reply({ templates: null, error: shop.error }, shop.status);
  try {
    const r = await ttsSizeTemplates(shop.accessToken, shop.cipher, sp.get("fresh") === "1");
    return reply({ templates: sortSizeTemplatesFor(r.list, categoryId), truncated: r.truncated, error: null });
  } catch (e) {
    return reply({ templates: null, error: `ดึงแม่แบบตารางขนาดจาก TikTok ไม่ได้: ${ttsErrorText(e)}` }, 502);
  }
}

const tableOf = (v: unknown): TtsSizeTable | null => {
  const o = v && typeof v === "object" ? v as Record<string, unknown> : null;
  if (!o || !Array.isArray(o.headers) || !Array.isArray(o.rows)) return null;
  const headers = (o.headers as unknown[]).map((h) => { const x = (h && typeof h === "object" ? h : {}) as Record<string, unknown>; const id = String(x.id ?? "").trim(); return { id: id || null, name: String(x.name ?? "").trim() }; });
  const rows = (o.rows as unknown[]).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
  return { headers, rows };
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ ok: false, error: "invalid JSON" }, 400); }
  const categoryId = String(body.category_id ?? "").trim();
  const table = tableOf(body.table);
  if (!/^\d+$/.test(categoryId) || !table) return reply({ ok: false, error: "ข้อมูลไม่ครบ (หมวด + ตาราง)" }, 400);
  const admin = supabaseAdmin();
  const shop = await ttsShopFor(admin, { listingId: typeof body.listing_id === "string" ? body.listing_id : null, brandId: typeof body.brand_id === "string" ? body.brand_id : null }, user?.id ?? null);
  if (!shop.ok) return reply({ ok: false, error: shop.error }, shop.status);

  const meta = await ttsCategoryMeta(shop.accessToken, shop.cipher, categoryId);
  if (meta.rules?.sizeChartSupported === false) return reply({ ok: false, error: "หมวดนี้ TikTok ไม่รองรับตารางขนาด" }, 400);
  const plan = planTiktokSizeTable({
    categoryId, name: String(body.name ?? ""), measurementType: typeof body.measurement_type === "string" ? body.measurement_type : null,
    unitSystem: typeof body.unit_system === "string" ? body.unit_system : null, table,
  }, meta.rules?.size ?? null);
  if (plan.errors.length || !plan.body) return reply({ ok: false, error: plan.errors.join(" · ") }, 400);

  const audit = (m: Record<string, unknown>) => writeAudit(admin, {
    action: "create", entityType: "platform_catalog", entityId: typeof body.listing_id === "string" ? body.listing_id : null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { source: "tiktok_size_chart_create", brand_id: shop.brandId, category_id: categoryId, name: plan.body!.template_name, rows: plan.rows, columns: table.headers.length, ...m },
  });
  try {
    const id = await ttsCreateSizeChart(shop.accessToken, shop.cipher, plan.body);
    forgetSizeTemplates(shop.cipher);
    await audit({ ok: true, template_id: id, warnings: plan.warnings });
    return reply({ ok: true, template_id: id, name: plan.body.template_name, warnings: plan.warnings, error: null });
  } catch (e) {
    const error = `สร้างแม่แบบตารางขนาดบน TikTok ไม่สำเร็จ: ${ttsErrorText(e)}`;
    await audit({ ok: false, error, raw_error: (e as Error).message });
    return reply({ ok: false, error }, 502);
  }
}
